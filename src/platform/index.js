import { BaseParser } from './base-parser'

const _registry = {}
const _platformOrder = ['taobao', 'tmall', 'jd', '1688', 'alibaba']

export function register(ParserClass) {
  try {
    const id = ParserClass.id
    if (!id) {
      console.warn('[PlatformRegistry] 解析器缺少 id 属性，跳过注册')
      return false
    }
    _registry[id] = ParserClass
    if (!_platformOrder.includes(id)) {
      _platformOrder.push(id)
    }
    console.log('[PlatformRegistry] 已注册平台:', id, '-', ParserClass.name)
    return true
  } catch (err) {
    console.error('[PlatformRegistry] 注册失败:', err.message)
    return false
  }
}

export function detectPlatform(url) {
  if (!url) return null
  for (const id in _registry) {
    const ParserClass = _registry[id]
    if (ParserClass && typeof ParserClass.detect === 'function' && ParserClass.detect(url)) {
      return ParserClass.getConfig()
    }
  }
  return null
}

export function getParser(platformId) {
  const ParserClass = _registry[platformId]
  if (!ParserClass) return null
  try {
    return new ParserClass()
  } catch (err) {
    console.error('[PlatformRegistry] 实例化失败 (' + platformId + '):', err.message)
    return null
  }
}

export function getExtractScript(platformId) {
  const parser = getParser(platformId)
  if (parser && typeof parser.getExtractScript === 'function') {
    return parser.getExtractScript()
  }
  return getGenericExtractScript()
}

export function getGenericExtractScript() {
  return `
    (function(){
      try{
        var result={
          title:'',price:'',shopName:'',
          mainImages:[],skuImages:[],detailImages:[],
          videoCover:'',mainVideo:''
        };
        var t=document.querySelector('[data-spm="1000980"]')
          ||document.querySelector('.MainTitle--titleText')
          ||document.querySelector('h1')
          ||document.querySelector('[class*="title"]');
        if(t) result.title=t.textContent.trim();
        var p=document.querySelector('.Price-text')
          ||document.querySelector('#J_PromoPrice')
          ||document.querySelector('[class*="price"] [class*="current"]')
          ||document.querySelector('.p-price span:last-child')
          ||document.querySelector('[class*="price"]');
        if(p) result.price=p.textContent.trim();
        var s=document.querySelector('[class*="shop"] [class*="name"]')
          ||document.querySelector('.shop-name')
          ||document.querySelector('[class*="seller"]');
        if(s) result.shopName=s.textContent.trim();
        var ms=['[class*="mainPic"] img','[class*="pic"] img',
          '#J_UlThumb li img','.tb-thumb li img',
          '#spec-n1 img','.spec-image'];
        for(var mi=0;mi<ms.length;mi++){
          var ims=document.querySelectorAll(ms[mi]);
          if(ims.length>0){ims.forEach(function(img){
            var src=img.src||img.dataset.src||img.currentSrc||'';
            if(src&&src.indexOf('data:')!==0) result.mainImages.push(src);
          });break;}
        }
        var ds=['#J_Detail img','#desc-lazyload-container img',
          '[class*="detail-content"] img','.detail-content img',
          '.ssd-module img','#J_DivItemDesc img'];
        for(var di=0;di<ds.length;di++){
          document.querySelectorAll(ds[di]).forEach(function(img){
            var src=img.src||img.dataset.src||'';
            if(src&&src.indexOf('data:')!==0&&img.naturalWidth>50&&img.naturalHeight>50)
              result.detailImages.push(src);
          });
        }
        var vc=document.querySelector('[class*="video"] img');
        if(vc) result.videoCover=vc.src||'';
        var vs=document.querySelector('video source')||document.querySelector('video');
        if(vs) result.mainVideo=(vs.src||vs.currentSrc||'');
        return JSON.stringify(result);
      }catch(e){return JSON.stringify({error:e.message});}
    })()
  `
}

export function groupByPlatform(urlList) {
  const groups = {}
  const summary = { total: 0, recognized: 0, unknown: 0 }

  for (let i = 0; i < _platformOrder.length; i++) {
    groups[_platformOrder[i]] = []
  }
  groups.unknown = []

  const seen = new Set()

  for (let j = 0; j < urlList.length; j++) {
    const item = urlList[j]
    const normalized = item.url.replace(/\/+$/, '')

    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)

    summary.total++

    const plat = detectPlatform(normalized)
    if (plat) {
      if (!groups[plat.id]) groups[plat.id] = []
      groups[plat.id].push({
        url: normalized,
        platform: plat,
        valid: true,
        selected: item.selected !== false
      })
      summary.recognized++
    } else {
      groups.unknown.push({
        url: normalized,
        platform: null,
        valid: true,
        selected: item.selected !== false
      })
      summary.unknown++
    }
  }

  for (const gid in groups) {
    if (gid !== 'unknown' && groups[gid].length > 0) {
      summary[gid] = groups[gid].length
    }
  }

  return { groups, summary }
}

export function getAllPlatforms() {
  const list = []
  for (let i = 0; i < _platformOrder.length; i++) {
    const id = _platformOrder[i]
    if (_registry[id]) {
      list.push(_registry[id].getConfig())
    }
  }
  return list
}

export const PLATFORMS = {
  taobao: { id: 'taobao', name: '淘宝', icon: '🏪', pattern: /\/\/[^\/]*\.taobao\.com(\/|$)/i },
  tmall: { id: 'tmall', name: '天猫', icon: '🐱', pattern: /\/\/[^\/]*\.tmall\.com(\/|$)/i },
  jd: { id: 'jd', name: '京东', icon: '📦', pattern: /\/\/[^\/]*\.jd\.com(\/|$)/i },
  '1688': { id: '1688', name: '1688', icon: '🏢', pattern: /\/\/[^\/]*\.1688\.com(\/|$)/i },
  alibaba: { id: 'alibaba', name: '阿里巴巴国际站', icon: '🌐', pattern: /\/\/[^\/]*\.alibaba\.com(\/|$)/i }
}
