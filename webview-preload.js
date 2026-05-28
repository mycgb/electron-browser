/**
 * ============================================================
 * Electron 浏览器 — Webview 预加载脚本
 * ============================================================
 * 
 * 架构角色：注入到每个 <webview> 加载的第三方页面中
 * 
 * 运行时机：在每个 webview 页面的 JS 执行前注入（通过 session.setPreloads）
 * 
 * 两大功能模块：
 * 
 * 1. 反调试检测屏蔽
 *    部分网站会检测用户是否打开了 DevTools，从而阻止调试。
 *    本模块通过以下手段屏蔽检测：
 *    - 劫持 Function 构造器，屏蔽 debugger 语句
 *    - 清理 Error.stack 中的 Electron/preload 痕迹
 *    - 隐藏 React DevTools 全局钩子
 *    - 屏蔽 window.external.detect 检测
 *    - 通过 Proxy 保护 console 不被网站覆盖
 * 
 * 2. 页面交互拦截
 *    - 拦截 target="_blank" 链接点击，改为新建标签页
 *    - 链接 hover 时通知状态栏显示 URL
 *    - 劫持 window.open，改为新标签页打开
 * 
 * 通信方式：
 *   ipcRenderer.sendToHost → 向宿主页面（renderer.js）发送消息
 *   与 preload.js 的 ipcRenderer.send/invoke 不同，
 *   webview 内的 ipcRenderer 只能通过 sendToHost 与宿主通信
 * ============================================================
 */

const { ipcRenderer } = require('electron');

// ========================================================================
// 模块一：反调试检测屏蔽
// 以下代码在第三方页面的 JS 执行前运行，确保页面无法检测到 Electron 环境
// ========================================================================

/**
 * 1. 屏蔽 debugger 语句检测
 * 
 * 部分网站通过 new Function('debugger') 不断触发断点来阻止调试。
 * 劫持 Function.prototype.constructor，当检测到参数为 'debugger' 时
 * 返回空函数，使 debugger 语句失效
 */
const originalConstructor = Function.prototype.constructor;
Function.prototype.constructor = function () {
    if (arguments && arguments.length > 0 && arguments[0] === 'debugger') {
        return function () {};  // 返回空函数，debugger 不执行
    }
    return originalConstructor.apply(this, arguments);
};
// 修复 toString 返回值，让网站的检测代码看不出 Function 构造器被改写
Object.defineProperty(Function.prototype.constructor, 'toString', {
    value: function () { return 'function Function() { [native code] }' },
    writable: true,
    configurable: true
});

/**
 * 2. 屏蔽基于时间的 debugger 检测
 * 
 * 部分网站通过测量代码执行时间差来检测是否有 debugger 断点卡顿
 * （预留变量，当前未实现时间偏移逻辑）
 */
const originalDateNow = Date.now;
const originalPerformanceNow = performance.now.bind(performance);
let timeOffset = 0;

/**
 * 3. 通过 Proxy 保护 console 对象
 * 
 * 部分网站会重写 console 对象来干扰调试或检测 DevTools。
 * 使用 Proxy 代理 console，所有属性访问都转发到原始 console，
 * 同时阻止网站对 console 的修改（set 拦截返回 true 但不实际修改）
 */
const _originalConsole = console;
const consoleProxy = new Proxy(_originalConsole, {
    get(target, prop) {
        const val = target[prop];
        // 确保方法调用时 this 绑定到原始 console
        return typeof val === 'function' ? val.bind(target) : val;
    },
    set() { return true; }  // 阻止网站修改 console 属性
});

// 将 window.console 替换为代理对象，且阻止再次被覆盖
Object.defineProperty(window, 'console', {
    get: function () { return consoleProxy; },
    set: function () {},          // 忽略赋值操作
    configurable: true
});

/**
 * 4. 屏蔽通过 window.external.detect 检测 DevTools
 * 
 * IE/Edge 旧版 API，部分网站利用它检测开发者工具
 */
if (window.external) {
    Object.defineProperty(window.external, 'detect', {
        value: function () { return false; },
        writable: true,
        configurable: true
    });
}

/**
 * 5. 屏蔽通过 Image 加载时间差检测 DevTools
 * 
 * 部分网站利用 Image 的 onerror/onload 时间差来检测 DevTools
 * 当 DevTools 打开时，资源加载会有额外延迟
 * 
 * 注意：当前实现未特别处理，因为在不附加 debugger 的情况下没有时间差
 */

/**
 * 6. 屏蔽 React DevTools 全局钩子检测
 * 
 * 部分网站通过检测 window.__REACT_DEVTOOLS_GLOBAL_HOOK__ 是否存在
 * 来判断是否安装了 React DevTools（间接证明打开了 DevTools）
 */
Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
    get: function () { return undefined; },  // 返回 undefined，假装未安装
    set: function () {},                      // 阻止赋值
    configurable: true
});

/**
 * 7. 屏蔽 Error.stack 检测
 * 
 * 部分网站通过检查错误堆栈中是否包含 'electron'、'preload' 等关键字
 * 来检测当前是否运行在 Electron 环境中。
 * 使用 Proxy 拦截 Error 构造，过滤掉敏感的堆栈行
 */
const OriginalError = Error;
const errorProxy = new Proxy(OriginalError, {
    // 拦截 new Error(...) 构造调用
    construct(target, args) {
        const err = new target(...args);
        if (err.stack) {
            // 过滤堆栈中包含 electron/preload/webview-preload 的行
            err.stack = err.stack
                .split('\n')
                .filter(line =>
                    !line.includes('electron') &&
                    !line.includes('preload') &&
                    !line.includes('webview-preload')
                )
                .join('\n');
        }
        return err;
    },
    // 拦截 Error(...) 普通函数调用
    apply(target, thisArg, args) {
        const err = target(...args);
        if (err && err.stack) {
            err.stack = err.stack
                .split('\n')
                .filter(line =>
                    !line.includes('electron') &&
                    !line.includes('preload') &&
                    !line.includes('webview-preload')
                )
                .join('\n');
        }
        return err;
    }
});
window.Error = errorProxy;

// ========================================================================
// 模块二：页面交互拦截
// 拦截链接点击、window.open 等，改为在浏览器中新建标签页打开
// ========================================================================

window.addEventListener('DOMContentLoaded', () => {
    /**
     * 拦截 target="_blank" / target="_new" 的链接点击
     * 阻止默认的新窗口打开行为，改为通知宿主页面新建标签页
     * 使用捕获阶段（true）确保在其他点击处理器之前执行
     */
    document.addEventListener('click', (e) => {
        // 向上查找最近的 <a> 标签
        let target = e.target;
        while (target && target.tagName !== 'A') {
            target = target.parentElement;
        }
        if (target && target.tagName === 'A') {
            const href = target.getAttribute('href');
            const targetAttr = target.getAttribute('target');
            // 如果链接指定在新窗口打开
            if (href && (targetAttr === '_blank' || targetAttr === '_new')) {
                e.preventDefault();        // 阻止默认行为
                e.stopPropagation();        // 阻止事件冒泡
                // 通过 sendToHost 通知宿主页面（renderer.js）创建新标签页
                ipcRenderer.sendToHost('new-tab-request', href);
                return false;
            }
        }
    }, true);  // true = 捕获阶段

    /**
     * 鼠标悬停在链接上时，通知状态栏显示链接 URL
     */
    document.addEventListener('mouseover', (e) => {
        let target = e.target;
        while (target && target.tagName !== 'A') {
            target = target.parentElement;
        }
        if (target && target.tagName === 'A') {
            const href = target.getAttribute('href');
            if (href) {
                ipcRenderer.sendToHost('link-hover', href);
            }
        }
    }, true);

    /**
     * 鼠标移出链接时，清空状态栏
     */
    document.addEventListener('mouseout', (e) => {
        let target = e.target;
        while (target && target.tagName !== 'A') {
            target = target.parentElement;
        }
        if (target && target.tagName === 'A') {
            ipcRenderer.sendToHost('link-hover', '');  // 空字符串表示移出
        }
    }, true);

    /**
     * 劫持 window.open
     * 许多网站通过 window.open 打开新窗口，改为新建标签页
     */
    window.open = function(url) {
        ipcRenderer.sendToHost('new-tab-request', url);
        return null;  // 返回 null，因为无法提供 window 引用
    };
});
