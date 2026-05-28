<template>
  <div class="browser-container">
    <TabBar />
    <AddressBar />
    <div class="content-area">
      <div class="webview-container">
        <WebView
          v-for="tab in tabsStore.tabs"
          :key="tab.id"
          :tab="tab"
          :visible="tab.id === tabsStore.activeTabId"
        />
      </div>
      <NetworkPanel v-show="networkStore.panelVisible" />
    </div>
    <DownloadsPanel v-show="downloadsStore.panelVisible" />
    <StatusBar />
    <SettingsPanel />
    <BatchCollector @start-collect="handleStartCollect" />
    <SingleDownloadPanel />
    <AuthPanel />
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, watch } from "vue";
import { ElMessageBox } from "element-plus";
import { useTabsStore } from "./stores/tabs";
import { useNetworkStore } from "./stores/network";
import { useDownloadsStore } from "./stores/downloads";
import { useBatchStore } from "./stores/batch";
import { useSettingsStore } from "./stores/settings";
import TabBar from "./components/TabBar.vue";
import AddressBar from "./components/AddressBar.vue";
import WebView from "./components/WebView.vue";
import NetworkPanel from "./components/NetworkPanel.vue";
import DownloadsPanel from "./components/DownloadsPanel.vue";
import StatusBar from "./components/StatusBar.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import BatchCollector from "./components/BatchCollector.vue";
import SingleDownloadPanel from "./components/SingleDownloadPanel.vue";
import AuthPanel from "./components/AuthPanel.vue";

const tabsStore = useTabsStore();
const networkStore = useNetworkStore();
const downloadsStore = useDownloadsStore();
const batchStore = useBatchStore();
const settingsStore = useSettingsStore();

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

async function checkForUpdate() {
  try {
    if (!window.electronAPI?.checkUpdate) return;

    const result = await window.electronAPI.checkUpdate();
    if (result.success && result.hasUpdate) {
      const message = result.updateLog
        ? `当前版本: v${result.currentVersion}\n最新版本: v${result.latestVersion}\n\n更新内容:\n${result.updateLog}`
        : `发现新版本 v${result.latestVersion}，当前版本 v${result.currentVersion}`;

      ElMessageBox.confirm(message, "发现新版本", {
        confirmButtonText: "立即下载",
        cancelButtonText: "稍后提醒",
        type: "info",
      })
        .then(() => {
          if (result.downloadUrl) {
            window.open(result.downloadUrl, "_blank");
          }
        })
        .catch(() => {});
    }
  } catch (e) {
    console.error("Check update failed:", e);
  }
}

onMounted(() => {
  applyTheme(settingsStore.settings.theme);

  tabsStore.createNewTab();

  window.addEventListener("keydown", handleKeyDown);

  if (window.electronAPI && window.electronAPI.onNetworkLog) {
    window.electronAPI.onNetworkLog((data) => {
      networkStore.addRequest(data);
    });
  }

  if (window.electronAPI && window.electronAPI.onCreateNewTab) {
    window.electronAPI.onCreateNewTab((url) => {
      tabsStore.createNewTab(url);
    });
  }

  checkForUpdate();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

watch(
  () => settingsStore.settings.theme,
  (newTheme) => {
    applyTheme(newTheme);
  },
);

function handleKeyDown(e) {
  if (e.key === "F12") {
    e.preventDefault();
    if (e.shiftKey) {
      networkStore.toggleDevTools();
    } else {
      networkStore.togglePanel();
    }
  }
}

async function handleStartCollect() {
  const webviewManager = {
    navigateTo: async (url) => {
      const activeTab = tabsStore.activeTab;
      if (!activeTab || !activeTab.webContentsId) {
        throw new Error("没有活动的标签页");
      }

      return new Promise((resolve) => {
        const wcId = activeTab.webContentsId;
        let resolved = false;

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
            window.electronAPI.ipcRenderer.removeListener(
              "webview-did-finish-load",
              handleLoad,
            );
          }
        };

        const handleLoad = (event, id) => {
          if (id === wcId) {
            cleanup();
            setTimeout(resolve, 800);
          }
        };

        window.electronAPI.ipcRenderer.on(
          "webview-did-finish-load",
          handleLoad,
        );

        // 使用IPC刷新webview
        window.electronAPI
          .executeScript(wcId, `window.location.href = '${url}'`)
          .catch(() => {
            cleanup();
            resolve();
          });

        // 超时保护
        setTimeout(() => {
          cleanup();
          resolve();
        }, 15000);
      });
    },

    executeScript: async (url, script, callback) => {
      try {
        const activeTab = tabsStore.activeTab;
        if (!activeTab || !activeTab.webContentsId) {
          callback({ error: "没有活动的标签页" });
          return;
        }

        const wcId = activeTab.webContentsId;
        const result = await window.electronAPI.executeScript(wcId, script);
        const data = JSON.parse(result);
        callback(data);
      } catch (error) {
        callback({ error: error.message });
      }
    },
  };

  await batchStore.startCollection(webviewManager);
}
</script>

<style scoped>
.browser-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--theme-bg-primary);
  color: var(--theme-text-primary);
  border-left: 1px solid var(--theme-border);
  border-right: 1px solid var(--theme-border);
}

.content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

.webview-container {
  flex: 1;
  position: relative;
  background: #fff;
}
</style>
