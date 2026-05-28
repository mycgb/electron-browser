import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useStatusStore = defineStore('status', () => {
  const statusText = ref('就绪')
  const statusInfo = ref('')
  const networkCount = ref(0)

  function setStatus(text) {
    statusText.value = text
  }

  function setStatusInfo(info) {
    statusInfo.value = info
  }

  function setNetworkCount(count) {
    networkCount.value = count
  }

  return {
    statusText,
    statusInfo,
    networkCount,
    setStatus,
    setStatusInfo,
    setNetworkCount
  }
})
