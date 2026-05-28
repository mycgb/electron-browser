/**
 * ============================================================
 * Electron 浏览器 — 主进程 (Main Process)
 * ============================================================
 * 
 * 架构角色：Electron 应用的后台进程，负责：
 *   1. 创建和管理应用窗口（BrowserWindow）
 *   2. 通过 session.webRequest 拦截所有网络请求，推送给渲染进程
 *   3. 通过 CDP (Chrome DevTools Protocol) 调试器获取响应体
 *   4. 监听 IPC 消息，提供文件对话框、资源下载等原生能力
 * 
 * 数据流向：
 *   webview 网络请求 → session.webRequest 拦截 → safeSend('network-log') → preload.js 转发 → renderer.js 接收
 *   renderer.js 请求响应体 → ipcRenderer.invoke('get-response-body') → preload.js → CDP 查询 → 返回结果
 * 
 * 关键文件关系：
 *   main.js          ←→ preload.js          (主进程 ↔ 主窗口渲染进程的安全桥接)
 *   main.js          ←→ webview-preload.js   (通过 session.setPreloads 注入到 webview)
 *   main.js          →  index.html           (loadFile 加载)
 * ============================================================
 */

// ===== 引入 Electron 核心模块 =====
const { app, BrowserWindow, ipcMain, session, webContents, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { machineIdSync } = require('node-machine-id');

// ===== 全局状态 =====

/** @type {string} 机器唯一标识 */
let machineId = '';

/** @type {BrowserWindow} 主窗口实例 */
let mainWindow;

/** @type {Set} 已设置网络监控的 session 集合，防止重复注册 */
const monitoredSessions = new Set();

/** @type {Set} 已附加 CDP 调试器的 webContents 集合，防止重复附加 */
const monitoredContents = new Set();

/**
 * CDP 请求 ID 映射表
 * key: 请求 URL
 * value: [{ cdpRequestId, webContentsId, timestamp }]
 * 
 * 用途：webRequest 的 ID 和 CDP 的 requestId 不同，
 * 需要通过 URL 作为中间桥梁，将两者关联起来，
 * 以便后续通过 webRequest ID 查找对应的 CDP requestId 来获取响应体
 */
const cdpRequestIdMap = new Map();

/**
 * 响应体缓存
 * key: CDP requestId
 * value: { body, base64Encoded, webContentsId }
 * 
 * 在 Network.loadingFinished 事件时预缓存，
 * 限制 500 条以防止内存泄漏
 */
const responseBodyCache = new Map();

/** @type {string} 伪装的 User-Agent，模拟 Chrome 134 浏览器（匹配 Electron 35 内置 Chromium 版本） */
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

/**
 * 安全地向渲染进程发送消息
 * 防止窗口已销毁时调用 webContents.send 导致崩溃
 * 
 * @param {string} channel - IPC 通道名
 * @param {*} data - 要发送的数据
 */
function safeSend(channel, data) {
    try {
        if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
            mainWindow.webContents.send(channel, data);
        }
    } catch (e) {}
}

// ===== session.webRequest 网络监控 =====
// 通过 Electron 的 session.webRequest API 拦截请求生命周期的各个阶段，
// 将请求数据推送给渲染进程用于网络面板展示

/**
 * 为指定 session 设置网络请求监控
 * 拦截请求的 5 个阶段：请求前 → 发送头 → 响应开始 → 完成 → 错误
 * 
 * @param {Electron.Session} sess - 要监控的 session 实例
 */
function setupNetworkMonitoring(sess) {
    // 防止对同一个 session 重复注册
    if (monitoredSessions.has(sess)) return;
    monitoredSessions.add(sess);

    // 阶段1：请求发出前 — 捕获请求基本信息和 POST 请求体
    sess.webRequest.onBeforeRequest((details, callback) => {
        // 提取 POST/PUT 等请求的请求体
        let requestBody = null;
        if (details.uploadData && details.uploadData.length > 0) {
            requestBody = details.uploadData.map(item => {
                if (item.bytes) return item.bytes.toString('utf-8');  // 字节数据转字符串
                if (item.file) return `[文件: ${item.file}]`;         // 文件类型仅记录路径
                return '';
            }).join('');
        }

        // 推送请求数据到渲染进程
        safeSend('network-log', {
            type: 'request',
            id: details.id,
            url: details.url,
            method: details.method || 'GET',
            resourceType: details.resourceType,  // 如 xhr, document, script, image 等
            requestBody: requestBody,
            timestamp: Date.now()
        });
        // 不拦截，允许请求继续
        callback({ cancel: false });
    });

    // 阶段2：请求头发送前 — 捕获请求头，并注入自定义 User-Agent
    sess.webRequest.onBeforeSendHeaders((details, callback) => {
        safeSend('network-log', {
            type: 'send',
            id: details.id,
            url: details.url,
            method: details.method,
            requestHeaders: details.requestHeaders,
            timestamp: Date.now()
        });
        // 修改请求头：伪装 User-Agent
        callback({
            requestHeaders: {
                ...details.requestHeaders,
                'User-Agent': USER_AGENT
            }
        });
    });

    // 阶段3：响应开始 — 捕获状态码和响应头
    sess.webRequest.onResponseStarted((details) => {
        safeSend('network-log', {
            type: 'response',
            id: details.id,
            url: details.url,
            statusCode: details.statusCode,
            statusLine: details.statusLine,
            responseHeaders: details.responseHeaders,
            timestamp: Date.now()
        });
    });

    // 阶段4：请求完成 — 记录完成时间
    sess.webRequest.onCompleted((details) => {
        safeSend('network-log', {
            type: 'complete',
            id: details.id,
            url: details.url,
            timestamp: Date.now()
        });
    });

    // 阶段5：请求出错 — 记录错误信息
    sess.webRequest.onErrorOccurred((details) => {
        safeSend('network-log', {
            type: 'error',
            id: details.id,
            url: details.url,
            error: details.error,
            timestamp: Date.now()
        });
    });
}

// ===== CDP (Chrome DevTools Protocol) 调试器 =====
// session.webRequest 只能获取请求/响应的元数据，无法获取响应体内容。
// 因此通过 CDP 调试器的 Network.getResponseBody 命令来获取完整的响应体。
// 工作原理：
//   1. attach CDP debugger 到 webContents
//   2. 启用 Network 域
//   3. 监听 Network.requestWillBeSent 建立 URL → CDP requestId 映射
//   4. 监听 Network.loadingFinished 时预缓存响应体
//   5. 渲染进程请求时优先查缓存，缓存未命中则实时 CDP 查询

/**
 * 为 webContents 附加 CDP 调试器
 * 
 * @param {Electron.WebContents} contents - 要附加调试器的 webContents
 */
function attachCDP(contents) {
    if (contents.isDestroyed()) return;
    if (monitoredContents.has(contents)) return;
    monitoredContents.add(contents);

    try {
        // 附加 CDP 调试器（协议版本 1.3）
        if (!contents.debugger.isAttached()) {
            contents.debugger.attach('1.3');
        }

        // 注册 CDP 消息监听（必须在 Network.enable 之前注册，否则可能遗漏事件）
        contents.debugger.on('message', (event, method, params) => {
            // CDP 事件：请求即将发送 — 建立 URL → CDP requestId 的映射关系
            if (method === 'Network.requestWillBeSent') {
                const url = params.request.url;
                const entry = {
                    cdpRequestId: params.requestId,   // CDP 的请求 ID（与 webRequest 的 ID 不同）
                    webContentsId: contents.id,        // 关联的 webContents ID
                    timestamp: Date.now()
                };
                if (!cdpRequestIdMap.has(url)) {
                    cdpRequestIdMap.set(url, []);
                }
                const list = cdpRequestIdMap.get(url);
                list.push(entry);
                // 每个 URL 最多保留 10 条记录，防止同一 URL 重复请求导致内存泄漏
                if (list.length > 10) list.shift();
            }

            // CDP 事件：响应体加载完成 — 立即预缓存响应体
            if (method === 'Network.loadingFinished') {
                const cdpReqId = params.requestId;
                contents.debugger.sendCommand('Network.getResponseBody', {
                    requestId: cdpReqId
                }).then(result => {
                    responseBodyCache.set(cdpReqId, {
                        body: result.body,                        // 响应体内容（可能是 base64）
                        base64Encoded: result.base64Encoded || false,  // 是否 base64 编码
                        webContentsId: contents.id
                    });
                    // 限制缓存大小，最多 500 条，超出时删除最早的
                    if (responseBodyCache.size > 500) {
                        const firstKey = responseBodyCache.keys().next().value;
                        responseBodyCache.delete(firstKey);
                    }
                }).catch(() => {});
            }
        });

        // 启用 CDP Network 域，开始接收网络事件
        contents.debugger.sendCommand('Network.enable');
    } catch (err) {
        console.error('CDP attach failed:', err.message);
    }

    // webContents 销毁时清理对应的 CDP 映射数据
    contents.on('destroyed', () => {
        monitoredContents.delete(contents);
        for (const [url, entries] of cdpRequestIdMap) {
            const filtered = entries.filter(e => e.webContentsId !== contents.id);
            if (filtered.length === 0) {
                cdpRequestIdMap.delete(url);
            } else {
                cdpRequestIdMap.set(url, filtered);
            }
        }
    });
}

/**
 * 从 webContents 分离 CDP 调试器
 * 在打开 DevTools 前需要先分离，因为 CDP 和 DevTools 不能同时附加
 * 
 * @param {Electron.WebContents} contents - 要分离调试器的 webContents
 */
function detachCDP(contents) {
    if (contents.isDestroyed()) return;
    monitoredContents.delete(contents);
    try {
        contents.debugger.removeAllListeners('message');
        if (contents.debugger.isAttached()) {
            contents.debugger.detach();
        }
    } catch (err) {}
}

// ===== 窗口创建 =====

/**
 * 创建主浏览器窗口
 * - 无边框（frame: false），自定义标题栏
 * - 开启上下文隔离（contextIsolation: true）
 * - 加载 preload.js 作为主窗口的预加载脚本
 * - 启用 webview 标签（webviewTag: true）
 */
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        backgroundColor: '#2a2a3e',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true,
            webSecurity: true
        }
    });

    // 判断是否为开发模式
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
    
    if (isDev) {
        // 开发模式：加载 Vite 开发服务器
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools({ mode: 'bottom' });
    } else {
        // 生产模式：加载打包后的文件
        mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
    }
    
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
    mainWindow.webContents.on('render-process-gone', (event, details) => {
        console.error('[MainWindow] Render process gone:', details.reason, details.exitCode);
    });
}

// ===== WebContents 生命周期钩子 =====

/**
 * 监听所有 webContents 创建事件
 * 当 webview 标签创建时，自动为其设置网络监控、CDP 调试器和预加载脚本
 */
app.on('web-contents-created', (event, contents) => {
    if (contents.getType() === 'webview') {
        setupNetworkMonitoring(contents.session);
        attachCDP(contents);
        contents.session.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'webview-preload.js') });
    }
    
    // 右键菜单
    contents.on('context-menu', (e, params) => {
        e.preventDefault();
        const { x, y } = params;
        const isEditable = params.isEditable;
        const hasSelection = params.selectionText && params.selectionText.trim().length > 0;
        const linkURL = params.linkURL;
        
        const template = [];
        
        if (isEditable) {
            template.push({ label: '剪切', role: 'cut' });
            template.push({ label: '复制', role: 'copy' });
            template.push({ label: '粘贴', role: 'paste' });
            template.push({ label: '全选', role: 'selectAll' });
            template.push({ type: 'separator' });
        } else if (hasSelection) {
            template.push({ label: '复制', role: 'copy' });
        }
        
        if (linkURL) {
            template.push({ label: '在新标签页中打开链接', click: () => {
                mainWindow.webContents.send('create-new-tab', linkURL);
            }});
            template.push({ label: '复制链接地址', click: () => {
                contents.copy();
            }});
            template.push({ type: 'separator' });
        }
        
        if (template.length > 0) {
            template.push({ type: 'separator' });
        }
        
        template.push({ label: '← 返回', accelerator: 'Alt+Left', click: () => {
            if (contents.canGoBack()) contents.goBack();
        }});
        template.push({ label: '→ 前进', accelerator: 'Alt+Right', click: () => {
            if (contents.canGoForward()) contents.goForward();
        }});
        template.push({ label: '↻ 刷新', accelerator: 'F5', click: () => {
            contents.reload();
        }});
        template.push({ type: 'separator' });
        template.push({ label: '开发者工具', accelerator: 'F12', click: () => {
            contents.toggleDevTools();
        }});
        
        const menu = Menu.buildFromTemplate(template);
        menu.popup({ window: mainWindow, x, y });
    });
    
    contents.on('render-process-gone', (event, details) => {
        console.error('[WebContents] Render process gone:', details.reason, details.exitCode);
    });
});

// ===== 应用启动 =====

app.whenReady().then(() => {
    // 获取机器唯一标识
    machineId = machineIdSync();
    console.log('[App] Machine ID:', machineId);

    const webviewSession = session.fromPartition('persist:webview');
    webviewSession.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'webview-preload.js') });
    setupNetworkMonitoring(webviewSession);

    // 清除代理设置，确保启动时网络正常
    session.defaultSession.setProxy({ proxyRules: '' }).catch(err => {
        console.error('[App] Failed to clear proxy on startup:', err);
    });
    webviewSession.setProxy({ proxyRules: '' }).catch(err => {
        console.error('[App] Failed to clear webview proxy on startup:', err);
    });

    // 为主窗口默认 session 设置自定义 User-Agent
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
        callback({
            requestHeaders: {
                ...details.requestHeaders,
                'User-Agent': USER_AGENT
            }
        });
    });

    // 放宽 CSP 限制，允许 webview 正常加载各种资源
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        callback({
            responseHeaders: {
                ...details.responseHeaders,
                'Content-Security-Policy': [
                    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: http:; connect-src 'self' https: http:; frame-src 'self' https: http:;"
                ]
            }
        });
    });

    createWindow();

    // macOS 特性：点击 Dock 图标时如果没有窗口则重新创建
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 所有窗口关闭时退出应用（macOS 除外）
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// ===== IPC 通信处理 — 窗口控制 =====

/** 最小化主窗口 */
ipcMain.on('window-minimize', () => {
    mainWindow?.minimize();
});

/** 切换主窗口最大化/还原 */
ipcMain.on('window-maximize', () => {
    if (mainWindow?.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow?.maximize();
    }
});

/** 关闭主窗口 */
ipcMain.on('window-close', () => {
    mainWindow?.close();
});

// ===== IPC 通信处理 — 窗口和标签管理 =====

/**
 * 新建独立窗口
 * 创建一个全新的 BrowserWindow 实例，加载 index.html
 */
ipcMain.on('new-window', (event, url) => {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true
        }
    });
    win.loadFile('index.html');
});

/**
 * 在主窗口中新建标签页
 * 通知渲染进程创建新标签（通过 'create-new-tab' 通道）
 */
ipcMain.on('open-new-tab', (event, url) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('create-new-tab', url);
    }
});

/** 打开主窗口的 DevTools（调试浏览器 UI 本身） */
ipcMain.on('open-devtools', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.openDevTools();
    }
});

/**
 * 打开 webview 的 DevTools
 * 需要先分离 CDP 调试器（因为 CDP 和 DevTools 不能同时附加），
 * DevTools 关闭后再重新附加 CDP
 */
ipcMain.on('open-webview-devtools', (event, tabId) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        const allWC = webContents.getAllWebContents();
        for (const wc of allWC) {
            // 找到第一个加载 http 页面的 webContents（即 webview 内嵌页面）
            if (!wc.isDestroyed() && wc.getURL && wc.getURL().startsWith('http')) {
                detachCDP(wc);           // 先分离 CDP
                wc.openDevTools();       // 打开 DevTools
                wc.once('devtools-closed', () => {
                    attachCDP(wc);       // DevTools 关闭后重新附加 CDP
                });
                break;
            }
        }
    }
});

// ===== IPC 通信处理 — 响应体获取（invoke/handle 双向模式） =====

/**
 * 按需获取指定请求的响应体
 * 
 * 查找策略：
 * 1. 优先通过 URL 在 cdpRequestIdMap 中查找 CDP requestId
 * 2. 先查预缓存 responseBodyCache（命中率高，速度快）
 * 3. 缓存未命中则实时通过 CDP Network.getResponseBody 获取
 * 4. 最后回退：尝试用 webRequest ID 直接作为 CDP requestId（某些 Electron 版本可能兼容）
 * 
 * @param {string|number} requestId - webRequest 的请求 ID
 * @param {string} url - 请求 URL（用于 CDP requestId 映射查找）
 * @returns {{ body: string, base64Encoded: boolean } | null}
 */
ipcMain.handle('get-response-body', async (event, requestId, url) => {
    // 策略1：通过 URL 查找 CDP requestId，再查缓存或实时获取
    if (url && cdpRequestIdMap.has(url)) {
        const entries = cdpRequestIdMap.get(url);
        // 从最新的条目开始尝试（同一 URL 可能有多次请求）
        for (let i = entries.length - 1; i >= 0; i--) {
            const entry = entries[i];

            // 先查预缓存（命中率最高）
            if (responseBodyCache.has(entry.cdpRequestId)) {
                const cached = responseBodyCache.get(entry.cdpRequestId);
                return {
                    body: cached.body,
                    base64Encoded: cached.base64Encoded
                };
            }

            // 缓存未命中，尝试实时通过 CDP 获取
            const allWC = webContents.getAllWebContents();
            for (const wc of allWC) {
                if (wc.isDestroyed() || !wc.debugger.isAttached()) continue;
                if (wc.id !== entry.webContentsId) continue;
                try {
                    const result = await wc.debugger.sendCommand('Network.getResponseBody', {
                        requestId: entry.cdpRequestId
                    });
                    return {
                        body: result.body,
                        base64Encoded: result.base64Encoded || false
                    };
                } catch (err) {
                    // 该条目不匹配，尝试下一个
                }
            }
        }
    }

    // 策略2（回退）：尝试用 webRequest ID 直接作为 CDP requestId
    // 在某些 Electron 版本中两者可能相同
    const allWC = webContents.getAllWebContents();
    for (const wc of allWC) {
        if (wc.isDestroyed() || !wc.debugger.isAttached()) continue;
        try {
            const result = await wc.debugger.sendCommand('Network.getResponseBody', {
                requestId: String(requestId)
            });
            return {
                body: result.body,
                base64Encoded: result.base64Encoded || false
            };
        } catch (err) {
            // 这个 webContents 没有该 requestId，继续尝试下一个
        }
    }
    return null;
});

// ===== IPC 通信处理 — 原生对话框 =====

/** 显示保存文件对话框 */
ipcMain.handle('show-save-dialog', async (event, options) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return await dialog.showSaveDialog(mainWindow, options);
    }
    return { canceled: true };
});

/** 显示打开文件/目录对话框 */
ipcMain.handle('show-open-dialog', async (event, options) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        return await dialog.showOpenDialog(mainWindow, options);
    }
    return { canceled: true };
});

// ===== IPC 通信处理 — 资源下载 =====

/**
 * 下载指定 URL 的资源到本地文件
 * 使用 Node.js 的 http/https 模块直接下载，支持 301/302 重定向
 * 
 * @param {string} url - 资源 URL
 * @param {string} filePath - 本地保存路径
 * @returns {{ success: boolean, filePath: string }}
 */
function downloadWithRedirect(url, filePath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filePath);
        
        protocol.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Accept': '*/*'
            }
        }, (response) => {
            if (response.statusCode === 301 || response.statusCode === 302) {
                const redirectUrl = response.headers.location;
                file.close();
                fs.unlink(filePath, () => {});
                downloadWithRedirect(redirectUrl, filePath).then(resolve).catch(reject);
                return;
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve({ success: true, filePath });
            });
        }).on('error', (err) => {
            fs.unlink(filePath, () => {});
            reject(err);
        });
    });
}

ipcMain.handle('download-resource', async (event, url, filePath) => {
    return downloadWithRedirect(url, filePath);
});

// ===== webview 导航控制 =====
// 通过 webContentsId 精确定位目标 webview，避免影响其他标签页
ipcMain.on('webview-go-back', (event, webContentsId) => {
    try {
        const contents = webContents.fromId(webContentsId)
        if (contents && contents.canGoBack()) {
            contents.goBack()
        }
    } catch (e) {
        console.error('goBack error:', e.message)
    }
});

ipcMain.on('webview-go-forward', (event, webContentsId) => {
    try {
        const contents = webContents.fromId(webContentsId)
        if (contents && contents.canGoForward()) {
            contents.goForward()
        }
    } catch (e) {
        console.error('goForward error:', e.message)
    }
});

ipcMain.on('webview-refresh', (event, webContentsId) => {
    try {
        const contents = webContents.fromId(webContentsId)
        if (contents) {
            contents.reload()
        }
    } catch (e) {
        console.error('refresh error:', e.message)
    }
});

// ===== 路径操作 =====
ipcMain.handle('join-path', (event, ...paths) => {
    return path.join(...paths);
});

ipcMain.handle('ensure-dir', async (event, dirPath) => {
    try {
        await fs.promises.mkdir(dirPath, { recursive: true });
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('write-file', async (event, filePath, content) => {
    try {
        await fs.promises.writeFile(filePath, content, 'utf8');
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ===== 切换开发者工具 =====
ipcMain.on('toggle-devtools', () => {
    if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
        } else {
            mainWindow.webContents.openDevTools({ mode: 'bottom' });
        }
    }
});

// ===== 设置相关 IPC =====
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });
    if (result.canceled) return null;
    return result.filePaths[0];
});

ipcMain.on('update-proxy', (event, config) => {
    console.log('[Proxy] Updating proxy config:', JSON.stringify(config));
    if (config && config.enabled && config.host && config.port) {
        const proxyUrl = config.protocol === 'socks5'
            ? `socks5://${config.user ? config.user + ':' + config.pass + '@' : ''}${config.host}:${config.port}`
            : `${config.protocol}://${config.user ? config.user + ':' + config.pass + '@' : ''}${config.host}:${config.port}`;
        console.log('[Proxy] Setting proxy:', proxyUrl);
        session.defaultSession.setProxy({ proxyRules: proxyUrl });
    } else {
        console.log('[Proxy] Clearing proxy settings');
        session.defaultSession.setProxy({ proxyRules: '' }).then(() => {
            console.log('[Proxy] Proxy cleared successfully');
        }).catch(err => {
            console.error('[Proxy] Failed to clear proxy:', err);
        });
    }
});

// ===== 在 webview 中执行脚本 =====
ipcMain.handle('execute-script', async (event, webContentsId, script) => {
    try {
        const wc = webContents.fromId(webContentsId);
        if (!wc || wc.isDestroyed()) {
            throw new Error('WebContents not found or destroyed');
        }
        const result = await wc.executeJavaScript(script);
        return result;
    } catch (error) {
        console.error('[execute-script] Error:', error);
        throw error;
    }
});

// ===== 请求URL获取内容 =====
ipcMain.handle('fetch-url', async (event, url) => {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, {
            headers: {
                'User-Agent': USER_AGENT,
                'Referer': 'https://detail.1688.com/'
            }
        }, (res) => {
            let data = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => { resolve(data); });
        }).on('error', (err) => {
            console.error('[fetch-url] Error:', err);
            reject(err.message);
        });
    });
});

// ===== webview页面加载完成事件转发 =====
ipcMain.on('webview-did-finish-load', (event, webContentsId) => {
    BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('webview-did-finish-load', webContentsId);
    });
});

// PHP 后端地址
const API_BASE = 'https://login.xixidown.cn';

// ===== 认证 API =====
ipcMain.handle('auth-login', async (event, data) => {
    return await apiRequest('/users.php?action=login', 'POST', data);
});

ipcMain.handle('get-machine-id', () => {
    return machineId;
});

ipcMain.handle('auth-register', async (event, data) => {
    const registerData = { ...data, machineId };
    return await apiRequest('/users.php?action=register', 'POST', registerData);
});

ipcMain.handle('auth-me', async (event, token) => {
    return await apiRequest('/users.php?action=me', 'GET', null, token);
});

ipcMain.handle('check-update', async () => {
    return await apiRequest('/version.php', 'GET');
});

ipcMain.handle('auth-logout', async (event, token) => {
    return await apiRequest('/users.php?action=logout', 'POST', null, token);
});

// ===== 点数 API =====
ipcMain.handle('points-balance', async (event, token) => {
    return await apiRequest('/points.php?action=balance', 'GET', null, token);
});

ipcMain.handle('points-deduct', async (event, { token, url, platform, amount }) => {
    return await apiRequest('/points.php?action=deduct', 'POST', { url, platform, amount: amount || 1 }, token);
});

ipcMain.handle('points-deduct-batch', async (event, { token, urls }) => {
    return await apiRequest('/points.php?action=deduct-batch', 'POST', { urls }, token);
});

/**
 * 通用 API 请求
 */
async function apiRequest(path, method = 'GET', body = null, token = null, redirectCount = 0) {
    const maxRedirects = 5;
    return new Promise((resolve) => {
        const url = new URL(path, API_BASE);
        const isHttps = url.protocol === 'https:';
        const client = isHttps ? https : http;
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'ElectronApp/1.0 (Desktop Client)'
        };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        const bodyStr = body ? JSON.stringify(body) : null;
        if (bodyStr) {
            headers['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const req = client.request(url, { method, headers, rejectUnauthorized: false }, (res) => {
            if (res.statusCode >= 301 && res.statusCode <= 308 && res.headers.location) {
                if (redirectCount >= maxRedirects) {
                    resolve({ success: false, error: '重定向次数过多' });
                    return;
                }
                let redirectUrl = res.headers.location;
                if (redirectUrl.startsWith('/')) {
                    redirectUrl = url.protocol + '//' + url.host + redirectUrl;
                }
                apiRequest(redirectUrl, method, body, token, redirectCount + 1).then(resolve);
                return;
            }

            let chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString();
                try {
                    const data = JSON.parse(raw);
                    resolve(data);
                } catch (e) {
                    resolve({ success: false, error: `服务器响应异常 [${res.statusCode}]: ` + raw.substring(0, 200) });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ success: false, error: '无法连接到服务器 (' + err.message + ')，请确认服务器在线' });
        });

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}
