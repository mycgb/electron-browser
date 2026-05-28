# Electron Browser - Vue3 + Element Plus 版本

基于 Electron + Vue3 + Element Plus 的现代化浏览器应用。

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **Vue 3** - 渐进式 JavaScript 框架
- **Element Plus** - Vue 3 UI 组件库
- **Pinia** - Vue 3 状态管理
- **Vite** - 下一代前端构建工具

## 项目结构

```
eletron-Brower/
├── main.js              # Electron 主进程
├── preload.js           # 预加载脚本
├── webview-preload.js   # webview 预加载脚本
├── src/                 # Vue3 源码目录
│   ├── main.js          # Vue 入口文件
│   ├── App.vue          # 根组件
│   ├── index.html       # HTML 模板
│   ├── components/      # Vue 组件
│   │   ├── TabBar.vue
│   │   ├── AddressBar.vue
│   │   ├── WebView.vue
│   │   ├── NetworkPanel.vue
│   │   ├── DownloadsPanel.vue
│   │   └── StatusBar.vue
│   ├── stores/          # Pinia 状态管理
│   │   ├── tabs.js
│   │   ├── network.js
│   │   └── downloads.js
│   └── styles/          # 样式文件
│       └── main.css
├── vite.config.js       # Vite 配置
└── package.json         # 项目配置
```

## 安装依赖

```bash
npm install
```

## 开发模式

```bash
# 启动 Vite 开发服务器和 Electron
npm run electron:dev
```

## 生产构建

```bash
# 构建 Vue 应用
npm run build

# 打包 Electron 应用
npm run electron:build

# 打包 Windows 版本
npm run electron:build:win

# 打包 macOS 版本
npm run electron:build:mac

# 打包 Linux 版本
npm run electron:build:linux
```

## 功能特性

- ✅ 多标签页浏览
- ✅ 地址栏导航
- ✅ 前进/后退/刷新
- ✅ 网络请求监控
- ✅ 资源下载管理
- ✅ 开发者工具
- ✅ 自定义窗口控制

## 快捷键

- `F12` - 打开/关闭网络监控面板
- `Shift + F12` - 打开开发者工具
- `Ctrl/Cmd + T` - 新建标签页
- `Ctrl/Cmd + W` - 关闭当前标签页

## 开发说明

### 主进程 (main.js)

- 创建和管理应用窗口
- 处理网络请求拦截
- 提供 IPC 通信接口

### 渲染进程 (Vue3)

- 使用 Vue 3 Composition API
- Pinia 状态管理
- Element Plus UI 组件

### 状态管理

- `tabs.js` - 标签页状态
- `network.js` - 网络请求状态
- `downloads.js` - 下载管理状态

## 注意事项

1. 开发模式下需要先启动 Vite 开发服务器
2. 生产模式下需要先构建 Vue 应用
3. webview 标签需要在主进程中启用
4. CSP 策略需要在主进程中配置
