<template>
  <div class="address-bar">
    <div class="navigation-buttons">
      <el-button size="small" circle @click="goBack">
        <el-icon><ArrowLeft /></el-icon>
      </el-button>
      <el-button size="small" circle @click="goForward">
        <el-icon><ArrowRight /></el-icon>
      </el-button>
      <el-button size="small" circle @click="refresh">
        <el-icon><Refresh /></el-icon>
      </el-button>
    </div>

    <el-input
      v-model="urlInput"
      placeholder="输入网址..."
      @keyup.enter="navigate"
      class="url-input"
      spellcheck="false"
    >
      <template #prefix>
        <div class="favicon-container">
          <img
            v-if="currentFaviconType === 'image'"
            :src="currentFavicon"
            class="favicon-image"
            @error="handleFaviconError"
          />
          <el-icon v-else><Link /></el-icon>
        </div>
      </template>
    </el-input>

    <div class="menu-buttons">
      <el-button size="small" circle @click="handleSingleDownload" title="下载">
        <el-icon><Download /></el-icon>
      </el-button>
      <el-button size="small" circle @click="handleLogin" title="用户登录">
        <el-icon><User /></el-icon>
      </el-button>
      <el-dropdown
        trigger="click"
        @command="handleMenuCommand"
        title="更多操作"
      >
        <el-button size="small" circle>
          <el-icon><Menu /></el-icon>
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item command="network">
              <el-icon><Connection /></el-icon>
              网络监控
            </el-dropdown-item>
            <el-dropdown-item command="download">
              <el-icon><Download /></el-icon>
              批量下载
            </el-dropdown-item>
            <el-dropdown-item command="settings">
              <el-icon><Setting /></el-icon>
              系统设置
            </el-dropdown-item>
            <el-dropdown-item command="devtools">
              <el-icon><Tools /></el-icon>
              开发者工具
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, computed } from "vue";
import { ElMessageBox } from "element-plus";
import { useTabsStore } from "../stores/tabs";
import { useNetworkStore } from "../stores/network";
import { useDownloadsStore } from "../stores/downloads";
import { useSettingsStore } from "../stores/settings";
import { useBatchStore } from "../stores/batch";
import { useSingleDownloadStore } from "../stores/singleDownload";
import { useAuthStore } from "../stores/auth";
import { sanitizeTitle } from "../utils/sanitize";
import { TaobaoParser } from "../platform/taobao";
import { TmallParser } from "../platform/tmall";
import { JdParser } from "../platform/jd";
import { Alibaba1688Parser } from "../platform/alibaba1688";
import { AlibabaParser } from "../platform/alibaba";

const tabsStore = useTabsStore();
const networkStore = useNetworkStore();
const downloadsStore = useDownloadsStore();
const settingsStore = useSettingsStore();
const batchStore = useBatchStore();
const singleDownloadStore = useSingleDownloadStore();
const authStore = useAuthStore();

const urlInput = ref("");

const currentFavicon = computed(() => {
  return tabsStore.activeTab?.favicon || "";
});

const currentFaviconType = computed(() => {
  return tabsStore.activeTab?.faviconType || "emoji";
});

watch(
  () => tabsStore.activeTab,
  (newTab) => {
    if (newTab) {
      urlInput.value = newTab.url;
    }
  },
  { immediate: true },
);

function navigate() {
  let url = urlInput.value.trim();
  if (!url) return;

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    if (url.includes(".") && !url.includes(" ")) {
      url = "https://" + url;
    } else {
      url = "https://www.google.com/search?q=" + encodeURIComponent(url);
    }
  }

  if (tabsStore.activeTab) {
    tabsStore.updateTab(tabsStore.activeTabId, { url });
  }
}

function goBack() {
  const wcId = tabsStore.activeTab?.webContentsId;
  if (wcId != null) {
    window.electronAPI?.goBack(wcId);
  }
}

function goForward() {
  const wcId = tabsStore.activeTab?.webContentsId;
  if (wcId != null) {
    window.electronAPI?.goForward(wcId);
  }
}

function refresh() {
  const wcId = tabsStore.activeTab?.webContentsId;
  if (wcId != null) {
    window.electronAPI?.refresh(wcId);
  }
}

function handleMenuCommand(command) {
  switch (command) {
    case "network":
      networkStore.togglePanel();
      break;
    case "download":
      batchStore.togglePanel();
      break;
    case "devtools":
      networkStore.toggleDevTools();
      break;
    case "settings":
      settingsStore.openPanel();
      break;
  }
}

function handleFaviconError() {
  if (tabsStore.activeTab) {
    tabsStore.updateTab(tabsStore.activeTabId, {
      favicon: "",
      faviconType: "emoji",
    });
  }
}

async function handleLogin() {
  if (authStore.isLoggedIn) {
    try {
      await ElMessageBox.confirm("确定要退出登录吗？", "提示", {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      });
      authStore.logout();
    } catch {
      // 用户取消
    }
  } else {
    authStore.showPanel();
  }
}

async function handleSingleDownload() {
  const activeTab = tabsStore.activeTab;
  if (!activeTab || !activeTab.webContentsId) {
    return;
  }

  const url = activeTab.url;
  if (!url || url.startsWith("about:")) {
    return;
  }

  if (!authStore.isLoggedIn) {
    authStore.showPanel();
    return;
  }

  const pointsCheck = await authStore.checkPoints();
  if (!pointsCheck.ok) {
    alert(pointsCheck.error);
    return;
  }

  singleDownloadStore.resetState();
  singleDownloadStore.showPanel();
  singleDownloadStore.setLoading("正在解析页面...");

  try {
    const wcId = activeTab.webContentsId;
    const platform = detectPlatform(url);

    // 如果是京东页面，先滚动页面触发懒加载；1688通过detailUrl获取详情图，只需等待页面加载
    if (platform?.id === "jd") {
      const scrollMax = 10000;
      const scrollWait = 1000;
      await window.electronAPI.executeScript(
        wcId,
        `
        (function(){
          return new Promise((resolve) => {
            var detailEl = document.querySelector('#detail');
            if (detailEl) {
              detailEl.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
            const maxScroll = Math.min(document.body.scrollHeight, ${scrollMax});
            const scrollStep = 1000;
            let scrolled = 0;
            const scrollInterval = setInterval(() => {
              window.scrollBy(0, scrollStep);
              scrolled += scrollStep;
              if (scrolled >= maxScroll) {
                clearInterval(scrollInterval);
                setTimeout(resolve, ${scrollWait});
              }
            }, 500);
          });
        })()
      `,
      );
      await window.electronAPI.executeScript(wcId, `window.scrollTo(0, 0);`);
    } else if (platform?.id === "1688") {
      // 1688只需等待页面数据加载完成
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } else if (platform?.id === "alibaba") {
      // 阿里巴巴国际站需要等待页面数据加载完成
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    const extractScript = getExtractScript(platform?.id);
    const rawResult = await window.electronAPI.executeScript(
      wcId,
      extractScript,
    );
    const parsed =
      typeof rawResult === "string" ? JSON.parse(rawResult) : rawResult;
    singleDownloadStore.setProductInfo({
      title: sanitizeTitle(parsed.title || activeTab.title || "未知商品"),
      price: parsed.price || "",
      shopName: parsed.shopName || "",
      platformIcon: platform?.icon || "🌐",
      platformName: platform?.name || "通用",
      url: url,
    });

    const resources = [];
    const addRes = (type, label, urls) => {
      (urls || []).forEach((u, i) => {
        resources.push({
          type,
          label: `${label}_${i + 1}`,
          url: resolveImageUrl(u, url),
          ext: getFileExt(u),
        });
      });
    };

    addRes("mainImg", "主图", parsed.mainImages);

    // SKU图特殊处理 - 使用名称
    if (parsed.skuImages && parsed.skuImages.length > 0) {
      parsed.skuImages.forEach((sku, i) => {
        const skuData =
          typeof sku === "object" ? sku : { url: sku, name: `SKU_${i + 1}` };
        resources.push({
          type: "skuImg",
          label: skuData.name || `SKU_${i + 1}`,
          url: resolveImageUrl(skuData.url, url),
          ext: getFileExt(skuData.url),
        });
      });
    }

    addRes("detailImg", "详情图", parsed.detailImages);

    // 如果1688有detailUrl，需要额外请求获取详情图
    if (parsed.needFetchDetail && parsed.detailUrl) {
      console.log("[1688] Fetching detailUrl:", parsed.detailUrl);
      try {
        const detailContent = await window.electronAPI.fetchUrl(
          parsed.detailUrl,
        );

        if (detailContent) {
          const detailImgs = [];

          // 格式: var offer_details={"content":"<div>...</div>"}
          let htmlContent = "";
          const jsonMatch = detailContent.match(
            /var\s+offer_details\s*=\s*(\{[\s\S]*\});?\s*$/,
          );
          if (jsonMatch) {
            try {
              const jsonData = JSON.parse(jsonMatch[1]);
              htmlContent = jsonData.content || "";
            } catch (e) {
              console.error("[1688] JSON parse error:", e);
            }
          }

          // 如果没有匹配到JSON格式，直接当作HTML处理
          if (!htmlContent) {
            htmlContent = detailContent;
          }

          // 从HTML中提取图片URL
          const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
          let match;
          while ((match = imgRegex.exec(htmlContent)) !== null) {
            let src = match[1];
            if (src && src.indexOf("alicdn.com") !== -1) {
              if (src.indexOf("?") !== -1) {
                src = src.split("?")[0];
              }
              if (detailImgs.indexOf(src) === -1) {
                detailImgs.push(src);
              }
            }
          }

          console.log(
            "[1688] Found",
            detailImgs.length,
            "images from detailUrl",
          );
          addRes("detailImg", "详情图", detailImgs);
        }
      } catch (e) {
        console.error("[1688] Failed to fetch detailUrl:", e);
      }
    }

    // 如果阿里巴巴国际站有detailUrl，需要额外请求获取详情图
    if (
      platform?.id === "alibaba" &&
      parsed.needFetchDetail &&
      parsed.detailUrl
    ) {
      console.log("[Alibaba] Fetching detailUrl:", parsed.detailUrl);
      try {
        const detailContent = await window.electronAPI.fetchUrl(
          parsed.detailUrl,
        );

        if (detailContent) {
          // 解析JSON响应
          let htmlContent = "";
          try {
            const jsonData = JSON.parse(detailContent);
            htmlContent = jsonData.data?.productHtmlDescription || "";
            console.log("[Alibaba] HTML content length:", htmlContent.length);
          } catch (e) {
            console.log("[Alibaba] Not JSON format, using as HTML");
            htmlContent = detailContent;
          }

          if (htmlContent) {
            const detailImgs = [];

            // detailSellerRecommend是React组件无inline图片，detailManyImage在后面不能截断
            // 直接从全量HTML提取所有data-src图片
            const dataSrcRegex = /data-src=["']([^"']+)["']/gi;
            let match;
            while ((match = dataSrcRegex.exec(htmlContent)) !== null) {
              let src = match[1];
              if (src.indexOf("alicdn.com") !== -1) {
                if (src.indexOf("//") === 0) src = "https:" + src;
                if (src.indexOf("?") !== -1) src = src.split("?")[0];
                if (detailImgs.indexOf(src) === -1) detailImgs.push(src);
              }
            }

            // 第二步：提取所有src（排除placeholder）
            const srcRegex = /<img[^>]+src=["']([^"']+)["']/gi;
            while ((match = srcRegex.exec(htmlContent)) !== null) {
              let src = match[1];
              if (
                !src ||
                src.indexOf("placeholder") !== -1 ||
                src.indexOf("data:") === 0
              )
                continue;
              if (src.indexOf("alicdn.com") !== -1) {
                if (src.indexOf("//") === 0) src = "https:" + src;
                if (src.indexOf("?") !== -1) src = src.split("?")[0];
                if (detailImgs.indexOf(src) === -1) detailImgs.push(src);
              }
            }

            console.log(
              "[Alibaba] Found",
              detailImgs.length,
              "images from detailUrl",
            );
            addRes("detailImg", "详情图", detailImgs);
          }
        }
      } catch (e) {
        console.error("[Alibaba] Failed to fetch detailUrl:", e);
      }
    }
    if (parsed.videoCover) {
      resources.push({
        type: "videoCover",
        label: "视频封面",
        url: resolveImageUrl(parsed.videoCover, url),
        ext: getFileExt(parsed.videoCover),
      });
    }
    if (parsed.mainVideo) {
      resources.push({
        type: "mainVideo",
        label: "主图视频",
        url: parsed.mainVideo,
        ext: getFileExt(parsed.mainVideo),
      });
    }

    singleDownloadStore.setResources(resources);
    singleDownloadStore.loading = false;
  } catch (error) {
    console.error("解析页面失败:", error);
    singleDownloadStore.hidePanel();
  }
}

function getExtractScript(platformId) {
  if (platformId === "taobao") {
    return new TaobaoParser().getExtractScript();
  }
  if (platformId === "tmall") {
    return new TmallParser().getExtractScript();
  }
  if (platformId === "jd") {
    return new JdParser().getExtractScript();
  }
  if (platformId === "1688") {
    return new Alibaba1688Parser().getExtractScript();
  }
  if (platformId === "alibaba") {
    return new AlibabaParser().getExtractScript();
  }
  return `
    (function(){
      try{
        var result={
          title:'',price:'',shopName:'',
          mainImages:[],skuImages:[],detailImages:[],
          videoCover:'',mainVideo:''
        };

        // 标题提取 - 优先淘宝新版结构
        var titleEl=document.querySelector('[class*="mainTitle"]')
          ||document.querySelector('[class*="ItemTitle"] span')
          ||document.querySelector('h1')
          ||document.querySelector('[class*="title"]');
        if(titleEl) result.title=titleEl.textContent.trim();

        // 价格提取
        var priceEl=document.querySelector('[class*="price"] [class*="current"]')
          ||document.querySelector('[class*="Price--"]')
          ||document.querySelector('[class*="price"]');
        if(priceEl) result.price=priceEl.textContent.trim();

        // 店铺名称
        var shopEl=document.querySelector('[class*="shopName"]')
          ||document.querySelector('[class*="ShopHeader--"] a')
          ||document.querySelector('[class*="shop"] a');
        if(shopEl) result.shopName=shopEl.textContent.trim();

        // 主图提取 - 淘宝主图容器
        var mainSelectors=[
          '[class*="thumbnailPic--"]',
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
              // 只保留真实的SKU图片：bao/uploaded路径
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
  `;
}

function detectPlatform(url) {
  const platforms = [
    {
      id: "taobao",
      name: "淘宝",
      icon: "🏪",
      pattern: /\/\/[^\/]*\.taobao\.com(\/|$)/i,
    },
    {
      id: "tmall",
      name: "天猫",
      icon: "🐱",
      pattern: /\/\/[^\/]*\.tmall\.com(\/|$)/i,
    },
    {
      id: "jd",
      name: "京东",
      icon: "📦",
      pattern: /\/\/[^\/]*\.jd\.com(\/|$)/i,
    },
    {
      id: "1688",
      name: "1688",
      icon: "🏢",
      pattern: /\/\/[^\/]*\.1688\.com(\/|$)/i,
    },
    {
      id: "alibaba",
      name: "阿里巴巴",
      icon: "🌐",
      pattern: /\/\/[^\/]*\.alibaba\.com(\/|$)/i,
    },
  ];

  for (const platform of platforms) {
    if (platform.pattern.test(url)) {
      return platform;
    }
  }
  return null;
}

function resolveImageUrl(src, pageUrl) {
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  if (src.startsWith("//")) return "https:" + src;
  try {
    return new URL(src, pageUrl).href;
  } catch {
    return src;
  }
}

function getFileExt(url) {
  if (!url) return ".jpg";
  const cleanUrl = url.split("?")[0].split("#")[0];
  const match = cleanUrl.match(/\.(\w{2,4})(?:_webp|_\d+x\d+)?$/i);
  if (match) {
    const ext = match[1].toLowerCase();
    if (ext === "jpeg") return ".jpg";
    if (ext === "webp") return ".png";
    return "." + ext;
  }
  if (/mp4|avi|mov|wmv|webm/i.test(cleanUrl)) return ".mp4";
  return ".jpg";
}
</script>

<style scoped>
.address-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--theme-bg-secondary);
  border-bottom: 1px solid var(--theme-border);
}

.navigation-buttons {
  display: flex;
  gap: 4px;
}

.url-input {
  flex: 1;
}

.menu-buttons {
  display: flex;
  gap: 4px;
  align-items: center;
  justify-content: center;
}
:deep(.el-button + .el-button) {
  margin-left: 0px;
}
.favicon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.favicon-image {
  width: 16px;
  height: 16px;
  border-radius: 2px;
  object-fit: contain;
}
</style>
