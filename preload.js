/**
 * ============================================================
 * Electron 浏览器 — 主窗口预加载脚本 (Preload Script)
 * ============================================================
 * 
 * 架构角色：主进程与渲染进程之间的安全桥梁
 * 
 * 运行环境：在渲染进程的 <webview> 外部页面加载前执行，
 *          但拥有 Node.js 能力（可访问 ipcRenderer）
 * 
 * 安全机制：
 *   - contextIsolation: true → 预加载脚本与页面 JS 运行在隔离的上下文
 *   - contextBridge.exposeInMainWorld → 只暴露白名单 API 到 window.electronAPI
 *   - 渲染进程（renderer.js）只能通过 electronAPI 调用，无法直接访问 ipcRenderer
 * 
 * API 分类：
 *   - 窗口控制：minimizeWindow, maximizeWindow, closeWindow
 *   - 标签管理：openNewWindow, openNewTab, onCreateNewTab
 *   - 开发工具：openDevTools, openWebviewDevTools
 *   - 网络监控：onNetworkLog, getResponseBody
 *   - 文件操作：showSaveDialog, showOpenDialog, downloadResource
 * 
 * 通信模式：
 *   - ipcRenderer.send → 单向发送（无需返回值）
 *   - ipcRenderer.invoke → 双向请求（Promise，等待主进程返回结果）
 *   - ipcRenderer.on → 监听主进程推送的消息
 * ============================================================
 */

const { contextBridge, ipcRenderer } = require('electron');

// 通过 contextBridge 将安全的 API 暴露到渲染进程的 window.electronAPI 对象上
contextBridge.exposeInMainWorld('electronAPI', {
    // ===== 窗口控制（单向 send，无需返回值） =====
    minimizeWindow: () => ipcRenderer.send('window-minimize'),
    maximizeWindow: () => ipcRenderer.send('window-maximize'),
    closeWindow: () => ipcRenderer.send('window-close'),

    // ===== 窗口和标签管理 =====
    /** 打开新的独立 BrowserWindow 窗口 */
    openNewWindow: (url) => ipcRenderer.send('new-window', url),
    /** 打开开发者工具（主窗口的 DevTools） */
    openDevTools: () => ipcRenderer.send('open-devtools'),
    /** 打开 webview 内嵌页面的 DevTools */
    openWebviewDevTools: (tabId) => ipcRenderer.send('open-webview-devtools', tabId),

    /**
     * 监听主窗口新建标签的推送
     * 当其他窗口通过 'open-new-tab' IPC 请求新建标签时触发
     * @param {Function} callback - 回调函数，参数为要打开的 URL
     */
    onCreateNewTab: (callback) => {
        ipcRenderer.on('create-new-tab', (event, url) => callback(url));
    },

    /** 在主窗口中新建标签页 */
    openNewTab: (url) => ipcRenderer.send('open-new-tab', url),

    /**
     * 监听网络日志推送
     * 主进程通过 safeSend('network-log', data) 推送网络请求数据
     * 数据包含请求的各个阶段：request → send → response → complete/error
     * @param {Function} callback - 回调函数，参数为网络日志数据对象
     */
    onNetworkLog: (callback) => {
        ipcRenderer.on('network-log', (event, data) => callback(data));
    },

    /**
     * 获取指定请求的响应体（双向 invoke/handle 模式）
     * 主进程通过 CDP 调试器获取响应体后返回
     * @param {string|number} requestId - webRequest 的请求 ID
     * @param {string} url - 请求 URL（用于 CDP requestId 映射查找）
     * @returns {Promise<{body: string, base64Encoded: boolean} | null>}
     */
    getResponseBody: (requestId, url) => ipcRenderer.invoke('get-response-body', requestId, url),

    /**
     * 显示保存文件对话框（原生系统对话框）
     * @param {Object} options - 对话框选项（title, defaultPath, filters 等）
     * @returns {Promise<{canceled: boolean, filePath: string}>}
     */
    showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),

    /**
     * 显示打开文件/目录对话框（原生系统对话框）
     * @param {Object} options - 对话框选项（title, properties 等）
     * @returns {Promise<{canceled: boolean, filePaths: string[]}>}
     */
    showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),

    /**
     * 下载指定 URL 的资源到本地文件
     * @param {string} url - 资源 URL
     * @param {string} filePath - 本地保存路径
     * @returns {Promise<{success: boolean, filePath: string}>}
     */
    downloadResource: (url, filePath) => ipcRenderer.invoke('download-resource', url, filePath),

    /**
     * webview 导航控制（参数为 webContentsId，由 WebView.vue 通过 getWebContentsId() 获取）
     */
    goBack: (webContentsId) => ipcRenderer.send('webview-go-back', webContentsId),
    goForward: (webContentsId) => ipcRenderer.send('webview-go-forward', webContentsId),
    refresh: (webContentsId) => ipcRenderer.send('webview-refresh', webContentsId),

    /**
     * 路径操作
     */
    joinPath: (...paths) => ipcRenderer.invoke('join-path', ...paths),
    ensureDir: (dirPath) => ipcRenderer.invoke('ensure-dir', dirPath),
    writeFile: (filePath, content) => ipcRenderer.invoke('write-file', filePath, content),

    /**
     * 切换开发者工具
     */
    toggleDevTools: () => ipcRenderer.send('toggle-devtools'),

    /**
     * 设置相关 API
     */
    selectFolder: () => ipcRenderer.invoke('select-folder'),
    updateProxy: (config) => ipcRenderer.send('update-proxy', config),

    /**
     * 在 webview 中执行脚本
     */
    executeScript: (webContentsId, script) => ipcRenderer.invoke('execute-script', webContentsId, script),

    /**
     * 请求URL获取内容
     */
    fetchUrl: (url) => ipcRenderer.invoke('fetch-url', url),

    /**
     * IPC事件监听
     */
    ipcRenderer: {
      on: (channel, callback) => ipcRenderer.on(channel, callback),
      removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback),
      send: (channel, ...args) => ipcRenderer.send(channel, ...args)
    },

    authLogin: (data) => ipcRenderer.invoke('auth-login', data),
    authRegister: (data) => ipcRenderer.invoke('auth-register', data),
    authMe: (token) => ipcRenderer.invoke('auth-me', token),
    authLogout: (token) => ipcRenderer.invoke('auth-logout', token),
    getMachineId: () => ipcRenderer.invoke('get-machine-id'),
    checkUpdate: () => ipcRenderer.invoke('check-update'),

    pointsBalance: (token) => ipcRenderer.invoke('points-balance', token),
    pointsDeduct: (data) => ipcRenderer.invoke('points-deduct', data),
    pointsDeductBatch: (data) => ipcRenderer.invoke('points-deduct-batch', data)
});
