import { BaseParser } from './base-parser'

export class TmallParser extends BaseParser {
  static get id() { return 'tmall' }
  static get name() { return '天猫' }
  static get icon() { return '🐱' }
  static get pattern() { return /\/\/[^\/]*\.tmall\.com(\/|$)/i }

  getExtractScript() {
    return `
      (function(){
        try{
          var result={
            title:'', price:'', shopName:'',
            mainImages:[], skuImages:[], detailImages:[],
            videoCover:'', mainVideo:''
          };
          
          // 标题提取 - 优先从页面源码提取
          var pageHtml=document.documentElement.outerHTML;
          var titleMatch=pageHtml.match(/"title"\\s*:\\s*"([^"]+)"\\s*,\\s*"itemId"/);
          if(titleMatch&&titleMatch[1]){
            result.title=titleMatch[1];
          }
          // 如果源码提取失败，尝试DOM提取
          if(!result.title){
            var titleEl=document.querySelector('[class*="ItemTitle--"] span')
              ||document.querySelector('[class*="mainTitle"]')
              ||document.querySelector('h1')
              ||document.querySelector('[class*="title"]');
            if(titleEl) result.title=titleEl.textContent.trim();
          }
          
          // 价格提取
          var priceEl=document.querySelector('[class*="Price--"]')
            ||document.querySelector('[class*="price"] [class*="current"]')
            ||document.querySelector('[class*="price"]');
          if(priceEl) result.price=priceEl.textContent.trim();
          
          // 店铺名称
          var shopEl=document.querySelector('[class*="ShopHeader--"] a')
            ||document.querySelector('[class*="shopName"]')
            ||document.querySelector('[class*="shop"] a');
          if(shopEl) result.shopName=shopEl.textContent.trim();
          
          // 主图提取 - 优先从源码提取
          var imagesMatch=pageHtml.match(/"images"\\s*:\\s*\\[([^\\]]+)\\]/);
          if(imagesMatch&&imagesMatch[1]){
            var imagesStr=imagesMatch[1];
            var urlRegex=/"(https?:\\/\\/[^"]+)"/g;
            var urlMatch;
            while((urlMatch=urlRegex.exec(imagesStr))!==null){
              var imgUrl=urlMatch[1];
              if(imgUrl&&result.mainImages.indexOf(imgUrl)===-1){
                result.mainImages.push(imgUrl);
              }
            }
          }
          // 如果源码提取失败，尝试DOM提取
          if(result.mainImages.length===0){
            var mainSelectors=[
              '[class*="PicGallery--"] img',
              '[class*="mainPic"] img',
              '[class*="thumb"] img',
              '#J_UlThumb li img',
              '.tb-thumb li img',
              '[class*="pic"] img'
            ];
            for(var mi=0;mi<mainSelectors.length;mi++){
              var ims=document.querySelectorAll(mainSelectors[mi]);
              if(ims.length>0){
                ims.forEach(function(img){
                  var src=img.src||img.dataset.src||img.currentSrc||'';
                  if(src&&src.indexOf('data:')!==0&&src.indexOf('s.gif')===-1){
                    if(result.mainImages.indexOf(src)===-1){
                      result.mainImages.push(src);
                    }
                  }
                });
                if(result.mainImages.length>0) break;
              }
            }
          }
          
          // SKU图提取 - 优先从源码提取
          var skuImageRegex=/"image"\\s*:\\s*"(https?:\\/\\/[^"]+)"/g;
          var skuImgMatch;
          while((skuImgMatch=skuImageRegex.exec(pageHtml))!==null){
            var skuImgUrl=skuImgMatch[1];
            var searchPos=skuImgMatch.index;
            var searchStart=Math.max(0,searchPos-300);
            var searchEnd=Math.min(pageHtml.length,searchPos+300);
            var searchRegion=pageHtml.substring(searchStart,searchEnd);
            var nameMatch=searchRegion.match(/"name"\\s*:\\s*"([^"]+)"/);
            var skuName='';
            if(nameMatch&&nameMatch[1]){
              skuName=nameMatch[1];
            }
            if(skuImgUrl&&skuImgUrl.indexOf('bao/uploaded')!==-1){
              result.skuImages.push({
                url:skuImgUrl,
                name:skuName||'SKU_'+(result.skuImages.length+1)
              });
            }
          }
          // 如果源码提取失败，尝试DOM提取
          if(result.skuImages.length===0){
            var skuSelectors=[
              '[class*="valueItem--"]',
              '[class*="skuItem"]',
              '[class*="sku"]'
            ];
            for(var si=0;si<skuSelectors.length;si++){
              var skuItems=document.querySelectorAll(skuSelectors[si]);
              skuItems.forEach(function(item){
                var img=item.querySelector('img');
                var textEl=item.querySelector('[class*="valueItemText"]')
                  ||item.querySelector('[class*="text"]')
                  ||item.querySelector('span[title]')
                  ||item.querySelector('span');
                if(img){
                  var src=img.src||img.dataset.src||'';
                  var isRealSkuImg=src.indexOf('bao/uploaded')!==-1
                    ||src.indexOf('bao/upload')!==-1;
                  if(src&&isRealSkuImg){
                    var name='';
                    if(textEl){
                      name=textEl.getAttribute('title')||textEl.textContent.trim()||'';
                    }
                    result.skuImages.push({
                      url:src,
                      name:name||'SKU_'+(result.skuImages.length+1)
                    });
                  }
                }
              });
            }
          }
          
          // 详情图提取 - 优先获取data-src（懒加载图片）
          var detailSelectors=[
            '[class*="descV8-singleImage"] img',
            '[class*="descV8-richtext"] img',
            '#J_DivItemDesc img',
            '#desc-lazyload-container img',
            '[class*="detail"] img',
            '[class*="DescDetail--"] img'
          ];
          for(var di=0;di<detailSelectors.length;di++){
            document.querySelectorAll(detailSelectors[di]).forEach(function(img){
              // 优先获取data-src（懒加载），其次src
              var src=img.dataset.src||img.src||'';
              // 过滤占位图和无效图片
              if(src&&src.indexOf('data:')!==0&&src.indexOf('s.gif')===-1&&src.indexOf('g.alicdn.com/s.gif')===-1){
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
