<template>
  <div class="network-panel" :style="{ height: panelHeight + 'px' }">
    <div class="resize-handle" @mousedown="startResize"></div>
    <div class="network-panel-header">
      <span>网络监控</span>
      <div class="network-panel-controls">
        <el-button
          size="small"
          :type="showFilter ? 'primary' : 'default'"
          @click="toggleFilter"
          title="筛选 URL"
          :icon="Search"
        >
          搜索
        </el-button>
        <el-button
          size="small"
          @click="openDownloadsPanel"
          title="下载资源"
          :icon="Download"
          >下载
        </el-button>
        <el-button size="small" @click="clearRequests" :icon="Delete"
          >清空</el-button
        >
        <el-button size="small" @click="togglePanel" :icon="Close"></el-button>
      </div>
    </div>

    <div v-if="showFilter" class="network-filter">
      <el-input
        v-model="filterText"
        placeholder="筛选 URL..."
        size="small"
        clearable
        @input="handleFilterChange"
        @clear="handleFilterChange"
      />
    </div>

    <div class="network-type-tabs">
      <el-button
        v-for="tab in typeTabs"
        :key="tab.value"
        :type="activeType === tab.value ? 'primary' : 'default'"
        size="small"
        @click="handleTypeChange(tab.value)"
      >
        {{ tab.label }}
      </el-button>
    </div>

    <div class="network-body">
      <div class="network-list">
        <div class="network-table-header">
          <span class="col-method">方法</span>
          <span class="col-status">状态</span>
          <span class="col-type">类型</span>
          <span class="col-url">URL</span>
          <span class="col-time">时间</span>
        </div>
        <div class="network-table-body">
          <div
            v-for="req in filteredRequests"
            :key="req.id"
            class="network-row"
            :class="{ selected: selectedRequest?.id === req.id }"
            @click="showDetail(req)"
          >
            <span class="col-method">{{ req.method }}</span>
            <span class="col-status">{{ getStatusText(req.status) }}</span>
            <span class="col-type">{{ getTypeLabel(req.type) }}</span>
            <span class="col-url">{{ req.url }}</span>
            <span class="col-time">{{ getTimeText(req.totalTime) }}</span>
          </div>
        </div>
      </div>

      <div v-if="selectedRequest" class="network-detail">
        <div class="network-detail-header">
          <span>请求详情</span>
          <div class="detail-header-actions">
            <el-button
              v-if="isDownloadable(selectedRequest)"
              size="small"
              type="primary"
              @click="downloadResource"
            >
              下载资源
            </el-button>
            <el-button size="small" @click="hideDetail" :icon="Close" />
          </div>
        </div>
        <div class="detail-tabs">
          <el-button
            v-for="tab in detailTabs"
            :key="tab"
            :type="activeDetailTab === tab ? 'primary' : 'default'"
            size="small"
            @click="activeDetailTab = tab"
          >
            {{ tab }}
          </el-button>
        </div>
        <div class="detail-content">
          <div v-if="activeDetailTab === 'Headers'" class="detail-pane">
            <div class="detail-info">
              <div class="info-row">
                <span class="info-label">URL:</span>
                <span class="info-value">{{ selectedRequest.url }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">方法:</span>
                <span class="info-value">{{ selectedRequest.method }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">状态:</span>
                <span class="info-value">{{ selectedRequest.status }}</span>
              </div>
              <div class="info-row">
                <span class="info-label">类型:</span>
                <span class="info-value">{{ selectedRequest.type }}</span>
              </div>
            </div>
          </div>
          <div v-if="activeDetailTab === 'Params'" class="detail-pane">
            <pre>{{ getParams(selectedRequest) }}</pre>
          </div>
          <div v-if="activeDetailTab === 'Response'" class="detail-pane">
            <pre>{{ getResponse(selectedRequest) }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from "vue";
import { useNetworkStore } from "../stores/network";
import { useDownloadsStore } from "../stores/downloads";
import { Close, Delete, Download,Search } from "@element-plus/icons-vue";

const networkStore = useNetworkStore();
const downloadsStore = useDownloadsStore();

const filterText = ref("");
const activeType = ref("all");
const selectedRequest = ref(null);
const activeDetailTab = ref("Headers");
const showFilter = ref(false);
const panelHeight = ref(300);

function toggleFilter() {
  showFilter.value = !showFilter.value;
  if (!showFilter.value) {
    filterText.value = "";
    networkStore.setFilterText("");
  }
}

// 拖拽调整面板高度
let isResizing = false;
let startY = 0;
let startHeight = 0;

function startResize(e) {
  isResizing = true;
  startY = e.clientY;
  startHeight = panelHeight.value;
  document.addEventListener("mousemove", onResize);
  document.addEventListener("mouseup", stopResize);
  document.body.style.cursor = "ns-resize";
  document.body.style.userSelect = "none";
}

function onResize(e) {
  if (!isResizing) return;
  const delta = startY - e.clientY;
  const newHeight = Math.min(
    Math.max(startHeight + delta, 150),
    window.innerHeight * 0.8,
  );
  panelHeight.value = newHeight;
}

function stopResize() {
  isResizing = false;
  document.removeEventListener("mousemove", onResize);
  document.removeEventListener("mouseup", stopResize);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
}

const typeTabs = [
  { label: "全部", value: "all" },
  { label: "Fetch/XHR", value: "fetch/xhr" },
  { label: "Doc", value: "document" },
  { label: "CSS", value: "stylesheet" },
  { label: "JS", value: "script" },
  { label: "Img", value: "image" },
  { label: "Font", value: "font" },
  { label: "Media", value: "media" },
  { label: "WS", value: "websocket" },
  { label: "Other", value: "other" },
];

const detailTabs = ["Headers", "Params", "Response"];

const filteredRequests = computed(() => {
  let result = Object.values(networkStore.requests);

  if (activeType.value !== "all") {
    const typeMap = {
      "fetch/xhr": ["xhr", "fetch"],
      document: ["document", "html"],
      stylesheet: ["stylesheet", "css"],
      script: ["script", "javascript"],
      image: ["image"],
      font: ["font"],
      media: ["media", "video", "audio"],
      websocket: ["websocket"],
      other: ["other"],
    };
    const types = typeMap[activeType.value] || [];
    result = result.filter((req) => {
      const type = (req.type || "").toLowerCase();
      return types.some((t) => type.includes(t));
    });
  }

  if (filterText.value) {
    const search = filterText.value.toLowerCase();
    result = result.filter((req) => req.url.toLowerCase().includes(search));
  }

  return result;
});

function handleFilterChange() {
  networkStore.setFilterText(filterText.value);
}

function handleTypeChange(type) {
  activeType.value = type;
  networkStore.setFilterType(type);
}

function clearRequests() {
  networkStore.clearRequests();
}

function togglePanel() {
  networkStore.togglePanel();
}

function openDownloadsPanel() {
  downloadsStore.showPanel();
}

function showDetail(req) {
  selectedRequest.value = req;
  if (!req.responseBody) {
    fetchResponseBody(req);
  }
}

function hideDetail() {
  selectedRequest.value = null;
}

function getTypeLabel(type) {
  const typeMap = {
    document: "Doc",
    stylesheet: "CSS",
    script: "JS",
    image: "Img",
    font: "Font",
    xhr: "XHR",
    fetch: "Fetch",
    media: "Media",
    websocket: "WS",
    other: "Other",
  };
  return typeMap[type?.toLowerCase()] || type || "Other";
}

function getStatusText(status) {
  if (status === "pending") return "...";
  if (status === "Error") return "ERR";
  return status || "...";
}

function getTimeText(totalTime) {
  if (!totalTime) return "...";
  return `${totalTime}ms`;
}

function formatTime(timestamp) {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  return date.toLocaleTimeString();
}

function isDownloadable(req) {
  const type = (req.type || "").toLowerCase();
  return (
    type.includes("image") ||
    type.includes("media") ||
    type.includes("video") ||
    type.includes("audio")
  );
}

function getParams(req) {
  try {
    const url = new URL(req.url);
    return JSON.stringify(Object.fromEntries(url.searchParams), null, 2);
  } catch {
    return "无参数";
  }
}

function getResponse(req) {
  if (!req) return "无响应数据";
  if (req.responseBody) {
    return req.responseBody;
  }
  if (req.loadingBody) {
    return "加载中...";
  }
  return "无响应数据";
}

async function fetchResponseBody(req) {
  if (!req || !window.electronAPI || !window.electronAPI.getResponseBody)
    return;

  networkStore.updateRequest(req.id, { loadingBody: true });

  try {
    const result = await window.electronAPI.getResponseBody(req.id, req.url);

    if (!result) {
      networkStore.setResponseBody(req.id, "无法获取响应体");
      return;
    }

    let body = result.body;
    if (result.base64Encoded) {
      try {
        body = atob(body);
      } catch (e) {
        networkStore.setResponseBody(req.id, "[二进制数据]");
        return;
      }
    }

    const contentTypeRaw =
      (req.responseHeaders &&
        (req.responseHeaders["content-type"] ||
          req.responseHeaders["Content-Type"])) ||
      "";
    const contentType = Array.isArray(contentTypeRaw)
      ? contentTypeRaw[0] || ""
      : String(contentTypeRaw);
    const isJson =
      contentType.includes("json") || contentType.includes("javascript");

    if (isJson) {
      try {
        const parsed = JSON.parse(body);
        networkStore.setResponseBody(req.id, JSON.stringify(parsed, null, 2));
      } catch {
        networkStore.setResponseBody(req.id, body);
      }
    } else {
      networkStore.setResponseBody(req.id, body);
    }
  } catch (error) {
    console.error("Failed to fetch response body:", error);
    networkStore.setResponseBody(req.id, `获取失败: ${error.message}`);
  }
}

async function downloadResource() {
  if (!selectedRequest.value) return;

  const result = await window.electronAPI.showSaveDialog({
    title: "保存资源",
    defaultPath: getFilenameFromUrl(selectedRequest.value.url),
  });

  if (!result.canceled && result.filePath) {
    await window.electronAPI.downloadResource(
      selectedRequest.value.url,
      result.filePath,
    );
  }
}

function getFilenameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    let filename = urlObj.pathname.split("/").pop();
    if (!filename) filename = "download";
    return filename;
  } catch {
    return "download";
  }
}
</script>

<style scoped>
.network-panel {
  display: flex;
  flex-direction: column;
  background: #1e1e2e;
  border-top: 1px solid #333;
  flex: none;
  min-height: 150px;
}

.resize-handle {
  height: 4px;
  background: #333;
  cursor: ns-resize;
  transition: background 0.15s;
  flex-shrink: 0;
}

.resize-handle:hover {
  background: #e94560;
}

.network-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #16213e;
  border-bottom: 1px solid #333;
  font-size: 13px;
  font-weight: 500;
  color: #fff;
}

.network-panel-controls {
  display: flex;
  gap: 8px;
}

.network-filter {
  display: flex;
  gap: 8px;
  padding: 6px 12px;
  background: #1a1a2e;
  border-bottom: 1px solid #333;
  align-items: center;
}

.network-type-tabs {
  display: flex;
  gap: 4px;
  padding: 4px 12px;
  background: #1a1a2e;
  border-bottom: 1px solid #333;
  overflow-x: auto;
}

.network-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.network-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.network-table-header {
  display: flex;
  padding: 6px 12px;
  background: #16213e;
  border-bottom: 1px solid #333;
  font-size: 11px;
  color: #888;
  font-weight: 500;
}

.network-table-body {
  flex: 1;
  overflow-y: auto;
}

.network-row {
  display: flex;
  padding: 6px 12px;
  border-bottom: 1px solid #222;
  cursor: pointer;
  font-size: 12px;
  color: #ddd;
}

.network-row:hover {
  background: rgba(233, 69, 96, 0.1);
}

.network-row.selected {
  background: rgba(233, 69, 96, 0.2);
}

.col-method {
  width: 60px;
  flex-shrink: 0;
}

.col-status {
  width: 50px;
  flex-shrink: 0;
}

.col-type {
  width: 60px;
  flex-shrink: 0;
}

.col-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.col-time {
  width: 80px;
  flex-shrink: 0;
  text-align: right;
}

.network-detail {
  width: 400px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #333;
  background: #1a1a2e;
}

.network-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #16213e;
  border-bottom: 1px solid #333;
  font-size: 13px;
  color: #fff;
}

.detail-header-actions {
  display: flex;
  gap: 8px;
}

.detail-tabs {
  display: flex;
  gap: 4px;
  padding: 4px 12px;
  background: #1a1a2e;
  border-bottom: 1px solid #333;
}

.detail-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.detail-pane {
  font-size: 12px;
  color: #ddd;
}

.detail-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  gap: 8px;
}

.info-label {
  color: #888;
  min-width: 60px;
}

.info-value {
  color: #ddd;
  word-break: break-all;
}

pre {
  margin: 0;
  padding: 8px;
  background: #0f0f1a;
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
}
</style>
