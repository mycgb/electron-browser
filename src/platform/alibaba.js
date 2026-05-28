import { BaseParser } from './base-parser'

export class AlibabaParser extends BaseParser {
  static get id() { return 'alibaba' }
  static get name() { return '阿里巴巴国际站' }
  static get icon() { return '🌍' }
  static get pattern() { return /\/\/[^\/]*\.alibaba\.com(\/|$)/i }

  getExtractScript() {
    return `
      (function(){
        try{
          var result={
            title:'', price:'', shopName:'',
            mainImages:[], skuImages:[], detailImages:[],
            videoCover:'', mainVideo:'',
            needFetchDetail:false, detailUrl:''
          };
          
          // 从URL提取产品ID并构建详情图URL
          var currentUrl=window.location.href;
          var productIdMatch=currentUrl.match(/product-detail[^\\/]*\\/.*?_(\\d+)/);
          if(productIdMatch&&productIdMatch[1]){
            var productId=productIdMatch[1];
            result.detailUrl='https://www.alibaba.com/event/app/mainAction/desc.htm?detailId='+productId+'&language=zh';
            result.needFetchDetail=true;
            console.log('[Alibaba] Product ID:', productId);
            console.log('[Alibaba] Detail URL:', result.detailUrl);
          }
          
          // 标题提取
          var titleEl=document.querySelector('h1[class*="title"]')
            ||document.querySelector('.module-pdp-title h1')
            ||document.querySelector('[class*="Title"]')
            ||document.querySelector('h1');
          if(titleEl) result.title=titleEl.textContent.trim();
          
          // 价格提取
          var priceEl=document.querySelector('[class*="price"]')
            ||document.querySelector('.module-pdp-price')
            ||document.querySelector('[class*="Price"]');
          if(priceEl) result.price=priceEl.textContent.trim();
          
          // 店铺名称
          var shopEl=document.querySelector('[class*="company"] a')
            ||document.querySelector('[class*="shop"] a')
            ||document.querySelector('.module-pdp-company a');
          if(shopEl) result.shopName=shopEl.textContent.trim();
          
          // 主图提取 - 优先从源码提取
          var pageHtml=document.documentElement.outerHTML;
          console.log('[Alibaba] Page HTML length:', pageHtml.length);
          var imageMatch=pageHtml.match(/"image"\\s*:\\s*\\[([^\\]]+)\\]/);
          console.log('[Alibaba] Image match:', imageMatch);
          if(imageMatch&&imageMatch[1]){
            var imageStr=imageMatch[1];
            console.log('[Alibaba] Image string:', imageStr.substring(0, 200));
            var urlRegex=/"(https?:\\/\\/[^"]+)"/g;
            var urlMatch;
            while((urlMatch=urlRegex.exec(imageStr))!==null){
              var imgUrl=urlMatch[1];
              console.log('[Alibaba] Found URL:', imgUrl);
              if(imgUrl&&result.mainImages.indexOf(imgUrl)===-1){
                result.mainImages.push(imgUrl);
              }
            }
          }
          console.log('[Alibaba] Main images from source:', result.mainImages);
          // 如果没有找到，尝试从background-image提取
          if(result.mainImages.length===0){
            var bgDivs=document.querySelectorAll('[style*="background-image"]');
            console.log('[Alibaba] Found', bgDivs.length, 'elements with background-image');
            bgDivs.forEach(function(div){
              var style=div.getAttribute('style')||'';
              console.log('[Alibaba] Style:', style);
              // 解码HTML实体
              style=style.replace(/&quot;/g,'"');
              style=style.replace(/&amp;/g,'&');
              var match=style.match(/background-image\\s*:\\s*url\\s*\\(["']?([^"')]+)["']?\\)/i);
              console.log('[Alibaba] Match:', match);
              if(match&&match[1]){
                var src=match[1];
                console.log('[Alibaba] Original URL:', src);
                // 移除尺寸后缀，获取原图
                src=src.replace(/_[0-9]+x[0-9]+\\.jpg$/i,'.jpg');
                src=src.replace(/_[0-9]+x[0-9]+\\.png$/i,'.png');
                console.log('[Alibaba] Final URL:', src);
                // 补全协议
                if(src.indexOf('//')===0){
                  src='https:'+src;
                }
                if(src&&result.mainImages.indexOf(src)===-1){
                  result.mainImages.push(src);
                }
              }
            });
            console.log('[Alibaba] Main images:', result.mainImages);
          }
          // 如果没有找到，尝试从img标签提取
          if(result.mainImages.length===0){
            var mainSelectors=[
              '[class*="mainImage"] img',
              '[class*="gallery"] img',
              '[class*="thumb"] img',
              '.module-pdp-gallery img',
              '[class*="preview"] img'
            ];
            for(var mi=0;mi<mainSelectors.length;mi++){
              var ims=document.querySelectorAll(mainSelectors[mi]);
              if(ims.length>0){
                ims.forEach(function(img){
                  var src=img.src||img.dataset.src||'';
                  if(src&&src.indexOf('data:')!==0&&src.indexOf('placeholder')===-1){
                    if(result.mainImages.indexOf(src)===-1){
                      result.mainImages.push(src);
                    }
                  }
                });
                if(result.mainImages.length>0) break;
              }
            }
          }
          
          // SKU图提取 - 使用data-testid选择器
          var skuImgs=document.querySelectorAll('[data-testid="sku-list-item"] img');
          console.log('[Alibaba] Found', skuImgs.length, 'SKU images');
          skuImgs.forEach(function(img){
            var src=img.src||img.dataset.src||'';
            console.log('[Alibaba] SKU src:', src);
            if(src&&src.indexOf('data:')!==0){
              // 补全协议
              if(src.indexOf('//')===0){
                src='https:'+src;
              }
              // 从alt属性获取名称
              var name=img.getAttribute('alt')||'';
              console.log('[Alibaba] SKU name:', name);
              result.skuImages.push({
                url:src,
                name:name||'SKU_'+(result.skuImages.length+1)
              });
            }
          });
          console.log('[Alibaba] SKU images:', result.skuImages);
          // 如果没有找到，尝试其他选择器
          if(result.skuImages.length===0){
            var skuSelectors=[
              '[class*="sku"] img',
              '[class*="attribute"] img',
              '[class*="option"] img'
            ];
            for(var si=0;si<skuSelectors.length;si++){
              var skuItems=document.querySelectorAll(skuSelectors[si]);
              skuItems.forEach(function(img){
                var src=img.src||img.dataset.src||'';
                if(src&&src.indexOf('data:')!==0){
                  var parent=img.closest('[class*="item"]');
                  var name='';
                  if(parent){
                    var textEl=parent.querySelector('[class*="text"]')||parent.querySelector('span');
                    if(textEl) name=textEl.textContent.trim();
                  }
                  result.skuImages.push({
                    url:src,
                    name:name||'SKU_'+(result.skuImages.length+1)
                  });
                }
              });
            }
          }
          
          // 详情图不从此页面提取，全部通过detailUrl接口获取
          // 详情图数据已在AddressBar.vue/batch.js中通过detailUrl请求获取
          
          // 视频提取
          var videoEl=document.querySelector('video');
          if(videoEl){
            result.mainVideo=videoEl.src||videoEl.currentSrc||'';
          }
          
          return JSON.stringify(result);
        }catch(e){return JSON.stringify({error:e.message});}
      })()
    `
  }
}
