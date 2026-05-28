<template>
  <div class="tabs-container">
    <span class="app-title">🌐 西西电商图片下载助手</span>
    <div class="tabs-area">
      <div class="tabs-wrapper">
        <div
          v-for="tab in tabsStore.tabs"
          :key="tab.id"
          :class="['tab', { active: tab.id === tabsStore.activeTabId }]"
          @click="tabsStore.switchTab(tab.id)"
        >
          <span class="tab-favicon">
            <span v-if="tab.isLoading" class="loading-icon">⏳</span>
            <img
              v-else-if="tab.faviconType === 'image'"
              :src="tab.favicon"
              class="favicon-image"
              @error="handleFaviconError(tab)"
            />
            <span v-else>{{ tab.favicon || "🌐" }}</span>
          </span>
          <span class="tab-title">{{ tab.title }}</span>
          <el-icon class="tab-close" @click.stop="closeTab(tab.id)">
            <Close />
          </el-icon>
        </div>
        <el-button class="new-tab-btn" size="small" @click="createNewTab"
          ><el-icon> <Plus /> </el-icon
        ></el-button>
      </div>
    </div>
    <div class="window-controls">
      <el-button size="small" @click="minimizeWindow">
        <el-icon>
          <Minus />
        </el-icon>
      </el-button>
      <el-button size="small" @click="maximizeWindow">
        <el-icon>
          <FullScreen />
        </el-icon>
      </el-button>
      <el-button size="small" type="danger" @click="closeWindow">
        <el-icon>
          <Close />
        </el-icon>
      </el-button>
    </div>
  </div>
</template>

<script setup>
import { useTabsStore } from "../stores/tabs";

const tabsStore = useTabsStore();

function createNewTab() {
  tabsStore.createNewTab();
}

function closeTab(tabId) {
  tabsStore.closeTab(tabId);
  if (tabsStore.tabs.length === 0) {
    tabsStore.createNewTab();
  }
}

function handleFaviconError(tab) {
  tabsStore.updateTab(tab.id, {
    favicon: "🌐",
    faviconType: "emoji",
  });
}

function minimizeWindow() {
  window.electronAPI?.minimizeWindow();
}

function maximizeWindow() {
  window.electronAPI?.maximizeWindow();
}

function closeWindow() {
  window.electronAPI?.closeWindow();
}
</script>

<style scoped>
.tabs-container {
  display: flex;
  align-items: center;
  background: var(--theme-bg-secondary);
  border-bottom: 1px solid var(--theme-border);
  height: 40px;
  padding: 0 8px;
  -webkit-app-region: drag;
}

.app-title {
  color: var(--theme-accent);
  font-size: 14px;
  font-weight: 600;
  margin-right: 16px;
  white-space: nowrap;
}

.tabs-area {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.tabs-wrapper {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  align-items: center;
  overflow-y: hidden;
  flex: 1;
}

.tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px 6px 0 0;
  cursor: pointer;
  min-width: 120px;
  max-width: 200px;
  transition: all 0.2s;
  -webkit-app-region: no-drag;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.1);
}

.tab.active {
  background: var(--theme-button-bg);
  border-bottom: 2px solid var(--theme-accent);
}

.tab-favicon {
  font-size: 14px;
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

.loading-icon {
  display: inline-block;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.tab-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--theme-text-primary);
}

.tab-close {
  font-size: 12px;
  color: var(--theme-text-muted);
  transition: color 0.2s;
}

.tab-close:hover {
  color: var(--theme-accent);
}

.new-tab-btn {
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.window-controls {
  display: flex;
  gap: 4px;
  margin-left: 8px;
  -webkit-app-region: no-drag;
}
</style>
