import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useNetworkStore = defineStore('network', () => {
  const requests = ref({})
  const panelVisible = ref(false)
  const filterText = ref('')
  const filterType = ref('all')
  const detailRequest = ref(null)

  const filteredRequests = computed(() => {
    let result = Object.values(requests.value)

    if (filterType.value !== 'all') {
      const typeMap = {
        image: ['image'],
        media: ['video', 'audio', 'media'],
        xhr: ['xhr', 'fetch'],
        script: ['javascript', 'script'],
        stylesheet: ['stylesheet', 'css'],
        document: ['document', 'html']
      }
      const types = typeMap[filterType.value] || []
      result = result.filter(req => {
        const type = (req.type || '').toLowerCase()
        return types.some(t => type.includes(t))
      })
    }

    if (filterText.value) {
      const search = filterText.value.toLowerCase()
      result = result.filter(req => 
        req.url.toLowerCase().includes(search)
      )
    }

    return result
  })

  function addRequest(data) {
    const requestId = data.id
    
    if (!requests.value[requestId]) {
      requests.value[requestId] = {
        id: requestId,
        url: data.url,
        method: 'GET',
        type: 'other',
        status: 'pending',
        timestamp: data.timestamp,
        startTime: data.timestamp
      }
    }

    const req = requests.value[requestId]

    switch (data.type) {
      case 'request':
        req.url = data.url
        req.method = data.method || 'GET'
        req.type = data.resourceType || 'other'
        req.requestBody = data.requestBody
        req.startTime = data.timestamp
        req.requestTime = data.timestamp
        break
      case 'send':
        req.requestHeaders = data.requestHeaders
        break
      case 'response':
        req.status = data.statusCode
        req.statusCode = data.statusCode
        req.statusLine = data.statusLine
        req.responseTime = data.timestamp
        req.totalTime = data.timestamp - req.startTime
        req.responseHeaders = data.responseHeaders
        break
      case 'complete':
        req.completed = true
        break
      case 'error':
        req.error = data.error
        req.status = 'Error'
        break
    }
  }

  function updateRequest(requestId, updates) {
    if (requests.value[requestId]) {
      Object.assign(requests.value[requestId], updates)
    }
  }

  function setResponseBody(requestId, body) {
    if (requests.value[requestId]) {
      requests.value[requestId].responseBody = body
      requests.value[requestId].loadingBody = false
    }
  }

  function clearRequests() {
    requests.value = {}
  }

  function togglePanel() {
    panelVisible.value = !panelVisible.value
  }

  function setFilterText(text) {
    filterText.value = text
  }

  function setFilterType(type) {
    filterType.value = type
  }

  function showDetail(request) {
    detailRequest.value = request
  }

  function hideDetail() {
    detailRequest.value = null
  }

  function toggleDevTools() {
    if (window.electronAPI && window.electronAPI.toggleDevTools) {
      window.electronAPI.toggleDevTools()
    }
  }

  return {
    requests,
    panelVisible,
    filterText,
    filterType,
    detailRequest,
    filteredRequests,
    addRequest,
    updateRequest,
    setResponseBody,
    clearRequests,
    togglePanel,
    setFilterText,
    setFilterType,
    showDetail,
    hideDetail,
    toggleDevTools
  }
})
