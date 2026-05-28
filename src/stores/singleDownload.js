import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSettingsStore } from './settings'
import { sanitizeFileName, sanitizeTitle } from '../utils/sanitize'

export const useSingleDownloadStore = defineStore('singleDownload', () => {
  const panelVisible = ref(false)
  const loading = ref(false)
  const loadingText = ref('')
  const productInfo = ref({
    title: '',
    price: '',
    shopName: '',
    platformIcon: '🌐',
    platformName: '通用',
    url: ''
  })
  const resources = ref([])
  const downloading = ref(false)
  const downloadProgress = ref({ current: 0, total: 0 })

  function showPanel() {
    panelVisible.value = true
  }

  function hidePanel() {
    panelVisible.value = false
  }

  function togglePanel() {
    panelVisible.value = !panelVisible.value
  }

  function resetState() {
    productInfo.value = {
      title: '',
      price: '',
      shopName: '',
      platformIcon: '🌐',
      platformName: '通用',
      url: ''
    }
    resources.value = []
    loading.value = false
    loadingText.value = ''
    downloading.value = false
    downloadProgress.value = { current: 0, total: 0 }
  }

  function setLoading(text) {
    loading.value = true
    loadingText.value = text
  }

  function setProductInfo(info) {
    productInfo.value = { ...productInfo.value, ...info }
  }

  function setResources(res) {
    resources.value = res.map((r, index) => ({
      ...r,
      id: index,
      selected: true
    }))
  }

  function toggleResource(id) {
    const resource = resources.value.find(r => r.id === id)
    if (resource) {
      resource.selected = !resource.selected
    }
  }

  function selectAll() {
    resources.value.forEach(r => {
      r.selected = true
    })
  }

  function deselectAll() {
    resources.value.forEach(r => {
      r.selected = false
    })
  }

  const selectedResources = computed(() => {
    return resources.value.filter(r => r.selected)
  })

  const resourceStats = computed(() => {
    const stats = {
      mainImg: 0,
      skuImg: 0,
      detailImg: 0,
      videoCover: 0,
      mainVideo: 0
    }
    resources.value.forEach(r => {
      if (stats[r.type] !== undefined) {
        stats[r.type]++
      }
    })
    return stats
  })

  async function startDownload(saveDir) {
    const selected = selectedResources.value
    if (selected.length === 0) return { successCount: 0, failCount: 0 }

    const settingsStore = useSettingsStore()
    downloading.value = true
    downloadProgress.value = { current: 0, total: selected.length + 2 }

    let successCount = 0
    let failCount = 0
    const downloadedFiles = []

    for (const resource of selected) {
      try {
        const filename = generateFilename(resource)
        const filePath = await settingsStore.buildSavePath(
          productInfo.value.title,
          resource.type,
          filename
        )
        await window.electronAPI.downloadResource(resource.url, filePath)
        downloadedFiles.push({ type: resource.type, label: resource.label, url: resource.url, path: filePath })
        successCount++
      } catch (error) {
        console.error('Download failed:', error)
        failCount++
      }
      downloadProgress.value.current++
    }

    // 导出数据文件
    try {
      await exportDataFiles(saveDir, downloadedFiles)
      downloadProgress.value.current++
    } catch (error) {
      console.error('Export data files failed:', error)
    }

    downloading.value = false
    return { successCount, failCount }
  }

  async function exportDataFiles(saveDir, downloadedFiles) {
    const settingsStore = useSettingsStore()
    const collectTime = new Date().toLocaleString('zh-CN')
    const title = productInfo.value.title || '未知商品'
    const safeTitle = sanitizeFileName(title)

    // 生成CSV内容
    const csvRows = []
    csvRows.push(['字段', '内容'])
    csvRows.push(['商品标题', title])
    csvRows.push(['价格', productInfo.value.price || ''])
    csvRows.push(['平台', productInfo.value.platformName || ''])
    csvRows.push(['商品链接', productInfo.value.url || ''])
    csvRows.push(['采集时间', collectTime])
    csvRows.push([])
    csvRows.push(['资源类型', '资源名称', '资源链接', '本地路径'])

    downloadedFiles.forEach(file => {
      csvRows.push([file.type, file.label, file.url, file.path])
    })

    const csvContent = '\uFEFF' + csvRows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n')

    // 生成URL快捷方式内容
    const urlContent = `[InternetShortcut]\r\nURL=${productInfo.value.url || ''}\r\n`

    // 计算保存路径 - 保存到商品标题文件夹根目录
    let exportDir = settingsStore.getSavePath() || ''
    const allSettings = settingsStore.getSettings()
    const fs = allSettings.folderStructure
    
    if (fs && fs.enabled && fs.byTitle && title) {
      exportDir = await window.electronAPI.joinPath(exportDir, safeTitle)
    }

    // 确保目录存在
    await window.electronAPI.ensureDir(exportDir)

    // 保存文件
    const csvPath = await window.electronAPI.joinPath(exportDir, `${safeTitle}_数据.csv`)
    const urlPath = await window.electronAPI.joinPath(exportDir, `${safeTitle}_快捷方式.url`)

    await window.electronAPI.writeFile(csvPath, csvContent)
    await window.electronAPI.writeFile(urlPath, urlContent)
  }

  function generateFilename(resource) {
    const ext = getFileExt(resource.url)
    const label = sanitizeFileName(resource.label || resource.type)
    return `${label}${ext}`
  }

  function getFileExt(url) {
    if (!url) return '.jpg'
    const cleanUrl = url.split('?')[0].split('#')[0]
    const match = cleanUrl.match(/\.(\w{2,4})(?:_webp|_\d+x\d+)?$/i)
    if (match) {
      const ext = match[1].toLowerCase()
      if (ext === 'jpeg') return '.jpg'
      if (ext === 'webp') return '.png'
      return '.' + ext
    }
    if (/mp4|avi|mov|wmv|webm/i.test(cleanUrl)) return '.mp4'
    return '.jpg'
  }

  return {
    panelVisible,
    loading,
    loadingText,
    productInfo,
    resources,
    downloading,
    downloadProgress,
    showPanel,
    hidePanel,
    togglePanel,
    resetState,
    setLoading,
    setProductInfo,
    setResources,
    toggleResource,
    selectAll,
    deselectAll,
    selectedResources,
    resourceStats,
    startDownload
  }
})
