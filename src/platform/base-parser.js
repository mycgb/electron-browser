export const ResourceType = {
  MAIN_IMG: 'mainImg',
  SKU_IMG: 'skuImg',
  DETAIL_IMG: 'detailImg',
  VIDEO_COVER: 'videoCover',
  MAIN_VIDEO: 'mainVideo'
}

export function createResource(options) {
  return {
    type: options.type || ResourceType.MAIN_IMG,
    url: options.url || '',
    originalName: options.originalName || '',
    priority: options.priority !== undefined ? options.priority : 99,
    metadata: options.metadata || {}
  }
}

export function createProductInfo(options) {
  return {
    platformId: options.platformId || '',
    platformName: options.platformName || '',
    title: options.title || '',
    price: options.price || '',
    itemId: options.itemId || '',
    shopName: options.shopName || '',
    url: options.url || ''
  }
}

export function createParseResult(options) {
  const info = options.productInfo || {}
  return {
    platformId: info.platformId || 'unknown',
    platformName: info.platformName || '未知',
    title: info.title || '',
    price: info.price || '',
    shopName: info.shopName || '',
    itemId: info.itemId || '',
    url: info.url || '',
    resources: options.resources || {},
    stats: options.stats || calcStats(options.resources)
  }
}

export function calcStats(resources) {
  if (!resources) return emptyStats()
  return {
    mainImgCount: (resources.mainImg || []).length,
    skuImgCount: (resources.skuImg || []).length,
    detailImgCount: (resources.detailImg || []).length,
    videoCoverCount: (resources.videoCover || []).length,
    mainVideoCount: (resources.mainVideo || []).length,
    totalCount: countAll(resources)
  }
}

function emptyStats() {
  return { mainImgCount: 0, skuImgCount: 0, detailImgCount: 0, videoCoverCount: 0, mainVideoCount: 0, totalCount: 0 }
}

function countAll(res) {
  if (!res) return 0
  return (res.mainImg || []).length + (res.skuImg || []).length + (res.detailImg || []).length +
    (res.videoCover || []).length + (res.mainVideo || []).length
}

export function resolveUrl(src, pageUrl) {
  if (!src) return ''
  if (/^https?:\/\//i.test(src)) return src
  if (src.startsWith('//')) return 'https:' + src
  try {
    return new URL(src, pageUrl).href
  } catch (e) { return src }
}

export function getFileExt(url) {
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

export function sanitizeFileName(name) {
  return (name || '').replace(/[\\/:*?"<>|]/g, '_').substring(0, 80).trim() || 'unnamed'
}

export class BaseParser {
  static get id() { throw new Error('子类必须实现 static get id()') }
  static get name() { throw new Error('子类必须实现 static get name()') }
  static get icon() { return '🌐' }
  static get pattern() { throw new Error('子类必须实现 static get pattern()') }

  static detect(url) {
    if (!url) return false
    try {
      return this.pattern.test(url)
    } catch (e) {
      return false
    }
  }

  static getConfig() {
    return {
      id: this.id,
      name: this.name,
      icon: this.icon,
      pattern: this.pattern
    }
  }

  getExtractScript() {
    throw new Error('子类必须实现 getExtractScript()')
  }

  normalizeResult(data, pageUrl) {
    const self = this.constructor
    return createParseResult({
      productInfo: createProductInfo({
        platformId: self.id,
        platformName: self.name,
        title: data.title || '',
        price: data.price || '',
        itemId: this.extractItemId(pageUrl),
        shopName: data.shopName || '',
        url: pageUrl
      }),
      resources: {
        mainImg: (data.mainImages || []).map((u, i) =>
          createResource({ type: ResourceType.MAIN_IMG, url: u, originalName: 'main_' + (i + 1), priority: 1 })),
        skuImg: (data.skuImages || []).map((u, i) =>
          createResource({ type: ResourceType.SKU_IMG, url: u, originalName: 'sku_' + (i + 1), priority: 2 })),
        detailImg: (data.detailImages || []).map((u, i) =>
          createResource({ type: ResourceType.DETAIL_IMG, url: u, originalName: 'detail_' + (i + 1), priority: 3 })),
        videoCover: data.videoCover ? [createResource({ type: ResourceType.VIDEO_COVER, url: data.videoCover, originalName: 'cover', priority: 4 })] : [],
        mainVideo: data.mainVideo ? [createResource({ type: ResourceType.MAIN_VIDEO, url: data.mainVideo, originalName: 'video', priority: 5 })] : []
      }
    })
  }

  extractItemId(url) {
    try {
      const urlObj = new URL(url)
      const idParam = urlObj.searchParams.get('id') || urlObj.searchParams.get('itemId') || urlObj.searchParams.get('offerId')
      if (idParam) return idParam
      const match = url.match(/\/(\d{5,})(?=\.html|\/|\?|$)/)
      return match ? match[1] : urlObj.pathname.split('/').pop() || ''
    } catch (e) {
      return ''
    }
  }
}
