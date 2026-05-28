import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useTabsStore = defineStore('tabs', () => {
  const tabs = ref([])
  const activeTabId = ref(null)
  let tabCounter = 0

  const activeTab = computed(() => {
    return tabs.value.find(tab => tab.id === activeTabId.value)
  })

  function createNewTab(url = 'about:blank') {
    const tabId = `tab-${++tabCounter}`
    const tab = {
      id: tabId,
      title: '新标签页',
      url: url,
      favicon: '🌐',
      faviconType: 'emoji',
      isLoading: false
    }
    tabs.value.push(tab)
    activeTabId.value = tabId
    return tabId
  }

  function closeTab(tabId) {
    const index = tabs.value.findIndex(tab => tab.id === tabId)
    if (index === -1) return

    tabs.value.splice(index, 1)

    if (activeTabId.value === tabId) {
      if (tabs.value.length > 0) {
        const newIndex = Math.min(index, tabs.value.length - 1)
        activeTabId.value = tabs.value[newIndex].id
      } else {
        activeTabId.value = null
      }
    }
  }

  function switchTab(tabId) {
    activeTabId.value = tabId
  }

  function updateTab(tabId, updates) {
    const tab = tabs.value.find(t => t.id === tabId)
    if (tab) {
      Object.assign(tab, updates)
    }
  }

  return {
    tabs,
    activeTabId,
    activeTab,
    createNewTab,
    closeTab,
    switchTab,
    updateTab
  }
})
