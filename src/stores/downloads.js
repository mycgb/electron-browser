import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useNetworkStore } from './network'

export const useDownloadsStore = defineStore('downloads', () => {
  const panelVisible = ref(false)
  const selectedItems = ref(new Set())
  const filterText = ref('')
  const filterType = ref('all')

  function togglePanel() {
    panelVisible.value = !panelVisible.value
  }

  function showPanel() {
    panelVisible.value = true
  }

  function hidePanel() {
    panelVisible.value = false
  }

  function toggleItem(requestId) {
    if (selectedItems.value.has(requestId)) {
      selectedItems.value.delete(requestId)
    } else {
      selectedItems.value.add(requestId)
    }
  }

  function selectAll(requests) {
    requests.forEach(req => {
      selectedItems.value.add(req.id)
    })
  }

  function deselectAll() {
    selectedItems.value.clear()
  }

  function setFilterText(text) {
    filterText.value = text
  }

  function setFilterType(type) {
    filterType.value = type
  }

  async function downloadSelected() {
    if (selectedItems.value.size === 0) {
      return false
    }

    const result = await window.electronAPI.showOpenDialog({
      title: '选择保存目录',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return false
    }

    const saveDir = result.filePaths[0]
    const network = useNetworkStore()
    let successCount = 0
    let failCount = 0

    for (const reqId of selectedItems.value) {
      const req = network.requests[reqId]
      if (req) {
        try {
          const filename = getFilenameFromUrl(req.url)
          const filePath = await window.electronAPI.joinPath(saveDir, filename)
          await window.electronAPI.downloadResource(req.url, filePath)
          successCount++
        } catch (error) {
          console.error('Download failed:', error)
          failCount++
        }
      }
    }

    return { successCount, failCount }
  }

  async function downloadAll(requests) {
    const result = await window.electronAPI.showOpenDialog({
      title: '选择保存目录',
      properties: ['openDirectory', 'createDirectory']
    })

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return false
    }

    const saveDir = result.filePaths[0]
    let successCount = 0
    let failCount = 0

    for (const req of requests) {
      try {
        const filename = getFilenameFromUrl(req.url)
        const filePath = await window.electronAPI.joinPath(saveDir, filename)
        await window.electronAPI.downloadResource(req.url, filePath)
        successCount++
      } catch (error) {
        console.error('Download failed:', error)
        failCount++
      }
    }

    return { successCount, failCount }
  }

  function getFilenameFromUrl(url) {
    try {
      const urlObj = new URL(url)
      let filename = urlObj.pathname.split('/').pop()
      
      if (!filename || filename === '') {
        filename = 'download'
      }
      
      filename = filename.split('?')[0]
      filename = filename.replace(/[<>:"/\\|?*]/g, '_')
      
      return filename
    } catch (e) {
      return 'download'
    }
  }

  return {
    panelVisible,
    selectedItems,
    filterText,
    filterType,
    togglePanel,
    showPanel,
    hidePanel,
    toggleItem,
    selectAll,
    deselectAll,
    setFilterText,
    setFilterType,
    downloadSelected,
    downloadAll
  }
})
