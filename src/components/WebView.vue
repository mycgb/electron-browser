<template>
  <webview
    ref="webviewRef"
    :src="initialSrc"
    :style="{ display: visible ? 'flex' : 'none' }"
    class="webview"
    partition="persist:webview"
    allowpopups
  />
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useTabsStore } from '../stores/tabs'
import { useStatusStore } from '../stores/status'

const props = defineProps({
  tab: {
    type: Object,
    required: true
  },
  visible: {
    type: Boolean,
    default: false
  }
})

const tabsStore = useTabsStore()
const statusStore = useStatusStore()

const webviewRef = ref(null)

// 初始 src，只在组件创建时设置一次，之后不再变化
// 这样 Vue 不会在 did-navigate 更新 tab.url 后重设 src 导致循环导航
const initialSrc = ref(
  props.tab.url && props.tab.url !== 'about:blank' ? props.tab.url : 'about:blank'
)

// 记录当前 webview 实际正在加载的 URL，防止 did-navigate 更新 tab.url 后触发重复导航
let currentNavUrl = initialSrc.value !== 'about:blank' ? initialSrc.value : ''

onMounted(() => {
  if (webviewRef.value) {
    setupWebviewEvents()
  }
})

// 监听 tab.url 的外部变更（如地址栏输入），仅在 URL 确实不同时才通过 loadURL 导航
watch(() => props.tab.url, (newUrl) => {
  if (!webviewRef.value) return
  // 跳过由 did-navigate 触发的相同 URL 更新，避免循环
  if (newUrl === currentNavUrl) return
  if (newUrl && newUrl !== 'about:blank') {
    currentNavUrl = newUrl
    webviewRef.value.loadURL(newUrl)
  }
})

function setupWebviewEvents() {
  const webview = webviewRef.value

  // 获取 webview 的 webContentsId 并存储到 tab 中，供导航控制使用
  webview.addEventListener('dom-ready', () => {
    try {
      const wcId = webview.getWebContentsId()
      tabsStore.updateTab(props.tab.id, { webContentsId: wcId })
    } catch (e) {
      // webview 尚未准备好时忽略
    }
  })

  webview.addEventListener('did-start-loading', () => {
    tabsStore.updateTab(props.tab.id, { 
      isLoading: true, 
      favicon: '⏳',
      faviconType: 'emoji'
    })
    if (props.visible) {
      statusStore.setStatus('加载中...')
    }
  })

  webview.addEventListener('did-stop-loading', () => {
    tabsStore.updateTab(props.tab.id, { isLoading: false })
    if (props.visible) {
      statusStore.setStatus('就绪')
    }
    if (props.tab.faviconType !== 'image') {
      tabsStore.updateTab(props.tab.id, { 
        favicon: '🌐',
        faviconType: 'emoji'
      })
    }
    // 通知主进程页面加载完成
    try {
      const wcId = webview.getWebContentsId()
      window.electronAPI.ipcRenderer.send('webview-did-finish-load', wcId)
    } catch (e) {}
  })

  webview.addEventListener('page-title-updated', (e) => {
    tabsStore.updateTab(props.tab.id, { title: e.title })
  })

  webview.addEventListener('page-favicon-updated', (e) => {
    if (e.favicons && e.favicons.length > 0) {
      const faviconUrl = e.favicons[0]
      tabsStore.updateTab(props.tab.id, { 
        favicon: faviconUrl,
        faviconType: 'image'
      })
    }
  })

  webview.addEventListener('did-navigate', (e) => {
    currentNavUrl = e.url
    tabsStore.updateTab(props.tab.id, { url: e.url })
    if (props.visible) {
      statusStore.setStatus('就绪')
    }
  })

  webview.addEventListener('did-navigate-in-page', (e) => {
    currentNavUrl = e.url
    tabsStore.updateTab(props.tab.id, { url: e.url })
  })

  webview.addEventListener('new-window', (e) => {
    e.preventDefault()
    tabsStore.createNewTab(e.url)
  })

  webview.addEventListener('ipc-message', (e) => {
    if (e.channel === 'new-tab-request') {
      const url = e.args[0]
      if (url) {
        try {
          const absoluteUrl = new URL(url, webview.getURL()).href
          tabsStore.createNewTab(absoluteUrl)
        } catch (err) {
          tabsStore.createNewTab(url)
        }
      }
    }
    if (e.channel === 'link-hover') {
      const href = e.args[0]
      if (props.visible) {
        if (href) {
          statusStore.setStatus(href)
        } else {
          statusStore.setStatus(props.tab.isLoading ? '加载中...' : '就绪')
        }
      }
    }
  })

  webview.addEventListener('update-target-url', (e) => {
    if (props.visible) {
      if (e.url) {
        statusStore.setStatus(e.url)
      } else {
        statusStore.setStatus(props.tab.isLoading ? '加载中...' : '就绪')
      }
    }
  })

  webview.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3) {
      return
    }
    console.error('WebView load failed:', e.errorDescription)
    if (props.visible) {
      statusStore.setStatus(`加载失败: ${e.errorDescription}`)
    }
  })
}

watch(() => props.visible, (visible) => {
  if (visible && webviewRef.value) {
    webviewRef.value.focus()
  }
})
</script>

<style scoped>
.webview {
  width: 100%;
  height: 100%;
  border: none;
}
</style>
