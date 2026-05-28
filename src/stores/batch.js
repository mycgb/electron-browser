import { defineStore } from 'pinia'
import { ref } from 'vue'
import { detectPlatform, groupByPlatform, register, getExtractScript as getPlatformExtractScript } from '../platform'
import { useSettingsStore } from './settings'
import { useStatusStore } from './status'
import { useAuthStore } from './auth'
import { sanitizeTitle, sanitizeFileName } from '../utils/sanitize'
import { TaobaoParser } from '../platform/taobao'
import { TmallParser } from '../platform/tmall'
import { JdParser } from '../platform/jd'
import { Alibaba1688Parser } from '../platform/alibaba1688'
import { AlibabaParser } from '../platform/alibaba'

// 注册平台解析器
register(TaobaoParser)
register(TmallParser)
register(JdParser)
register(Alibaba1688Parser)
register(AlibabaParser)

export const useBatchStore = defineStore('batch', () => {
  const panelVisible = ref(false)
  const currentStep = ref(1)
  const urlInput = ref('')
  const urlList = ref([])
  const groups = ref({})
  const summary = ref({ total: 0, recognized: 0, unknown: 0 })
  const collecting = ref(false)
  const collectProgress = ref(0)
  const collectResults = ref([])
  const downloadStats = ref({ success: 0, fail: 0 })

  function togglePanel() {
    panelVisible.value = !panelVisible.value
  }

  function showPanel() {
    panelVisible.value = true
  }

  function hidePanel() {
    panelVisible.value = false
  }

  function resetState() {
    currentStep.value = 1
    urlInput.value = ''
    urlList.value = []
    groups.value = {}
    summary.value = { total: 0, recognized: 0, unknown: 0 }
    collecting.value = false
    collectProgress.value = 0
    collectResults.value = []
    downloadStats.value = { success: 0, fail: 0 }
  }

  function parseUrls() {
    const lines = urlInput.value.split('\n').map(line => line.trim()).filter(line => line)
    const urls = []
    const seen = new Set()

    for (const line of lines) {
      let url = line
      try {
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          url = 'https://' + url
        }
        const urlObj = new URL(url)
        const normalized = urlObj.href.replace(/\/+$/, '')
        if (!seen.has(normalized)) {
          seen.add(normalized)
          urls.push({
            url: normalized,
            valid: true,
            selected: true
          })
        }
      } catch (e) {
        urls.push({
          url: line,
          valid: false,
          selected: false,
          error: '无效URL'
        })
      }
    }

    urlList.value = urls
    return urls
  }

  function groupUrls() {
    const validUrls = urlList.value.filter(u => u.valid)
    const result = groupByPlatform(validUrls)
    groups.value = result.groups
    summary.value = result.summary
    currentStep.value = 2
    return result
  }

  function toggleUrlSelection(url) {
    const item = urlList.value.find(u => u.url === url)
    if (item) {
      item.selected = !item.selected
    }
  }

  function selectAllInGroup(platformId) {
    const group = groups.value[platformId]
    if (group) {
      group.forEach(item => {
        item.selected = true
      })
    }
  }

  function deselectAllInGroup(platformId) {
    const group = groups.value[platformId]
    if (group) {
      group.forEach(item => {
        item.selected = false
      })
    }
  }

  async function startCollection(webviewManager) {
    collecting.value = true
    collectProgress.value = 0
    collectResults.value = []
    
    const settingsStore = useSettingsStore()
    const statusStore = useStatusStore()
    const authStore = useAuthStore()
    const saveDir = settingsStore.getSavePath()
    
    if (!saveDir) {
      collecting.value = false
      return collectResults.value
    }

    const allUrls = []
    for (const platformId in groups.value) {
      groups.value[platformId].forEach(item => {
        if (item.selected) {
          allUrls.push({ ...item, platformId })
        }
      })
    }

    if (allUrls.length === 0) {
      collecting.value = false
      return collectResults.value
    }

    // 检查登录和点数
    if (!authStore.isLoggedIn) {
      statusStore.setStatus('请先登录后再进行批量下载')
      collecting.value = false
      return collectResults.value
    }

    const pointsCheck = await authStore.checkPoints()
    if (!pointsCheck.ok) {
      statusStore.setStatus(pointsCheck.error)
      collecting.value = false
      return collectResults.value
    }
    if (pointsCheck.points < allUrls.length) {
      statusStore.setStatus(`点数不足，当前剩余${pointsCheck.points}点，需要${allUrls.length}点`)
      collecting.value = false
      return collectResults.value
    }

    statusStore.setStatus(`开始批量采集，共${allUrls.length}个链接`)

    const total = allUrls.length
    let completed = 0
    let totalDownloaded = 0
    let totalFailed = 0

    for (const item of allUrls) {
      try {
        statusStore.setStatus(`正在采集: ${item.url}`)
        
        // 导航到URL
        if (webviewManager.navigateTo) {
          await webviewManager.navigateTo(item.url)
        }
        
        // 等待页面加载 - 增加等待时间确保页面完全加载
        await new Promise(resolve => setTimeout(resolve, 2500))
        
        // 采集数据
        const result = await collectSingleUrl(webviewManager, item.url, item.platformId)
        
        console.log('[Batch] 采集结果:', item.url, '标题:', result.data?.title, '店铺:', result.data?.shopName)
        
        // 处理1688的detailUrl
        if (result.success && result.data?.needFetchDetail && result.data?.detailUrl) {
          try {
            const detailContent = await window.electronAPI.fetchUrl(result.data.detailUrl)
            if (detailContent) {
              let htmlContent = ''
              const jsonMatch = detailContent.match(/var\s+offer_details\s*=\s*(\{[\s\S]*\});?\s*$/)
              if (jsonMatch) {
                try {
                  const jsonData = JSON.parse(jsonMatch[1])
                  htmlContent = jsonData.content || ''
                } catch (e) {}
              }
              if (!htmlContent) {
                htmlContent = detailContent
              }
              
              const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi
              let match
              while ((match = imgRegex.exec(htmlContent)) !== null) {
                let src = match[1]
                if (src && src.indexOf('alicdn.com') !== -1) {
                  if (src.indexOf('?') !== -1) {
                    src = src.split('?')[0]
                  }
                  if (!result.data.detailImages) {
                    result.data.detailImages = []
                  }
                  if (result.data.detailImages.indexOf(src) === -1) {
                    result.data.detailImages.push(src)
                  }
                }
              }
            }
          } catch (e) {
            console.error('[1688] Failed to fetch detailUrl:', e)
          }
        }
        
        // 处理阿里巴巴国际站的detailUrl
        if (result.success && result.platformId === 'alibaba' && result.data?.needFetchDetail && result.data?.detailUrl) {
          try {
            console.log('[Alibaba] Fetching detail URL:', result.data.detailUrl)
            const detailContent = await window.electronAPI.fetchUrl(result.data.detailUrl)
            console.log('[Alibaba] Detail content length:', detailContent?.length)
            if (detailContent) {
              // 解析JSON响应
              let htmlContent = ''
              try {
                const jsonData = JSON.parse(detailContent)
                htmlContent = jsonData.data?.productHtmlDescription || ''
                console.log('[Alibaba] HTML content length:', htmlContent.length)
              } catch (e) {
                console.log('[Alibaba] Not JSON format, using as HTML')
                htmlContent = detailContent
              }
              
              if (htmlContent) {
                // detailSellerRecommend是React组件无inline图片，detailManyImage在后面不能截断
                // 直接从全量HTML提取所有data-src图片
                const dataSrcRegex = /data-src=["']([^"']+)["']/gi
                let match
                while ((match = dataSrcRegex.exec(htmlContent)) !== null) {
                  let src = match[1]
                  if (src.indexOf('alicdn.com') !== -1) {
                    if (src.indexOf('//') === 0) src = 'https:' + src
                    if (src.indexOf('?') !== -1) src = src.split('?')[0]
                    if (!result.data.detailImages) result.data.detailImages = []
                    if (result.data.detailImages.indexOf(src) === -1) result.data.detailImages.push(src)
                  }
                }

                // 第二步：提取所有src（排除placeholder）
                const srcRegex = /<img[^>]+src=["']([^"']+)["']/gi
                while ((match = srcRegex.exec(htmlContent)) !== null) {
                  let src = match[1]
                  if (!src || src.indexOf('placeholder') !== -1 || src.indexOf('data:') === 0) continue
                  if (src.indexOf('alicdn.com') !== -1) {
                    if (src.indexOf('//') === 0) src = 'https:' + src
                    if (src.indexOf('?') !== -1) src = src.split('?')[0]
                    if (!result.data.detailImages) result.data.detailImages = []
                    if (result.data.detailImages.indexOf(src) === -1) result.data.detailImages.push(src)
                  }
                }
                console.log('[Alibaba] Detail images:', result.data.detailImages)
              }
            }
          } catch (e) {
            console.error('[Alibaba] Failed to fetch detailUrl:', e)
          }
        }
        
        collectResults.value.push(result)
        
        // 立即下载该商品的所有资源
        if (result.success && result.data) {
          statusStore.setStatus(`正在下载: ${result.data.title || item.url}`)
          const downloadResult = await downloadSingleProduct(result, saveDir, settingsStore)
          totalDownloaded += downloadResult.success
          totalFailed += downloadResult.fail
        }
        
      } catch (error) {
        collectResults.value.push({
          url: item.url,
          platformId: item.platformId,
          success: false,
          error: error.message
        })
      }
      completed++
      collectProgress.value = Math.round((completed / total) * 100)
    }

    collecting.value = false
    currentStep.value = 3
    downloadStats.value = { success: totalDownloaded, fail: totalFailed }
    
    // 批量扣除点数
    const deductUrls = collectResults.value
      .filter(r => r.success)
      .map(r => ({ url: r.url || '', platform: r.platformId || '' }))
    
    if (deductUrls.length > 0) {
      const deductResult = await authStore.deductPointsBatch(deductUrls)
      if (deductResult.ok) {
        statusStore.setStatus(`批量下载完成: 成功${totalDownloaded}个, 失败${totalFailed}个 | 扣除${deductResult.totalCost}点, 剩余${deductResult.balance}点`)
      } else {
        statusStore.setStatus(`批量下载完成: 成功${totalDownloaded}个, 失败${totalFailed}个 | 扣点失败`)
      }
    } else {
      statusStore.setStatus(`批量下载完成: 成功${totalDownloaded}个, 失败${totalFailed}个`)
    }
    
    return collectResults.value
  }
  
  async function downloadSingleProduct(result, saveDir, settingsStore) {
    const data = result.data
    const resources = []
    
    // 使用sanitizeTitle处理标题，如果解析不到标题，使用URL作为后备
    const productTitle = sanitizeTitle(data.title || result.url || '未知商品')
    
    ;(data.mainImages || []).forEach((url, i) => {
      resources.push({ url, type: 'mainImg', label: `主图_${i + 1}`, index: i })
    })
    ;(data.detailImages || []).forEach((url, i) => {
      resources.push({ url, type: 'detailImg', label: `详情图_${i + 1}`, index: i })
    })
    ;(data.skuImages || []).forEach((sku, i) => {
      const skuData = typeof sku === 'object' ? sku : { url: sku, name: `SKU_${i + 1}` }
      resources.push({ url: skuData.url, type: 'skuImg', label: skuData.name || `SKU_${i + 1}`, index: i })
    })
    if (data.mainVideo) {
      resources.push({ url: data.mainVideo, type: 'mainVideo', label: '主视频', index: 0 })
    }
    
    let success = 0
    let fail = 0
    const downloadedFiles = []
    
    for (const resource of resources) {
      try {
        const filename = generateFilename(resource)
        const filePath = await settingsStore.buildSavePath(
          productTitle,
          resource.type,
          filename
        )
        await window.electronAPI.downloadResource(resource.url, filePath)
        downloadedFiles.push({
          type: resource.type,
          label: resource.label,
          url: resource.url,
          path: filePath
        })
        success++
      } catch (error) {
        console.error('Download failed:', error)
        fail++
      }
    }
    
    // 导出数据文件
    if (success > 0) {
      try {
        await exportDataFiles(result, downloadedFiles, productTitle, settingsStore)
      } catch (error) {
        console.error('Export data files failed:', error)
      }
    }
    
    return { success, fail }
  }
  
  async function exportDataFiles(result, downloadedFiles, productTitle, settingsStore) {
    const collectTime = new Date().toLocaleString('zh-CN')
    const safeTitle = sanitizeFileName(productTitle)
    const data = result.data
    
    // 生成CSV内容
    const csvRows = []
    csvRows.push(['字段', '内容'])
    csvRows.push(['商品标题', productTitle])
    csvRows.push(['价格', data.price || ''])
    csvRows.push(['店铺', data.shopName || ''])
    csvRows.push(['平台', result.platformName || ''])
    csvRows.push(['商品链接', result.url || ''])
    csvRows.push(['采集时间', collectTime])
    csvRows.push([])
    csvRows.push(['资源类型', '资源名称', '资源链接', '本地路径'])
    
    downloadedFiles.forEach(file => {
      csvRows.push([file.type, file.label, file.url, file.path])
    })
    
    const csvContent = '\uFEFF' + csvRows.map(row => row.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(',')).join('\n')
    
    // 生成URL快捷方式内容
    const urlContent = `[InternetShortcut]\r\nURL=${result.url || ''}\r\n`
    
    // 计算保存路径 - 保存到商品标题文件夹根目录
    let exportDir = settingsStore.getSavePath() || ''
    const allSettings = settingsStore.getSettings()
    const fs = allSettings.folderStructure
    
    if (fs && fs.enabled && fs.byTitle && productTitle) {
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

  async function collectSingleUrl(webviewManager, url, platformId) {
    return new Promise((resolve, reject) => {
      const platform = detectPlatform(url)
      
      const executeExtract = () => {
        const script = getExtractScript(platform?.id);
        webviewManager.executeScript(url, script, (result) => {
          if (result.error) {
            reject(new Error(result.error));
          } else {
            // 确保标题存在
            if (!result.title) {
              result.title = url
            }
            resolve({
              url,
              platformId,
              platformName: platform?.name || '未知',
              success: true,
              data: result
            });
          }
        });
      };
      
      // 京东需要滚动触发懒加载
      if (platform?.id === 'jd') {
        const scrollScript = `
          (function(){
            return new Promise((resolve) => {
              var detailEl = document.querySelector('#detail');
              if (detailEl) {
                detailEl.scrollIntoView({ behavior: 'instant', block: 'start' });
              }
              const maxScroll = Math.min(document.body.scrollHeight, 10000);
              const scrollStep = 1000;
              let scrolled = 0;
              const scrollInterval = setInterval(() => {
                window.scrollBy(0, scrollStep);
                scrolled += scrollStep;
                if (scrolled >= maxScroll) {
                  clearInterval(scrollInterval);
                  setTimeout(() => {
                    window.scrollTo(0, 0);
                    resolve();
                  }, 1000);
                }
              }, 500);
            });
          })()
        `;
        
        webviewManager.executeScript(url, scrollScript, () => {
          executeExtract();
        });
      } 
      // 1688需要等待页面数据加载
      else if (platform?.id === '1688') {
        setTimeout(() => {
          executeExtract();
        }, 2000);
      }
      // 阿里巴巴国际站需要等待页面加载
      else if (platform?.id === 'alibaba') {
        setTimeout(() => {
          executeExtract();
        }, 3000);
      }
      // 其他平台直接执行
      else {
        executeExtract();
      }
    });
  }

  function getExtractScript(platformId) {
    return getPlatformExtractScript(platformId)
  }

  function generateFilename(resource) {
    const ext = getFileExt(resource.url)
    const type = resource.type
    const index = resource.index + 1
    return `${type}_${index}${ext}`
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
    currentStep,
    urlInput,
    urlList,
    groups,
    summary,
    collecting,
    collectProgress,
    collectResults,
    downloadStats,
    togglePanel,
    showPanel,
    hidePanel,
    resetState,
    parseUrls,
    groupUrls,
    toggleUrlSelection,
    selectAllInGroup,
    deselectAllInGroup,
    startCollection
  }
})
