import { BaseParser } from './base-parser'

export class Alibaba1688Parser extends BaseParser {
  static get id() { return '1688' }
  static get name() { return '1688' }
  static get icon() { return '🏢' }
  static get pattern() { return /\/\/[^\/]*\.1688\.com(\/|$)/i }

  getExtractScript() {
    return `
      (function(){
        try{
          var result={
            title:'', price:'', shopName:'',
            mainImages:[], skuImages:[], detailImages:[],
            videoCover:'', mainVideo:''
          };
          
          // 标题提取 - 1688页面结构
          var titleEl=document.querySelector('.module-od-title h1')
            ||document.querySelector('.title-content h1')
            ||document.querySelector('.d-title')
            ||document.querySelector('[class*="title"] h1')
            ||document.querySelector('.mod-detail-title h1')
            ||document.querySelector('h1')
            ||document.querySelector('[class*="Title"]');
          if(titleEl) result.title=titleEl.textContent.trim();
          
          // 价格提取 - 1688价格被拆分成多个span
          var priceEl=document.querySelector('.price-info');
          if(priceEl){
            result.price=priceEl.textContent.trim();
          } else {
            priceEl=document.querySelector('[class*="price"] [class*="value"]')
              ||document.querySelector('[class*="Price"]')
              ||document.querySelector('.mod-detail-price .value');
            if(priceEl) result.price=priceEl.textContent.trim();
          }
          
          // 店铺名称
          var shopEl=document.querySelector('.company-name a')
            ||document.querySelector('[class*="shop"] a')
            ||document.querySelector('[class*="company"] a')
            ||document.querySelector('.mod-detail-company a');
          if(shopEl) result.shopName=shopEl.textContent.trim();
          
          // 主图提取 - 1688主图容器
          var mainSelectors=[
            '.detail-gallery-img img',
            '.mod-detail-gallery img',
            '[class*="gallery"] img',
            '[class*="thumb"] img',
            '#dt-tab img',
            '.tab-content img'
          ];
          for(var mi=0;mi<mainSelectors.length;mi++){
            var ims=document.querySelectorAll(mainSelectors[mi]);
            if(ims.length>0){
              ims.forEach(function(img){
                var src=(img.src||img.dataset.src||img.dataset.origin||'').trim();
                if(src&&src.indexOf('data:')!==0
                   &&src.indexOf('blank.gif')===-1
                   &&src.indexOf('loading')===-1
                   &&(src.indexOf('cbu')!==-1||src.indexOf('1688')!==-1||src.indexOf('alicdn')!==-1)){
                  if(result.mainImages.indexOf(src)===-1){
                    result.mainImages.push(src);
                  }
                }
              });
              if(result.mainImages.length>0) break;
            }
          }
          
          // SKU图提取 - 优先使用精确选择器
          var skuSelectors=[
            '.expand-view-item',
            '.feature-item .sku-filter-button',
            '.obj-sku .sku-item',
            '.mod-detail-obj-sku li'
          ];
          for(var si=0;si<skuSelectors.length;si++){
            var skuItems=document.querySelectorAll(skuSelectors[si]);
            skuItems.forEach(function(item){
              var img=item.querySelector('img');
              if(img){
                var src=(img.src||img.dataset.src||'').trim();
                // 移除缩略图后缀 _sum.jpg 或 _sum.png 等
                src=src.replace(/_sum\.(jpg|png|jpeg|gif|webp)/gi,'');
                // 移除URL参数
                if(src.indexOf('?')!==-1){
                  src=src.split('?')[0];
                }
                var isRealSkuImg=src.indexOf('cbu')!==-1
                  ||src.indexOf('1688')!==-1
                  ||src.indexOf('alicdn')!==-1;
                if(src&&isRealSkuImg){
                  var name='';
                  var labelEl=item.querySelector('.item-label')||item.querySelector('.label-name');
                  if(labelEl){
                    name=(labelEl.getAttribute('title')||labelEl.textContent||'').trim();
                  }
                  if(!name){
                    var spanEl=item.querySelector('span[title]');
                    if(spanEl){
                      name=spanEl.getAttribute('title');
                    }
                  }
                  result.skuImages.push({
                    url:src,
                    name:name||'SKU_'+(result.skuImages.length+1)
                  });
                }
              }
            });
            if(result.skuImages.length>0) break;
          }
          
          // 详情图提取 - 从页面源码提取detailUrl
          var detailUrl = '';
          var pageHtml = document.documentElement.outerHTML;
          var detailUrlMatch = pageHtml.match(/"detailUrl"\s*:\s*["']([^"']+)["']/);
          if (detailUrlMatch) {
            detailUrl = detailUrlMatch[1].replace(/\\u002F/g, '/').replace(/\\\//g, '/');
          }
          
          if (detailUrl && detailUrl.indexOf('http') === 0) {
            result.detailUrl = detailUrl;
            result.needFetchDetail = true;
          }
          
          // 视频提取 - 从页面源码提取videoUrl
          var videoUrlMatch = pageHtml.match(/"videoUrl"\s*:\s*"([^"]+)"/);
          if (videoUrlMatch && videoUrlMatch[1]) {
            var vUrl = videoUrlMatch[1];
            // 确保URL格式正确
            if (vUrl.indexOf('http') === 0) {
              result.mainVideo = vUrl;
            }
          }
          
          // 备用：查找video标签
          if (!result.mainVideo) {
            var videoEl=document.querySelector('video');
            if(videoEl){
              result.mainVideo=videoEl.src||videoEl.currentSrc||'';
            }
          }
          if (!result.mainVideo) {
            var videos=document.querySelectorAll('video');
            for(var vi=0;vi<videos.length;vi++){
              var v=videos[vi];
              var vSrc=v.src||v.currentSrc||v.dataset.src||'';
              if(vSrc&&vSrc.indexOf('data:')!==0){
                result.mainVideo=vSrc;
                break;
              }
            }
          }
          if (!result.mainVideo) {
            var sourceEl=document.querySelector('video source');
            if(sourceEl){
              result.mainVideo=sourceEl.src||'';
            }
          }
          
          return JSON.stringify(result);
        }catch(e){return JSON.stringify({error:e.message});}
      })()
    `
  }
}
