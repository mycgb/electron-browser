import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { sanitizeFolderName } from '../utils/sanitize'

const DEFAULT_SETTINGS = {
  savePath: '',
  requestInterval: 500,
  fileFormat: 'original',
  theme: 'default',
  collectCategories: {
    mainImg: true,
    skuImg: true,
    detailImg: true,
    videoCover: true,
    mainVideo: true
  },
  namingRule: '{type}_{index}',
  separator: '_',
  csvEncoding: 'utf8bom',
  folderStructure: {
    enabled: true,
    byTitle: true,
    byType: true,
    mainImgFolder: '主图',
    skuImgFolder: 'SKU图',
    detailImgFolder: '详情图',
    videoCoverFolder: '视频封面',
    mainVideoFolder: '视频'
  },
  proxy: {
    enabled: false,
    protocol: 'http',
    host: '',
    port: '',
    user: '',
    pass: ''
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const panelVisible = ref(false)
  const activeSection = ref('basic')
  
  const settings = ref(loadSettings())

  function loadSettings() {
    try {
      const saved = localStorage.getItem('appSettings')
      if (saved) {
        const parsed = JSON.parse(saved)
        const defaultSettings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
        const merged = { ...defaultSettings, ...parsed }
        if (parsed.folderStructure && typeof parsed.folderStructure === 'object') {
          merged.folderStructure = { ...defaultSettings.folderStructure, ...parsed.folderStructure }
        }
        if (parsed.collectCategories && typeof parsed.collectCategories === 'object') {
          merged.collectCategories = { ...defaultSettings.collectCategories, ...parsed.collectCategories }
        }
        if (parsed.proxy && typeof parsed.proxy === 'object') {
          merged.proxy = { ...defaultSettings.proxy, ...parsed.proxy }
        }
        return merged
      }
    } catch (e) {
      console.error('Failed to load settings:', e)
    }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
  }

  function saveSettings() {
    try {
      const settingsToSave = {
        savePath: settings.value.savePath,
        requestInterval: settings.value.requestInterval,
        fileFormat: settings.value.fileFormat,
        theme: settings.value.theme,
        collectCategories: { ...settings.value.collectCategories },
        namingRule: settings.value.namingRule,
        separator: settings.value.separator,
        csvEncoding: settings.value.csvEncoding,
        folderStructure: { ...settings.value.folderStructure },
        proxy: { ...settings.value.proxy }
      }
      localStorage.setItem('appSettings', JSON.stringify(settingsToSave))
      if (window.electronAPI?.updateProxy) {
        window.electronAPI.updateProxy(settings.value.proxy)
      }
    } catch (e) {
      console.error('Failed to save settings:', e)
    }
  }

  function resetSettings() {
    settings.value = JSON.parse(JSON.stringify(DEFAULT_SETTINGS))
    saveSettings()
  }

  function openPanel() {
    panelVisible.value = true
  }

  function closePanel() {
    panelVisible.value = false
  }

  function togglePanel() {
    panelVisible.value = !panelVisible.value
  }

  function setActiveSection(section) {
    activeSection.value = section
  }

  function selectFolder() {
    if (window.electronAPI?.selectFolder) {
      window.electronAPI.selectFolder().then((path) => {
        if (path) {
          settings.value.savePath = path
        }
      })
    }
  }

  function updateProxyFieldsState() {
    return settings.value.proxy.enabled
  }

  async function buildSavePath(productTitle, resourceType, filename) {
    const fs = settings.value.folderStructure
    let basePath = settings.value.savePath || ''

    if (!fs.enabled) {
      return window.electronAPI?.joinPath ? await window.electronAPI.joinPath(basePath, filename) : `${basePath}/${filename}`
    }

    if (fs.byTitle && productTitle) {
      basePath = window.electronAPI?.joinPath 
        ? await window.electronAPI.joinPath(basePath, sanitizeFolderName(productTitle))
        : `${basePath}/${sanitizeFolderName(productTitle)}`
    }

    if (fs.byType && resourceType) {
      const folderName = getFolderName(resourceType, fs)
      basePath = window.electronAPI?.joinPath 
        ? await window.electronAPI.joinPath(basePath, folderName)
        : `${basePath}/${folderName}`
    }

    if (window.electronAPI?.ensureDir) {
      await window.electronAPI.ensureDir(basePath)
    }

    return window.electronAPI?.joinPath 
      ? await window.electronAPI.joinPath(basePath, filename)
      : `${basePath}/${filename}`
  }

  function getFolderName(resourceType, folderSettings) {
    const folderMap = {
      mainImg: folderSettings.mainImgFolder || '主图',
      skuImg: folderSettings.skuImgFolder || 'SKU图',
      detailImg: folderSettings.detailImgFolder || '详情图',
      videoCover: folderSettings.videoCoverFolder || '视频封面',
      mainVideo: folderSettings.mainVideoFolder || '视频'
    }
    return folderMap[resourceType] || resourceType
  }

  watch(settings, saveSettings, { deep: true })

  return {
    panelVisible,
    activeSection,
    settings,
    openPanel,
    closePanel,
    togglePanel,
    setActiveSection,
    resetSettings,
    selectFolder,
    updateProxyFieldsState,
    getSavePath: () => settings.value.savePath || '',
    getSettings: () => settings.value,
    buildSavePath,
    getFolderName
  }
})
