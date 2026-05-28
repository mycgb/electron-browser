/**
 * ============================================================
 * Electron 浏览器 — 渲染进程 (Renderer Process)
 * ============================================================
 * 
 * 架构角色：浏览器 UI 的核心逻辑，运行在渲染进程中
 * 
 * 运行环境：加载在 index.html 中的 <script> 标签内，
 *          没有直接的 Node.js 访问权限（nodeIntegration: false），
 *          只能通过 window.electronAPI（由 preload.js 暴露）与主进程通信
 * 
 * 功能模块：
 *   1. DOM 元素引用 — 获取页面中所有需要操作的元素
 *   2. 全局状态 — 标签数据、网络请求数据、书签等
 *   3. IPC 监听 — 接收主进程推送的网络日志和新标签请求
 *   4. 标签管理 — 创建、切换、关闭标签页
 *   5. Webview 事件 — 监听页面加载、导航、标题更新等
 *   6. 导航功能 — 地址栏、前进/后退/刷新/主页
 *   7. 网络监控面板 — 请求列表、筛选、详情展示
 *   8. 响应体获取 — 通过 IPC 调用主进程的 CDP 查询
 *   9. 资源下载 — 单个/批量下载图片和媒体资源
 *   10. 书签管理 — 添加/移除书签，localStorage 持久化
 *   11. 快捷键 — Ctrl+R/L/T/W/D, F5, F12, Shift+F12
 *   12. 面板拖拽 — 网络面板上下拖拽调整大小
 * ============================================================
 */

// ===== 1. DOM 元素引用 =====
// 一次性获取所有需要操作的 DOM 元素，避免重复查询

// 标签栏相关
const tabsWrapper = document.getElementById('tabs-wrapper');       // 标签列表容器
const newTabBtn = document.getElementById('new-tab-btn');          // 新建标签按钮

// 导航栏相关
const urlInput = document.getElementById('url-input');             // 地址栏输入框
const backBtn = document.getElementById('back-btn');               // 后退按钮
const forwardBtn = document.getElementById('forward-btn');         // 前进按钮
const refreshBtn = document.getElementById('refresh-btn');         // 刷新按钮
const homeBtn = document.getElementById('home-btn');               // 主页按钮
const goBtn = document.getElementById('go-btn');                   // 前往按钮
const statusText = document.getElementById('status-text');         // 状态栏文本
const securityIcon = document.getElementById('security-icon');     // HTTPS/HTTP 安全图标

// 菜单和书签
const menuBtn = document.getElementById('menu-btn');               // 菜单按钮
const menuDropdown = document.getElementById('menu-dropdown');     // 菜单下拉面板
const bookmarkBtn = document.getElementById('bookmark-btn');       // 书签按钮

// 浏览器内容区
const browserWrapper = document.getElementById('browser-wrapper'); // webview 容器

// 网络监控面板
const networkPanel = document.getElementById('network-panel');             // 网络面板
const networkTableBody = document.getElementById('network-table-body');     // 请求列表 tbody
const networkCount = document.getElementById('network-count');             // 请求计数
const networkFilterInput = document.getElementById('network-filter-input'); // URL 筛选框
const networkTypeTabs = document.getElementById('network-type-tabs');       // 类型标签页

// 网络详情面板
const networkDetail = document.getElementById('network-detail');           // 详情面板
const detailTitle = document.getElementById('detail-title');               // 详情标题
const detailHeaders = document.getElementById('detail-headers');           // Headers 内容
const detailParams = document.getElementById('detail-params');             // Params 内容
const detailResponse = document.getElementById('detail-response');         // Response 内容
const detailTabs = document.getElementById('detail-tabs');                 // 详情标签页
const downloadResourceBtn = document.getElementById('download-resource-btn'); // 下载资源按钮
const detailContent = document.getElementById('detail-content');           // 详情内容容器

// 拖拽分割
const resizeHandle = document.getElementById('resize-handle');     // 拖拽手柄
const mainContent = document.getElementById('main-content');       // 主内容区

// 下载面板
const downloadsPanel = document.getElementById('downloads-panel');                 // 下载面板
const downloadsTableBody = document.getElementById('downloads-table-body');         // 下载列表 tbody
const downloadsFilterInput = document.getElementById('downloads-filter-input');     // 下载筛选框
const downloadsTypeFilter = document.getElementById('downloads-type-filter');       // 下载类型筛选
const selectAllDownloads = document.getElementById('select-all-downloads');         // 全选复选框

// ===== 2. 全局状态 =====

const HOME_PAGE = 'https://www.baidu.com';  // 默认主页

/** @type {Array} 所有标签页数据 */
let tabs = [];

/** @type {number|null} 当前激活的标签页 ID */
let activeTabId = null;

/** @type {number} 标签页 ID 自增计数器 */
let tabIdCounter = 0;

/** @type {Array} 书签列表，从 localStorage 加载 */
let bookmarks = JSON.parse(localStorage.getItem('bookmarks') || '[]');

/** @type {Object} 网络请求数据，key 为请求 ID，value 为请求信息对象 */
let networkRequests = {};

/** @type {string} 网络面板当前激活的类型过滤 */
let networkActiveType = 'all';

/** @type {string|null} 当前选中的网络请求 ID */
let selectedRequestId = null;

/** @type {Set<string>} 下载面板中选中的资源 ID 集合 */
let selectedDownloads = new Set();

// ===== 3. IPC 监听 — 接收主进程推送 =====

/**
 * 监听主进程的 'create-new-tab' 事件
 * 当其他窗口请求在主窗口新建标签时触发
 */
if (window.electronAPI && window.electronAPI.onCreateNewTab) {
    window.electronAPI.onCreateNewTab((url) => {
        createTab(url);
    });
}

/**
 * 监听主进程推送的网络日志
 * 
 * 数据流：webview 请求 → session.webRequest 拦截 → main.js safeSend('network-log')
 *       → preload.js ipcRenderer.on('network-log') → renderer.js 此回调
 * 
 * 请求生命周期：
 *   request (请求发出) → send (发送头) → response (响应开始) → complete (完成) / error (错误)
 */
if (window.electronAPI && window.electronAPI.onNetworkLog) {
    window.electronAPI.onNetworkLog((data) => {
        if (data.type === 'request') {
            // 新请求：创建请求记录
            networkRequests[data.id] = {
                id: data.id,
                url: data.url,
                method: data.method,
                type: data.resourceType,
                status: 'pending',            // 初始状态为 pending
                startTime: data.timestamp,
                requestTime: data.timestamp,
                requestBody: data.requestBody || null
            };
            updateNetworkPanel();
        } else if (data.type === 'send') {
            // 请求头发送：补充请求头数据
            if (networkRequests[data.id]) {
                networkRequests[data.id].requestHeaders = data.requestHeaders;
            }
        } else if (data.type === 'response') {
            // 响应开始：更新状态码、响应头、耗时
            if (networkRequests[data.id]) {
                networkRequests[data.id].status = data.statusCode;
                networkRequests[data.id].statusCode = data.statusCode;
                networkRequests[data.id].statusLine = data.statusLine;
                networkRequests[data.id].responseTime = data.timestamp;
                networkRequests[data.id].totalTime = data.timestamp - networkRequests[data.id].startTime;
                networkRequests[data.id].responseHeaders = data.responseHeaders;
            }
            updateNetworkPanel();
        } else if (data.type === 'complete') {
            // 请求完成：计算总耗时
            if (networkRequests[data.id]) {
                networkRequests[data.id].completeTime = data.timestamp;
                networkRequests[data.id].totalTime = data.timestamp - networkRequests[data.id].startTime;
            }
            updateNetworkPanel();
        } else if (data.type === 'error') {
            // 请求错误
            if (networkRequests[data.id]) {
                networkRequests[data.id].status = 'error';
                networkRequests[data.id].error = data.error;
            }
            updateNetworkPanel();
        }
    });
}

// ===== 4. 标签管理 =====

/** 生成唯一标签页 ID */
function generateTabId() {
    return ++tabIdCounter;
}

/**
 * 创建新标签页
 * 
 * 流程：
 * 1. 生成唯一 tabId
 * 2. 创建标签 DOM 元素（favicon + 标题 + 关闭按钮）
 * 3. 创建 webview 容器和 <webview> 元素
 * 4. 注册 webview 事件监听
 * 5. 注册标签点击/关闭事件
 * 6. 切换到新标签
 * 
 * @param {string} [url=HOME_PAGE] - 要加载的 URL
 * @returns {number} 新标签页的 ID
 */
function createTab(url = HOME_PAGE) {
    const tabId = generateTabId();
    
    // 创建标签 DOM 元素
    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.tabId = tabId;
    tab.innerHTML = `
        <div class="tab-favicon">🌐</div>
        <span class="tab-title">加载中...</span>
        <button class="tab-close">×</button>
    `;
    
    // 创建 webview 容器
    const webviewContainer = document.createElement('div');
    webviewContainer.className = 'browser-content';
    webviewContainer.dataset.tabId = tabId;
    
    // 创建 <webview> 元素
    // partition='persist:webview' 使用持久化 session，保留 cookie 等数据
    const webview = document.createElement('webview');
    webview.setAttribute('partition', 'persist:webview');
    webview.setAttribute('allowpopups', '');  // 允许弹出窗口（由 new-window 事件拦截）
    webview.src = url;
    webviewContainer.appendChild(webview);
    
    // 添加到 DOM
    tabsWrapper.appendChild(tab);
    browserWrapper.appendChild(webviewContainer);
    
    // 保存标签数据到数组
    tabs.push({
        id: tabId,
        url: url,
        title: '加载中...',
        element: tab,                   // 标签 DOM 元素引用
        webviewContainer: webviewContainer,  // webview 容器引用
        webview: webview,               // webview 元素引用
        isLoading: true
    });
    
    // 绑定事件
    setupWebviewEvents(webview, tabId);
    setupTabEvents(tab, tabId);
    
    // 自动切换到新标签
    switchToTab(tabId);
    
    return tabId;
}

// ===== 5. Webview 事件监听 =====

/**
 * 为 webview 绑定所有生命周期事件
 * 
 * @param {Electron.WebviewElement} webview - webview DOM 元素
 * @param {number} tabId - 关联的标签页 ID
 */
function setupWebviewEvents(webview, tabId) {
    // 页面即将导航（用户点击链接或 JS 跳转）
    webview.addEventListener('will-navigate', (e) => {
        if (e.url && !e.url.startsWith('about:')) {
            updateTabUrl(tabId, e.url);
        }
    });

    // 页面开始加载
    webview.addEventListener('did-start-loading', () => {
        const tabData = tabs.find(t => t.id === tabId);
        if (tabData) tabData.isLoading = true;
        if (activeTabId === tabId) {
            statusText.textContent = '加载中...';
        }
        updateTabFavicon(tabId, '⏳');  // 加载中显示沙漏图标
    });

    // 页面停止加载（无论成功还是失败）
    webview.addEventListener('did-stop-loading', () => {
        const tabData = tabs.find(t => t.id === tabId);
        if (tabData) tabData.isLoading = false;
        if (activeTabId === tabId) {
            statusText.textContent = '就绪';
            updateNavigationButtons();
        }
        updateTabFavicon(tabId, '🌐');  // 恢复地球图标
    });

    // 页面加载完成（DOM 就绪）
    webview.addEventListener('did-finish-load', () => {
        const tabData = tabs.find(t => t.id === tabId);
        if (tabData) tabData.isLoading = false;
        if (activeTabId === tabId && !webview.isDestroyed()) {
            statusText.textContent = '就绪';
            updateNavigationButtons();
            urlInput.value = webview.getURL();        // 同步地址栏
            updateSecurityIcon(webview.getURL());     // 更新安全图标
            checkBookmark();                           // 检查是否已收藏
        }
    });

    // 页面加载失败
    webview.addEventListener('did-fail-load', (e) => {
        const tabData = tabs.find(t => t.id === tabId);
        if (tabData) tabData.isLoading = false;
        if (activeTabId === tabId) {
            statusText.textContent = `加载失败: ${e.errorDescription}`;
        }
    });

    // 页面提交导航（URL 确定变更）
    webview.addEventListener('load-commit', (e) => {
        if (e.isMainFrame && !e.url.startsWith('about:')) {
            updateTabUrl(tabId, e.url);
            if (activeTabId === tabId && !webview.isDestroyed()) {
                urlInput.value = e.url;
                updateSecurityIcon(e.url);
            }
        }
    });

    // 页面导航完成（非页面内跳转）
    webview.addEventListener('did-navigate', (e) => {
        if (activeTabId === tabId && !webview.isDestroyed()) {
            urlInput.value = e.url;
            updateNavigationButtons();
            updateSecurityIcon(e.url);
        }
    });

    // 页面内导航（如 hash 变化、pushState）
    webview.addEventListener('did-navigate-in-page', (e) => {
        if (e.isMainFrame) {
            updateTabUrl(tabId, e.url);
            if (activeTabId === tabId) {
                urlInput.value = e.url;
            }
        }
    });

    // 页面标题更新
    webview.addEventListener('page-title-updated', (e) => {
        updateTabTitle(tabId, e.title);
        if (activeTabId === tabId) {
            document.title = `${e.title} - Electron 浏览器`;
        }
    });

    // 页面 favicon 更新
    webview.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) {
            updateTabFavicon(tabId, null, e.favicons[0]);  // 使用实际 favicon 图片
        }
    });

    /**
     * 接收 webview-preload.js 通过 ipcRenderer.sendToHost 发送的消息
     * 
     * 通道：
     *   'new-tab-request' — webview 内的链接请求新建标签
     *   'link-hover' — 鼠标悬停链接，在状态栏显示 URL
     */
    webview.addEventListener('ipc-message', (e) => {
        if (e.channel === 'new-tab-request') {
            const url = e.args[0];
            if (url) {
                // 将相对 URL 转为绝对 URL
                const absoluteUrl = new URL(url, webview.getURL()).href;
                createTab(absoluteUrl);
            }
        } else if (e.channel === 'link-hover') {
            const href = e.args[0];
            if (activeTabId === tabId) {
                if (href) {
                    statusText.textContent = href;
                } else {
                    statusText.textContent = '就绪';
                }
            }
        }
    });

    // webview 内的 window.open 或新窗口请求，拦截为新标签
    webview.addEventListener('new-window', (e) => {
        e.preventDefault();
        if (e.url) {
            createTab(e.url);
        }
    });

    // 鼠标悬停链接时在状态栏显示 URL（webview 内置事件）
    webview.addEventListener('update-target-url', (e) => {
        if (activeTabId === tabId) {
            statusText.textContent = e.url || (tabs.find(t => t.id === tabId)?.isLoading ? '加载中...' : '就绪');
        }
    });
}

/**
 * 为标签 DOM 元素绑定点击和关闭事件
 * 
 * @param {HTMLElement} tab - 标签 DOM 元素
 * @param {number} tabId - 标签页 ID
 */
function setupTabEvents(tab, tabId) {
    // 点击标签（非关闭按钮区域）切换到该标签
    tab.addEventListener('click', (e) => {
        if (!e.target.classList.contains('tab-close')) {
            switchToTab(tabId);
        }
    });

    // 点击关闭按钮关闭标签
    tab.querySelector('.tab-close').addEventListener('click', (e) => {
        e.stopPropagation();  // 阻止冒泡，避免触发标签切换
        closeTab(tabId);
    });
}

/**
 * 切换到指定标签页
 * 隐藏其他标签的 webview，显示当前标签的 webview
 * 
 * @param {number} tabId - 目标标签页 ID
 */
function switchToTab(tabId) {
    const tabData = tabs.find(t => t.id === tabId);
    if (!tabData) return;

    // 移除所有标签和 webview 的 active 状态
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.browser-content').forEach(c => c.classList.remove('active'));

    // 激活目标标签和 webview
    tabData.element.classList.add('active');
    tabData.webviewContainer.classList.add('active');

    // 更新全局状态
    activeTabId = tabId;
    urlInput.value = tabData.url;
    updateNavigationButtons();
    updateSecurityIcon(tabData.url);
    checkBookmark();
    document.title = `${tabData.title} - Electron 浏览器`;

    // 同步状态栏
    statusText.textContent = tabData.isLoading ? '加载中...' : '就绪';
}

/**
 * 关闭指定标签页
 * 关闭后如果还有其他标签，自动切换到相邻标签；
 * 如果没有标签了，自动创建一个新标签
 * 
 * @param {number} tabId - 要关闭的标签页 ID
 */
function closeTab(tabId) {
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    // 从 DOM 中移除标签和 webview
    const tabData = tabs[tabIndex];
    tabData.element.remove();
    tabData.webviewContainer.remove();
    // 从数组中移除
    tabs.splice(tabIndex, 1);

    if (tabs.length === 0) {
        // 没有标签了，创建新的默认标签
        createTab();
    } else if (activeTabId === tabId) {
        // 关闭的是当前标签，切换到相邻标签
        const newIndex = Math.min(tabIndex, tabs.length - 1);
        switchToTab(tabs[newIndex].id);
    }
}

// ===== 标签辅助函数 =====

/** 更新标签页标题 */
function updateTabTitle(tabId, title) {
    const tabData = tabs.find(t => t.id === tabId);
    if (tabData) {
        tabData.title = title;
        tabData.element.querySelector('.tab-title').textContent = title;
    }
}

/** 更新标签页 URL */
function updateTabUrl(tabId, url) {
    const tabData = tabs.find(t => t.id === tabId);
    if (tabData) {
        tabData.url = url;
    }
}

/**
 * 更新标签页 favicon 图标
 * 支持两种模式：emoji 图标 或 图片 URL
 * 
 * @param {number} tabId - 标签页 ID
 * @param {string|null} emoji - emoji 字符（如 🌐、⏳）
 * @param {string|null} imageUrl - favicon 图片 URL
 */
function updateTabFavicon(tabId, emoji, imageUrl) {
    const tabData = tabs.find(t => t.id === tabId);
    if (tabData) {
        const faviconEl = tabData.element.querySelector('.tab-favicon');
        if (imageUrl) {
            // 使用实际的 favicon 图片
            faviconEl.innerHTML = `<img src="${imageUrl}" style="width:16px;height:16px;border-radius:2px;">`;
        } else if (emoji) {
            // 使用 emoji
            faviconEl.textContent = emoji;
        }
    }
}

/** 获取当前激活标签的 webview 元素 */
function getActiveWebview() {
    const tabData = tabs.find(t => t.id === activeTabId);
    return tabData ? tabData.webview : null;
}

// ===== 6. 导航功能 =====

/**
 * 导航到指定 URL
 * 
 * URL 处理逻辑：
 * - 已有协议前缀（http/https/about）→ 直接访问
 * - 包含点号且无空格（如 www.example.com）→ 自动补 https://
 * - 其他情况 → 作为搜索关键词，跳转百度搜索
 * 
 * @param {string} url - 目标 URL 或搜索关键词
 */
function navigateTo(url) {
    if (!url) return;
    
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
        if (url.includes('.') && !url.includes(' ')) {
            // 看起来像网址，自动补 https://
            url = 'https://' + url;
        } else {
            // 当作搜索关键词
            url = 'https://www.baidu.com/s?wd=' + encodeURIComponent(url);
        }
    }
    
    const webview = getActiveWebview();
    if (webview) {
        webview.src = url;
        urlInput.value = url;
    }
}

/**
 * 更新导航按钮的禁用状态
 * 根据当前 webview 的前进/后退历史来设置按钮 disabled 属性
 */
function updateNavigationButtons() {
    const webview = getActiveWebview();
    if (webview) {
        backBtn.disabled = !webview.canGoBack();
        forwardBtn.disabled = !webview.canGoForward();
    }
}

/**
 * 更新安全图标
 * HTTPS 显示锁头 🔒，HTTP 显示解锁 🔓
 * 
 * @param {string} url - 当前页面 URL
 */
function updateSecurityIcon(url) {
    if (url.startsWith('https://')) {
        securityIcon.textContent = '🔒';
    } else {
        securityIcon.textContent = '🔓';
    }
}

/**
 * 检查当前页面是否已加入书签，更新书签按钮图标
 * ⭐ = 已收藏，☆ = 未收藏
 */
function checkBookmark() {
    const webview = getActiveWebview();
    if (!webview) return;
    
    const currentUrl = webview.getURL();
    const isBookmarked = bookmarks.some(b => b.url === currentUrl);
    bookmarkBtn.textContent = isBookmarked ? '⭐' : '☆';
}

// ===== 7. 网络监控面板 =====

/**
 * 更新网络请求列表面板
 * 
 * 功能：
 * 1. 根据筛选文本和类型过滤请求
 * 2. 按时间倒序排列
 * 3. 生成请求行 HTML（方法、状态、类型、URL、耗时）
 * 4. 更新请求总数
 */
function updateNetworkPanel() {
    const filterText = networkFilterInput.value.toLowerCase();
    
    const requestIds = Object.keys(networkRequests);
    
    // 过滤 + 排序
    const filteredRequests = requestIds
        .map(id => networkRequests[id])
        .filter(req => {
            if (!req) return false;
            // URL 关键词筛选
            if (filterText && !req.url.toLowerCase().includes(filterText)) return false;
            // 请求类型筛选
            if (networkActiveType !== 'all') {
                const reqType = (req.type || '').toLowerCase();
                if (networkActiveType === 'fetch/xhr') {
                    return reqType === 'xhr' || reqType === 'fetch';
                }
                if (networkActiveType === 'media') {
                    return reqType === 'media' || reqType === 'video' || reqType === 'audio';
                }
                if (networkActiveType === 'other') {
                    return !['xhr', 'fetch', 'document', 'stylesheet', 'script', 'image', 'font', 'media', 'video', 'audio', 'websocket'].includes(reqType);
                }
                return reqType === networkActiveType;
            }
            return true;
        })
        .sort((a, b) => (b.startTime || 0) - (a.startTime || 0));  // 时间倒序
    
    // 生成请求行 HTML
    networkTableBody.innerHTML = filteredRequests.map(req => {
        // HTTP 方法样式类
        const methodClass = `method-${(req.method || 'get').toLowerCase()}`;
        // 状态码样式类（2xx 绿色，4xx 橙色，5xx 红色等）
        const statusClass = req.statusCode >= 200 && req.statusCode < 300 ? 'status-200' :
                           req.statusCode >= 300 && req.statusCode < 400 ? 'status-300' :
                           req.statusCode >= 400 && req.statusCode < 500 ? 'status-400' :
                           req.statusCode >= 500 ? 'status-500' : '';

        const timeStr = req.totalTime ? `${req.totalTime}ms` : '...';
        const statusStr = req.status === 'pending' ? '...' :
                         req.status === 'error' ? 'ERR' : (req.statusCode || '...');
        const selectedClass = selectedRequestId === req.id ? ' selected' : '';

        // 根据文件扩展名细化媒体类型显示
        let typeDisplay = req.type || 'other';
        let typeIcon = '';

        if (req.type === 'media' || req.type === 'video' || req.type === 'audio') {
            const ext = getUrlExtension(req.url);
            if (['mp4', 'webm', 'ogg', 'avi', 'mkv', 'mov', 'flv'].includes(ext)) {
                typeDisplay = 'video';
                typeIcon = '🎬';
            } else if (['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'].includes(ext)) {
                typeDisplay = 'audio';
                typeIcon = '🎵';
            } else if (ext === 'ts') {
                typeDisplay = 'ts';       // HLS 视频分片
                typeIcon = '📺';
            } else {
                typeDisplay = 'media';
                typeIcon = '📁';
            }
        }

        return `
            <div class="network-row${selectedClass}" data-req-id="${req.id}">
                <span class="col-method ${methodClass}">${req.method || 'GET'}</span>
                <span class="col-status ${statusClass}">${statusStr}</span>
                <span class="col-type">${typeIcon}${typeDisplay}</span>
                <span class="col-url" title="${req.url}">${req.url}</span>
                <span class="col-time">${timeStr}</span>
            </div>
        `;
    }).join('');

    // 更新状态栏请求计数
    networkCount.textContent = `${requestIds.length} 请求`;
}

/**
 * 从 URL 中提取文件扩展名
 * 
 * @param {string} url - 完整 URL
 * @returns {string} 小写扩展名，如 'mp4', 'json'，无效时返回空字符串
 */
function getUrlExtension(url) {
    try {
        const urlObj = new URL(url);
        const pathname = urlObj.pathname || '';
        const ext = pathname.split('.').pop().toLowerCase();
        // 只返回有效的扩展名（长度 <= 5，只含字母数字）
        if (ext && ext.length <= 5 && /^[a-z0-9]+$/.test(ext)) {
            return ext;
        }
        return '';
    } catch {
        return '';
    }
}

/**
 * 选中某条网络请求，显示详情面板
 * 
 * 详情面板包含三个 Tab：
 * - Headers：请求 URL、方法、状态码、请求头、响应头
 * - Params：URL 查询参数、POST 请求体（JSON/FormData/纯文本）
 * - Response：响应体内容（文本/JSON 格式化显示，二进制显示大小）
 * 
 * @param {string|number} reqId - 请求 ID
 */
function selectNetworkRequest(reqId) {
    selectedRequestId = reqId;
    const req = networkRequests[reqId];
    if (!req) return;

    // 更新列表选中状态
    document.querySelectorAll('.network-row').forEach(row => {
        row.classList.toggle('selected', row.dataset.reqId === String(reqId));
    });

    // 显示详情面板
    networkDetail.classList.add('show');

    // 判断是否显示下载按钮（仅图片和媒体类型可下载）
    const downloadableTypes = ['image', 'media', 'video', 'audio'];
    const reqType = (req.type || '').toLowerCase();
    const isDownloadable = downloadableTypes.includes(reqType) || 
                          reqType.includes('image') || 
                          reqType.includes('video') || 
                          reqType.includes('audio') ||
                          reqType.includes('media');
    
    if (isDownloadable && req.url) {
        downloadResourceBtn.style.display = 'inline-block';
        downloadResourceBtn.onclick = () => downloadResource(req);
    } else {
        downloadResourceBtn.style.display = 'none';
    }
    
    // 详情标题（方法 + 短 URL）
    const shortUrl = req.url.length > 60 ? '...' + req.url.slice(-57) : req.url;
    detailTitle.textContent = `${req.method || 'GET'} ${shortUrl}`;

    // ====== Headers Tab 内容 ======
    let headersHtml = '<div class="detail-general">';
    headersHtml += `<div class="dg-row"><span class="dg-label">请求 URL</span><span class="dg-value">${escapeHtml(req.url)}</span></div>`;
    headersHtml += `<div class="dg-row"><span class="dg-label">请求方法</span><span class="dg-value">${req.method || 'GET'}</span></div>`;
    headersHtml += `<div class="dg-row"><span class="dg-label">状态码</span><span class="dg-value">${req.statusCode || req.status || '...'}</span></div>`;
    if (req.type) headersHtml += `<div class="dg-row"><span class="dg-label">资源类型</span><span class="dg-value">${req.type}</span></div>`;
    if (req.totalTime) headersHtml += `<div class="dg-row"><span class="dg-label">耗时</span><span class="dg-value">${req.totalTime}ms</span></div>`;
    headersHtml += '</div>';

    // 请求头列表
    if (req.requestHeaders && Object.keys(req.requestHeaders).length > 0) {
        headersHtml += '<div class="detail-section"><div class="detail-section-title">请求头 Request Headers</div>';
        for (const [key, val] of Object.entries(req.requestHeaders)) {
            const displayVal = Array.isArray(val) ? val.join(', ') : String(val);
            headersHtml += `<div class="detail-kv"><span class="dk-key">${escapeHtml(key)}</span><span class="dk-val">${escapeHtml(displayVal)}</span></div>`;
        }
        headersHtml += '</div>';
    }

    // 响应头列表
    if (req.responseHeaders && Object.keys(req.responseHeaders).length > 0) {
        headersHtml += '<div class="detail-section"><div class="detail-section-title">响应头 Response Headers</div>';
        for (const [key, val] of Object.entries(req.responseHeaders)) {
            const displayVal = Array.isArray(val) ? val.join(', ') : String(val);
            headersHtml += `<div class="detail-kv"><span class="dk-key">${escapeHtml(key)}</span><span class="dk-val">${escapeHtml(displayVal)}</span></div>`;
        }
        headersHtml += '</div>';
    }

    detailHeaders.innerHTML = headersHtml;

    // ====== Params Tab 内容 ======
    let paramsHtml = '';

    // URL 查询参数
    try {
        const urlObj = new URL(req.url);
        const searchParams = urlObj.searchParams;
        if (searchParams.toString()) {
            paramsHtml += '<div class="detail-section"><div class="detail-section-title">查询参数 Query String</div>';
            for (const [key, val] of searchParams.entries()) {
                paramsHtml += `<div class="detail-kv"><span class="dk-key">${escapeHtml(decodeURIComponent(key))}</span><span class="dk-val">${escapeHtml(decodeURIComponent(val))}</span></div>`;
            }
            paramsHtml += '</div>';
        }
    } catch (e) {}

    // POST 请求体（根据 Content-Type 解析不同格式）
    if (req.requestBody) {
        const contentTypeRaw = (req.requestHeaders && (req.requestHeaders['Content-Type'] || req.requestHeaders['content-type'])) || '';
        const contentType = Array.isArray(contentTypeRaw) ? (contentTypeRaw[0] || '') : String(contentTypeRaw);

        if (contentType.includes('application/x-www-form-urlencoded')) {
            // 表单数据：解析为 key-value 对
            paramsHtml += '<div class="detail-section"><div class="detail-section-title">表单数据 Form Data</div>';
            try {
                const bodyParams = new URLSearchParams(req.requestBody);
                for (const [key, val] of bodyParams.entries()) {
                    paramsHtml += `<div class="detail-kv"><span class="dk-key">${escapeHtml(key)}</span><span class="dk-val">${escapeHtml(val)}</span></div>`;
                }
            } catch (e) {
                paramsHtml += `<div class="detail-kv"><span class="dk-key">body</span><span class="dk-val">${escapeHtml(req.requestBody)}</span></div>`;
            }
            paramsHtml += '</div>';
        } else if (contentType.includes('application/json')) {
            // JSON 数据：格式化显示
            paramsHtml += '<div class="detail-section"><div class="detail-section-title">请求体 Request Payload</div>';
            try {
                const parsed = JSON.parse(req.requestBody);
                paramsHtml += `<div class="detail-response-body json">${escapeHtml(JSON.stringify(parsed, null, 2))}</div>`;
            } catch (e) {
                paramsHtml += `<div class="detail-response-body">${escapeHtml(req.requestBody)}</div>`;
            }
            paramsHtml += '</div>';
        } else {
            // 其他格式：直接显示（截断前 5000 字符）
            paramsHtml += '<div class="detail-section"><div class="detail-section-title">请求体 Request Payload</div>';
            paramsHtml += `<div class="detail-response-body">${escapeHtml(req.requestBody.substring(0, 5000))}</div>`;
            paramsHtml += '</div>';
        }
    }

    if (!paramsHtml) {
        paramsHtml = '<div class="detail-empty">此请求无参数</div>';
    }
    detailParams.innerHTML = paramsHtml;

    // ====== Response Tab 内容 ======
    let responseHtml = '';
    if (req.error) {
        // 请求出错
        responseHtml = `<div class="detail-section"><div class="detail-section-title">错误信息</div><div class="detail-response-body">${escapeHtml(req.error)}</div></div>`;
    } else if (req.status === 'pending') {
        // 请求进行中
        responseHtml = '<div class="detail-empty">请求进行中...</div>';
    } else if (!req.statusCode) {
        // 等待响应
        responseHtml = '<div class="detail-empty">等待响应...</div>';
    } else {
        // 已有响应，异步获取响应体（通过 CDP）
        responseHtml = `<div class="detail-section"><div class="detail-section-title">状态: ${req.statusCode} ${req.statusLine || ''}</div></div>`;
        responseHtml += '<div class="detail-empty">正在获取响应体...</div>';
        detailResponse.innerHTML = responseHtml;
        // 异步获取响应体（IPC invoke → main.js CDP 查询 → 返回结果）
        fetchResponseBody(reqId);
        return;  // 提前返回，等 fetchResponseBody 异步更新
    }
    detailResponse.innerHTML = responseHtml;
}

// ===== 8. 资源下载 =====

/**
 * 下载单个资源
 * 
 * 流程：
 * 1. 从 URL 推断文件名
 * 2. 弹出系统保存文件对话框
 * 3. 调用主进程的 downloadResource 下载
 * 
 * @param {Object} req - 网络请求对象
 */
async function downloadResource(req) {
    if (!req || !req.url) return;

    try {
        const filename = getFilenameFromUrl(req.url);

        // 弹出系统保存文件对话框
        const result = await window.electronAPI.showSaveDialog({
            title: '保存文件',
            defaultPath: filename,
            filters: [
                { name: '所有文件', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return;
        }

        statusText.textContent = '正在下载...';
        
        // 调用主进程下载资源
        const downloadResult = await window.electronAPI.downloadResource(req.url, result.filePath);
        
        if (downloadResult.success) {
            statusText.textContent = `已保存到: ${downloadResult.filePath}`;
            setTimeout(() => {
                statusText.textContent = '就绪';
            }, 3000);
        }
    } catch (error) {
        console.error('Download failed:', error);
        statusText.textContent = `下载失败: ${error.message}`;
    }
}

// ===== 工具函数 =====

/**
 * HTML 转义，防止 XSS
 * 将 &, <, >, " 转为 HTML 实体
 */
function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 异步获取请求的响应体
 * 
 * 流程：
 * 1. 通过 electronAPI.getResponseBody() 调用主进程
 * 2. 主进程通过 CDP 调试器获取响应体
 * 3. 根据 Content-Type 判断显示方式（JSON 格式化 / HTML / 纯文本 / 二进制）
 * 
 * @param {string|number} reqId - 请求 ID
 */
async function fetchResponseBody(reqId) {
    const req = networkRequests[reqId];
    if (!req) return;

    try {
        // 通过 IPC 调用主进程获取响应体
        const result = await window.electronAPI.getResponseBody(reqId, req.url);
        if (!result) {
            detailResponse.innerHTML = `<div class="detail-section"><div class="detail-section-title">状态: ${req.statusCode} ${req.statusLine || ''}</div></div><div class="detail-empty">无法获取响应体</div>`;
            return;
        }

        // 如果是 base64 编码，先解码
        let body = result.body;
        if (result.base64Encoded) {
            body = atob(body);
        }

        let responseHtml = `<div class="detail-section"><div class="detail-section-title">状态: ${req.statusCode} ${req.statusLine || ''}</div></div>`;

        // 根据 Content-Type 判断内容类型
        // Electron 的 responseHeaders 值是数组格式，如 ['application/json; charset=utf-8']
        const contentTypeRaw = (req.responseHeaders && (req.responseHeaders['content-type'] || req.responseHeaders['Content-Type'])) || '';
        const contentType = Array.isArray(contentTypeRaw) ? (contentTypeRaw[0] || '') : String(contentTypeRaw);
        const isJson = contentType.includes('json') || contentType.includes('javascript');
        const isHtml = contentType.includes('html');
        const isText = contentType.includes('text') || isJson || isHtml || contentType.includes('xml') || contentType.includes('css');

        if (isText) {
            // 文本内容：格式化显示
            let displayBody = body;
            if (isJson) {
                try {
                    displayBody = JSON.stringify(JSON.parse(body), null, 2);  // JSON 格式化缩进
                } catch (e) {}
            }
            // 截断过长的响应体（超过 50000 字符）
            if (displayBody.length > 50000) {
                displayBody = displayBody.substring(0, 50000) + '\n\n... (响应体过长，已截断)';
            }
            responseHtml += `<div class="detail-section"><div class="detail-section-title">响应体${isJson ? ' (JSON)' : isHtml ? ' (HTML)' : ''}</div><div class="detail-response-body${isJson ? ' json' : ''}">${escapeHtml(displayBody)}</div></div>`;
        } else {
            // 二进制内容：显示大小和类型
            const sizeStr = body.length > 1024 ? `${(body.length / 1024).toFixed(1)} KB` : `${body.length} B`;
            responseHtml += `<div class="detail-section"><div class="detail-section-title">响应体</div><div style="color:#888">二进制数据 (${sizeStr})，类型: ${contentType || 'unknown'}</div></div>`;
        }

        detailResponse.innerHTML = responseHtml;
    } catch (err) {
        detailResponse.innerHTML = `<div class="detail-section"><div class="detail-section-title">状态: ${req.statusCode} ${req.statusLine || ''}</div></div><div class="detail-empty">获取响应体失败: ${escapeHtml(err.message)}</div>`;
    }
}

/**
 * 切换网络监控面板的显示/隐藏
 * 
 * @param {boolean} show - 是否显示
 */
function toggleNetworkPanel(show) {
    if (show) {
        networkPanel.classList.add('show');
        resizeHandle.classList.add('show');
        // 设置初始高度：浏览器区 60%，网络面板 40%
        if (!networkPanel.style.height) {
            const contentHeight = mainContent.clientHeight;
            networkPanel.style.height = Math.round(contentHeight * 0.4) + 'px';
        }
    } else {
        networkPanel.classList.remove('show');
        resizeHandle.classList.remove('show');
        networkDetail.classList.remove('show');
        selectedRequestId = null;
        networkPanel.style.height = '';
    }
}

// ===== 事件绑定 — 导航栏 =====

// 前往按钮点击
goBtn.addEventListener('click', () => {
    navigateTo(urlInput.value);
});

// 地址栏回车
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        navigateTo(urlInput.value);
    }
});

// 后退按钮
backBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (webview && webview.canGoBack()) {
        webview.goBack();
    }
});

// 前进按钮
forwardBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (webview && webview.canGoForward()) {
        webview.goForward();
    }
});

// 刷新按钮
refreshBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (webview) {
        webview.reload();
    }
});

// 主页按钮
homeBtn.addEventListener('click', () => {
    navigateTo(HOME_PAGE);
});

// ===== 事件绑定 — 菜单 =====

// 菜单按钮点击：切换下拉菜单
menuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menuDropdown.classList.toggle('show');
});

// 点击其他区域关闭菜单
document.addEventListener('click', () => {
    menuDropdown.classList.remove('show');
});

// ===== 事件绑定 — 标签栏 =====

// 新建标签按钮
document.getElementById('new-tab-btn').addEventListener('click', () => {
    createTab();
});

// 菜单中的新建标签
document.getElementById('new-tab-menu-btn').addEventListener('click', () => {
    createTab();
    menuDropdown.classList.remove('show');
});

// 菜单中的新建窗口
document.getElementById('new-window-btn').addEventListener('click', () => {
    electronAPI.openNewWindow(HOME_PAGE);
    menuDropdown.classList.remove('show');
});

// ===== 事件绑定 — 网络面板 =====

// 菜单中的网络监控
document.getElementById('network-panel-btn').addEventListener('click', () => {
    toggleNetworkPanel(!networkPanel.classList.contains('show'));
    menuDropdown.classList.remove('show');
});

// 关闭网络面板
document.getElementById('close-network-btn').addEventListener('click', () => {
    toggleNetworkPanel(false);
});

// 清空网络请求列表
document.getElementById('clear-network-btn').addEventListener('click', () => {
    networkRequests = {};
    selectedRequestId = null;
    networkDetail.classList.remove('show');
    updateNetworkPanel();
});

// URL 筛选输入
networkFilterInput.addEventListener('input', updateNetworkPanel);

// 类型标签页切换
networkTypeTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.type-tab');
    if (!tab) return;
    networkTypeTabs.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    networkActiveType = tab.dataset.type;
    updateNetworkPanel();
});

// 点击请求行显示详情
networkTableBody.addEventListener('click', (e) => {
    const row = e.target.closest('.network-row');
    if (!row) return;
    const reqId = row.dataset.reqId;
    if (reqId) selectNetworkRequest(reqId);
});

// 关闭详情面板
document.getElementById('close-detail-btn').addEventListener('click', () => {
    networkDetail.classList.remove('show');
    selectedRequestId = null;
    document.querySelectorAll('.network-row').forEach(r => r.classList.remove('selected'));
});

// 详情 Tab 切换
detailTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.detail-tab');
    if (!tab) return;
    detailTabs.querySelectorAll('.detail-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const targetPane = tab.dataset.tab;
    detailContent.querySelectorAll('.detail-pane').forEach(p => {
        p.classList.toggle('active', p.dataset.pane === targetPane);
    });
});

// ===== 事件绑定 — 开发者工具 =====

// 打开 webview 的 DevTools（需先分离 CDP）
document.getElementById('devtools-btn').addEventListener('click', () => {
    if (window.electronAPI && window.electronAPI.openWebviewDevTools) {
        window.electronAPI.openWebviewDevTools(activeTabId);
    }
    menuDropdown.classList.remove('show');
});

// ===== 事件绑定 — 菜单其他项（占位） =====

document.getElementById('settings-btn').addEventListener('click', () => {
    alert('设置功能开发中...');
    menuDropdown.classList.remove('show');
});

document.getElementById('history-btn').addEventListener('click', () => {
    alert('历史记录功能开发中...');
    menuDropdown.classList.remove('show');
});

// ===== 事件绑定 — 下载面板 =====

// 打开下载面板
document.getElementById('downloads-btn').addEventListener('click', () => {
    menuDropdown.classList.remove('show');
    showDownloadsPanel();
});

// 关闭下载面板
document.getElementById('close-downloads-btn').addEventListener('click', () => {
    downloadsPanel.classList.remove('show');
});

// 下载选中资源
document.getElementById('download-selected-btn').addEventListener('click', async (e) => {
    console.log('=== Download selected button clicked ===');
    e.preventDefault();
    e.stopPropagation();
    try {
        console.log('Calling downloadSelectedResources...');
        await downloadSelectedResources();
        console.log('downloadSelectedResources completed');
    } catch (error) {
        console.error('Error in downloadSelectedResources:', error);
    }
});

// 下载全部资源
document.getElementById('download-all-btn').addEventListener('click', () => {
    downloadAllResources();
});

// 下载面板筛选
downloadsFilterInput.addEventListener('input', updateDownloadsList);
downloadsTypeFilter.addEventListener('change', updateDownloadsList);

// 全选/取消全选复选框
selectAllDownloads.addEventListener('change', (e) => {
    const checkboxes = downloadsTableBody.querySelectorAll('.download-checkbox');
    checkboxes.forEach(cb => {
        cb.checked = e.target.checked;
        const reqId = cb.dataset.reqId;
        if (e.target.checked) {
            selectedDownloads.add(reqId);
        } else {
            selectedDownloads.delete(reqId);
        }
    });
});

/**
 * 显示下载面板
 * 清空选中状态，刷新下载列表
 */
function showDownloadsPanel() {
    selectedDownloads.clear();
    selectAllDownloads.checked = false;
    updateDownloadsList();
    downloadsPanel.classList.add('show');
}

/**
 * 更新下载资源列表
 * 只显示可下载的资源（图片、视频、音频、媒体）
 * 支持按 URL 关键词和类型筛选
 */
function updateDownloadsList() {
    const filterText = downloadsFilterInput.value.toLowerCase();
    const typeFilter = downloadsTypeFilter.value;
    
    // 筛选可下载的请求
    const downloadableRequests = Object.values(networkRequests).filter(req => {
        if (!req || !req.url) return false;
        const reqType = (req.type || '').toLowerCase();
        const isDownloadable = reqType.includes('image') || 
                              reqType.includes('video') || 
                              reqType.includes('audio') ||
                              reqType.includes('media');
        if (!isDownloadable) return false;
        
        // URL 筛选
        if (filterText && !req.url.toLowerCase().includes(filterText)) return false;
        
        // 类型筛选
        if (typeFilter !== 'all') {
            if (typeFilter === 'image' && !reqType.includes('image')) return false;
            if (typeFilter === 'media' && !reqType.includes('video') && !reqType.includes('audio') && !reqType.includes('media')) return false;
        }
        
        return true;
    });
    
    // 生成下载行 HTML
    downloadsTableBody.innerHTML = downloadableRequests.map(req => {
        const reqType = (req.type || '').toLowerCase();
        let typeDisplay = reqType;
        let typeIcon = '';
        
        if (reqType.includes('image')) {
            typeIcon = '🖼️';
            typeDisplay = '图片';
        } else if (reqType.includes('video')) {
            typeIcon = '🎬';
            typeDisplay = '视频';
        } else if (reqType.includes('audio')) {
            typeIcon = '🎵';
            typeDisplay = '音频';
        } else if (reqType.includes('media')) {
            typeIcon = '📁';
            typeDisplay = '媒体';
        }
        
        return `
            <div class="download-row ${selectedDownloads.has(req.id) ? 'selected' : ''}" data-req-id="${req.id}">
                <span class="col-check">
                    <input type="checkbox" class="download-checkbox" data-req-id="${req.id}" ${selectedDownloads.has(req.id) ? 'checked' : ''}>
                </span>
                <span class="col-type">${typeIcon}${typeDisplay}</span>
                <span class="col-url" title="${req.url}">${req.url}</span>
                <span class="col-action">
                    <button class="download-single-btn" data-req-id="${req.id}">下载</button>
                </span>
            </div>
        `;
    }).join('');
    
    // 绑定复选框事件
    downloadsTableBody.querySelectorAll('.download-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const reqId = e.target.dataset.reqId;
            if (e.target.checked) {
                selectedDownloads.add(reqId);
            } else {
                selectedDownloads.delete(reqId);
            }
            updateSelectAllState();
        });
    });
    
    // 绑定单个下载按钮事件
    downloadsTableBody.querySelectorAll('.download-single-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const reqId = e.target.dataset.reqId;
            const req = networkRequests[reqId];
            if (req) {
                downloadResource(req);
            }
        });
    });
}

/**
 * 更新全选复选框的状态
 * 当所有子复选框都选中时，全选框也选中
 */
function updateSelectAllState() {
    const checkboxes = downloadsTableBody.querySelectorAll('.download-checkbox');
    const checkedCount = downloadsTableBody.querySelectorAll('.download-checkbox:checked').length;
    selectAllDownloads.checked = checkboxes.length > 0 && checkedCount === checkboxes.length;
}

/**
 * 批量下载选中的资源
 * 
 * 流程：
 * 1. 弹出选择目录对话框
 * 2. 逐个下载选中资源到该目录
 * 3. 显示下载结果统计
 */
async function downloadSelectedResources() {
    console.log('=== downloadSelectedResources ===');
    console.log('selectedDownloads:', selectedDownloads);
    console.log('selectedDownloads size:', selectedDownloads.size);
    
    if (selectedDownloads.size === 0) {
        alert('请先选择要下载的资源');
        return;
    }
    
    console.log('Opening directory dialog...');
    
    // 弹出选择目录对话框
    const result = await window.electronAPI.showOpenDialog({
        title: '选择保存目录',
        properties: ['openDirectory', 'createDirectory']
    });
    
    console.log('Dialog result:', result);
    
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
    }
    
    const saveDir = result.filePaths[0];
    console.log('Save directory:', saveDir);
    
    let successCount = 0;
    let failCount = 0;
    const usedFilenames = new Set();
    
    for (const reqId of selectedDownloads) {
        const req = networkRequests[reqId] || networkRequests[parseInt(reqId)];
        console.log('Processing reqId:', reqId, 'req:', req);
        
        if (req) {
            try {
                let filename = getFilenameFromUrl(req.url);
                
                // 处理文件名重复
                if (usedFilenames.has(filename)) {
                    const ext = filename.split('.').pop();
                    const baseName = filename.substring(0, filename.lastIndexOf('.'));
                    let counter = 1;
                    while (usedFilenames.has(`${baseName}_${counter}.${ext}`)) {
                        counter++;
                    }
                    filename = `${baseName}_${counter}.${ext}`;
                }
                
                usedFilenames.add(filename);
                
                const filePath = path.join(saveDir, filename);
                console.log('Downloading:', req.url, 'to', filePath);
                await window.electronAPI.downloadResource(req.url, filePath);
                successCount++;
            } catch (error) {
                console.error('Download failed:', error);
                failCount++;
            }
        }
    }
    
    console.log(`Download complete: ${successCount} success, ${failCount} failed`);
    statusText.textContent = `下载完成: 成功 ${successCount} 个, 失败 ${failCount} 个`;
    setTimeout(() => {
        statusText.textContent = '就绪';
    }, 3000);
}

/**
 * 下载所有可下载的资源（应用当前筛选条件）
 */
async function downloadAllResources() {
    const filterText = downloadsFilterInput.value.toLowerCase();
    const typeFilter = downloadsTypeFilter.value;
    
    console.log('=== downloadAllResources ===');
    console.log('Filter text:', filterText);
    console.log('Type filter:', typeFilter);
    console.log('Total network requests:', Object.keys(networkRequests).length);
    
    // 获取当前筛选后的可下载资源列表
    const downloadableRequests = Object.values(networkRequests).filter(req => {
        if (!req || !req.url) return false;
        const reqType = (req.type || '').toLowerCase();
        const isDownloadable = reqType.includes('image') || 
                              reqType.includes('video') || 
                              reqType.includes('audio') ||
                              reqType.includes('media');
        if (!isDownloadable) return false;
        
        if (filterText && !req.url.toLowerCase().includes(filterText)) return false;
        
        if (typeFilter !== 'all') {
            if (typeFilter === 'image' && !reqType.includes('image')) return false;
            if (typeFilter === 'media' && !reqType.includes('video') && !reqType.includes('audio') && !reqType.includes('media')) return false;
        }
        
        return true;
    });
    
    console.log('Downloadable requests count:', downloadableRequests.length);
    console.log('Downloadable URLs:', downloadableRequests.map(r => r.url));
    
    if (downloadableRequests.length === 0) {
        alert('没有可下载的资源');
        return;
    }
    
    const result = await window.electronAPI.showOpenDialog({
        title: '选择保存目录',
        properties: ['openDirectory', 'createDirectory']
    });
    
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
    }
    
    const saveDir = result.filePaths[0];
    console.log('Save directory:', saveDir);
    
    let successCount = 0;
    let failCount = 0;
    const usedFilenames = new Set();
    
    for (let i = 0; i < downloadableRequests.length; i++) {
        const req = downloadableRequests[i];
        console.log(`\nDownloading ${i + 1}/${downloadableRequests.length}:`, req.url);
        
        try {
            let filename = getFilenameFromUrl(req.url);
            
            // 处理文件名重复
            if (usedFilenames.has(filename)) {
                const ext = filename.split('.').pop();
                const baseName = filename.substring(0, filename.lastIndexOf('.'));
                let counter = 1;
                while (usedFilenames.has(`${baseName}_${counter}.${ext}`)) {
                    counter++;
                }
                filename = `${baseName}_${counter}.${ext}`;
            }
            
            usedFilenames.add(filename);
            
            const filePath = path.join(saveDir, filename);
            console.log('File path:', filePath);
            await window.electronAPI.downloadResource(req.url, filePath);
            console.log('Download success:', filename);
            successCount++;
        } catch (error) {
            console.error('Download failed:', error);
            failCount++;
        }
    }
    
    console.log(`\nDownload complete: ${successCount} success, ${failCount} failed`);
    statusText.textContent = `下载完成: 成功 ${successCount} 个, 失败 ${failCount} 个`;
    setTimeout(() => {
        statusText.textContent = '就绪';
    }, 3000);
}

// ===== 9. 文件名处理 =====

/**
 * 从 URL 中提取安全的文件名
 * 
 * 处理逻辑：
 * 1. 从 URL pathname 中提取最后一段作为文件名
 * 2. 清理非法字符
 * 3. 无效文件名时使用时间戳
 * 4. 确保有文件扩展名
 * 
 * @param {string} url - 资源 URL
 * @returns {string} 安全的文件名
 */
function getFilenameFromUrl(url) {
    try {
        const urlObj = new URL(url);
        let pathname = urlObj.pathname || '';
        
        // 移除开头的斜杠
        pathname = pathname.replace(/^\//, '');
        
        // 获取最后一个路径段
        let filename = pathname.split('/').pop() || '';
        
        // 移除查询参数
        filename = filename.split('?')[0];
        
        // 清理非法字符（Windows 文件名不允许的字符）
        filename = filename.replace(/[<>:"/\\|?*,&=]/g, '_');
        
        // 检查是否是有效的文件名
        const isValidFilename = filename && 
                                filename.length >= 2 && 
                                filename.length <= 200 &&
                                !filename.includes('u=') &&
                                !filename.includes('fm=') &&
                                !filename.includes('fmt=');
        
        if (!isValidFilename) {
            // 使用时间戳作为文件名
            const ext = getUrlExtension(url) || 'bin';
            filename = `download_${Date.now()}.${ext}`;
        }
        
        // 确保有扩展名
        if (!filename.includes('.')) {
            const ext = getUrlExtension(url);
            if (ext) {
                filename += '.' + ext;
            } else {
                filename += '.bin';
            }
        }
        
        return filename;
    } catch {
        return `download_${Date.now()}.bin`;
    }
}

/**
 * 简易的 path.join 实现（Windows 风格）
 * 因为渲染进程没有 Node.js 的 path 模块
 */
const path = {
    join: (...args) => {
        return args.filter(Boolean).join('\\').replace(/\\+/g, '\\');
    }
};

/**
 * 测试用的下载选中函数（挂载到 window 供 HTML onclick 调用）
 */
window.testDownloadSelected = async function() {
    if (selectedDownloads.size === 0) {
        alert('请先选择要下载的资源');
        return;
    }
    
    const result = await window.electronAPI.showOpenDialog({
        title: '选择保存目录',
        properties: ['openDirectory', 'createDirectory']
    });
    
    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return;
    }
    
    const saveDir = result.filePaths[0];
    let successCount = 0;
    let failCount = 0;
    
    for (const reqId of selectedDownloads) {
        const req = networkRequests[reqId] || networkRequests[parseInt(reqId)];
        if (req) {
            try {
                const filename = getFilenameFromUrl(req.url);
                const filePath = path.join(saveDir, filename);
                await window.electronAPI.downloadResource(req.url, filePath);
                successCount++;
            } catch (error) {
                console.error('Download failed:', error);
                failCount++;
            }
        }
    }
    
    statusText.textContent = `下载完成: 成功 ${successCount} 个, 失败 ${failCount} 个`;
    setTimeout(() => {
        statusText.textContent = '就绪';
    }, 3000);
};

// ===== 10. 书签管理 =====

/**
 * 书签按钮点击事件
 * 切换当前页面的书签状态，并持久化到 localStorage
 */
bookmarkBtn.addEventListener('click', () => {
    const webview = getActiveWebview();
    if (!webview) return;
    
    const currentUrl = webview.getURL();
    const currentTitle = webview.getTitle();
    
    const existingIndex = bookmarks.findIndex(b => b.url === currentUrl);
    
    if (existingIndex > -1) {
        // 已收藏 → 移除
        bookmarks.splice(existingIndex, 1);
        bookmarkBtn.textContent = '☆';
        statusText.textContent = '已移除书签';
    } else {
        // 未收藏 → 添加
        bookmarks.push({ url: currentUrl, title: currentTitle, date: new Date().toISOString() });
        bookmarkBtn.textContent = '⭐';
        statusText.textContent = '已添加书签';
        bookmarkBtn.classList.add('bookmark-added');
        setTimeout(() => bookmarkBtn.classList.remove('bookmark-added'), 300);
    }
    
    // 持久化到 localStorage
    localStorage.setItem('bookmarks', JSON.stringify(bookmarks));
});

// ===== 11. 快捷键 =====

/**
 * 全局键盘快捷键处理
 * 
 * Ctrl+R      — 刷新当前页面
 * Ctrl+L      — 聚焦地址栏并全选
 * Ctrl+D      — 切换书签
 * Ctrl+T      — 新建标签页
 * Ctrl+W      — 关闭当前标签
 * Ctrl+Tab    — 切换到下一个标签
 * Ctrl+Shift+Tab — 切换到上一个标签
 * F5          — 刷新当前页面
 * F12         — 切换网络监控面板
 * Shift+F12   — 打开 webview DevTools
 */
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        switch(e.key) {
            case 'r':
                e.preventDefault();
                const webview = getActiveWebview();
                if (webview) webview.reload();
                break;
            case 'l':
                e.preventDefault();
                urlInput.focus();
                urlInput.select();
                break;
            case 'd':
                e.preventDefault();
                bookmarkBtn.click();
                break;
            case 't':
                e.preventDefault();
                createTab();
                break;
            case 'w':
                e.preventDefault();
                if (activeTabId) closeTab(activeTabId);
                break;
            case 'Tab':
                e.preventDefault();
                if (e.shiftKey) {
                    switchToPreviousTab();
                } else {
                    switchToNextTab();
                }
                break;
        }
    }

    // Shift+F12：打开 webview 的 DevTools
    if (e.shiftKey && e.key === 'F12') {
        e.preventDefault();
        if (window.electronAPI && window.electronAPI.openWebviewDevTools) {
            window.electronAPI.openWebviewDevTools(activeTabId);
        }
    }
    
    // F5：刷新
    if (e.key === 'F5') {
        e.preventDefault();
        const webview = getActiveWebview();
        if (webview) webview.reload();
    }
    
    // F12：切换网络监控面板
    if (e.key === 'F12') {
        e.preventDefault();
        toggleNetworkPanel(!networkPanel.classList.contains('show'));
    }
});

// ===== 12. 面板拖拽 — 调整网络面板高度 =====

/** @type {boolean} 是否正在拖拽 */
let isResizing = false;
/** @type {number} 拖拽开始时的鼠标 Y 坐标 */
let startY = 0;
/** @type {number} 拖拽开始时的面板高度 */
let startPanelHeight = 0;
/** @type {HTMLElement|null} 拖拽时的全屏覆盖层（防止 webview 劫持鼠标事件） */
let resizeOverlay = null;

// 鼠标按下拖拽手柄
resizeHandle.addEventListener('mousedown', (e) => {
    if (!networkPanel.classList.contains('show')) return;
    isResizing = true;
    startY = e.clientY;
    startPanelHeight = networkPanel.offsetHeight;

    // 创建全屏透明覆盖层，防止 webview 在拖拽时劫持鼠标事件
    // （webview 会捕获鼠标事件导致拖拽中断）
    resizeOverlay = document.createElement('div');
    resizeOverlay.className = 'resizing-overlay';
    document.body.appendChild(resizeOverlay);

    document.body.style.userSelect = 'none';  // 禁止文字选中
    e.preventDefault();
});

// 鼠标移动：调整面板高度
document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const deltaY = startY - e.clientY;  // 向上拖 = 增大面板
    const contentHeight = mainContent.clientHeight;
    const maxPanelHeight = contentHeight - 100;  // 浏览器区最少保留 100px
    const minPanelHeight = 150;                   // 面板最小高度 150px
    let newHeight = startPanelHeight + deltaY;
    newHeight = Math.max(minPanelHeight, Math.min(maxPanelHeight, newHeight));
    networkPanel.style.height = newHeight + 'px';
});

// 鼠标松开：结束拖拽
document.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.userSelect = '';
        if (resizeOverlay) {
            resizeOverlay.remove();
            resizeOverlay = null;
        }
    }
});

// ===== 标签切换辅助 =====

/** 切换到下一个标签（循环） */
function switchToNextTab() {
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const nextIndex = (currentIndex + 1) % tabs.length;
    switchToTab(tabs[nextIndex].id);
}

/** 切换到上一个标签（循环） */
function switchToPreviousTab() {
    const currentIndex = tabs.findIndex(t => t.id === activeTabId);
    const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    switchToTab(tabs[prevIndex].id);
}

// ===== 初始化 =====
// 页面加载完成后，创建第一个默认标签页
createTab();
