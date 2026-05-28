import { BaseParser } from './base-parser'

export class JdParser extends BaseParser {
  static get id() { return 'jd' }
  static get name() { return '京东' }
  static get icon() { return '📦' }
  static get pattern() { return /\/\/[^\/]*\.jd\.com(\/|$)/i }

  getExtractScript() {
    return `
      (function(){
        try{
          var result={
            title:'', price:'', shopName:'',
            mainImages:[], skuImages:[], detailImages:[],
            videoCover:'', mainVideo:''
          };
          
          // URL处理函数：删除.avif后缀，替换尺寸
          function processJdUrl(url,needResize){
            if(!url||typeof url!=='string') return '';
            try{
              // 删除.avif后缀
              url=url.replace(/\\.avif$/i,'');
              // 是否需要替换尺寸（主图和SKU图需要，详情图不需要）
              if(needResize){
                // 替换尺寸为高清版本
                url=url.replace(/s\\d+x\\d+/g,'s800x800');
                // 如果URL中没有尺寸参数，尝试添加高清尺寸
                if(url.indexOf('jfs/')!==-1&&url.indexOf('s800x800')===-1){
                  // 处理 img/jfs/ 格式，替换为 s800x800_jfs/
                  url=url.replace(/\\/img\\/jfs\\//,'/s800x800_jfs/');
                  // 处理 n7/jfs/ 等格式，替换为 s800x800_jfs/
                  url=url.replace(/\\/n\\d+\\/jfs\\//,'/s800x800_jfs/');
                }
              }
              return url;
            }catch(e){
              console.error('processJdUrl error:',e);
              return url;
            }
          }
          
          // 标题提取 - 京东页面结构
          var titleEl=document.querySelector('.sku-title-name')
            ||document.querySelector('.sku-name')
            ||document.querySelector('[class*="itemInfo"] [class*="name"]')
            ||document.querySelector('h1')
            ||document.querySelector('[class*="title"]');
          if(titleEl) result.title=titleEl.textContent.trim();
          
          // 价格提取
          var priceEl=document.querySelector('.p-price .price')
            ||document.querySelector('[class*="price"] [class*="value"]')
            ||document.querySelector('[class*="price"]');
          if(priceEl) result.price=priceEl.textContent.trim();
          
          // 店铺名称
          var shopEl=document.querySelector('.name a')
            ||document.querySelector('[class*="shop"] a')
            ||document.querySelector('[class*="store"] a');
          if(shopEl) result.shopName=shopEl.textContent.trim();
          
          // 主图提取 - 京东主图容器
          var mainSelectors=[
            '.image-carousel-content .item img.image',
            '.image-carousel-content img.image',
            '#spec-list li img',
            '#spec-n1 img',
            '.preview-wrap img',
            '[class*="preview"] img',
            '#J-p-imgWrap img'
          ];
          for(var mi=0;mi<mainSelectors.length;mi++){
            var ims=document.querySelectorAll(mainSelectors[mi]);
            if(ims.length>0){
              ims.forEach(function(img){
                var src=img.src||img.dataset.src||img.dataset.origin||'';
                // 过滤播放图标和占位图
                if(src&&src.indexOf('data:')!==0
                   &&src.indexOf('blank.gif')===-1
                   &&src.indexOf('thumbnails-play-icon')===-1
                   &&src.indexOf('jfs/')!==-1){
                  // 处理URL：删除.avif，替换尺寸（主图需要高清）
                  src=processJdUrl(src,true);
                  // 去重
                  if(result.mainImages.indexOf(src)===-1){
                    result.mainImages.push(src);
                  }
                }
              });
              if(result.mainImages.length>0) break;
            }
          }
          
          // SKU图提取 - 同时提取名称
          var skuSelectors=[
            '.specification-item-sku.has-image',
            '#choose-attr-1 .item',
            '[class*="sku"] .item',
            '[class*="choose"] li',
            '#spec-list li'
          ];
          for(var si=0;si<skuSelectors.length;si++){
            var skuItems=document.querySelectorAll(skuSelectors[si]);
            skuItems.forEach(function(item){
              var img=item.querySelector('img');
              var textEl=item.querySelector('.specification-item-sku-text')
                ||item.querySelector('a')
                ||item.querySelector('[class*="text"]')
                ||item.querySelector('span')
                ||item;
              if(img){
                var src=img.src||img.dataset.src||'';
                // 只保留真实的SKU图片
                var isRealSkuImg=src.indexOf('jfs/')!==-1
                  ||src.indexOf('img14.360buyimg.com')!==-1
                  ||src.indexOf('img30.360buyimg.com')!==-1;
                if(src&&isRealSkuImg){
                  // 处理URL：删除.avif，替换尺寸（SKU图需要高清）
                  src=processJdUrl(src,true);
                  var name='';
                  if(textEl){
                    name=textEl.getAttribute('alt')||textEl.getAttribute('title')||textEl.textContent.trim()||'';
                  }
                  if(!name&&img.getAttribute('alt')){
                    name=img.getAttribute('alt');
                  }
                  result.skuImages.push({
                    url:src,
                    name:name||'SKU_'+(result.skuImages.length+1)
                  });
                }
              }
            });
          }
          
          // 详情图提取 - 优先获取data-src（懒加载图片）
          var detailSelectors=[
            '#detail-main img.shop-editor-floor',
            '#detail-main img',
            '#J-detail-content img',
            '#detail img',
            '.detail-content img',
            '[class*="detail"] img',
            '#J-detail img'
          ];
          for(var di=0;di<detailSelectors.length;di++){
            document.querySelectorAll(detailSelectors[di]).forEach(function(img){
              // 优先获取data-src（懒加载），其次src
              var src=img.dataset.lazyload||img.dataset.src||img.src||'';
              // 过滤占位图和无效图片
              if(src&&src.indexOf('data:')!==0&&src.indexOf('blank.gif')===-1&&src.indexOf('loading.gif')===-1&&src.indexOf('jfs/')!==-1){
                // 处理URL：删除.avif（详情图不需要添加尺寸）
                src=processJdUrl(src,false);
                // 去重
                if(result.detailImages.indexOf(src)===-1){
                  result.detailImages.push(src);
                }
              }
            });
          }
          
          // 视频提取 - 多种方式查找
          var videoEl=document.querySelector('video');
          if(videoEl){
            result.mainVideo=videoEl.src||videoEl.currentSrc||'';
          }
          // 如果没有找到，尝试查找video标签的其他属性
          if(!result.mainVideo){
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
          // 尝试查找source标签
          if(!result.mainVideo){
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
