<template>
  <el-drawer
    v-model="visible"
    title="当前页下载"
    direction="rtl"
    size="500px"
    :close-on-click-modal="!store.downloading"
    @close="handleClose"
  >
    <div class="single-download-panel">
      <div v-if="store.loading" class="loading-area">
        <el-progress
          type="dashboard"
          :percentage="50"
          :width="120"
          indeterminate
        >
          <template #default>
            <el-icon class="is-loading" :size="28"><Loading /></el-icon>
          </template>
        </el-progress>
        <p class="loading-text">{{ store.loadingText }}</p>
      </div>

      <template v-else>
        <div class="product-info">
          <div class="info-title">
            {{ store.productInfo.title || "未知商品" }}
          </div>
          <div class="info-meta">
            <span class="info-platform">
              {{ store.productInfo.platformIcon }}
              {{ store.productInfo.platformName }}
            </span>
            <span v-if="store.productInfo.price" class="info-price">
              {{ store.productInfo.price }}
            </span>
          </div>
          <div v-if="store.productInfo.shopName" class="info-shop">
            {{ store.productInfo.shopName }}
          </div>
        </div>

        <div class="toolbar">
          <span class="resource-count">
            共 <strong>{{ store.resources.length }}</strong> 个资源
          </span>
          <div class="toolbar-actions">
            <el-button size="small" type="primary" @click="store.selectAll"
              >全选</el-button
            >
            <el-button
              size="small"
              type="danger"
              plain
              @click="store.deselectAll"
              >取消</el-button
            >
          </div>
        </div>

        <div class="resource-list">
          <div
            v-for="resource in store.resources"
            :key="resource.id"
            class="resource-row"
            :class="{ selected: resource.selected }"
            @click="store.toggleResource(resource.id)"
          >
            <el-checkbox v-model="resource.selected" @click.stop />
            <span class="resource-type" :class="resource.type">{{
              getTypeLabel(resource.type)
            }}</span>
            <span class="resource-label">{{ resource.label }}</span>
            <span class="resource-ext">{{ resource.ext }}</span>
          </div>
        </div>

        <div class="stats-bar">
          <div class="stat-item">
            <span class="stat-label">主图</span>
            <span class="stat-value">{{ store.resourceStats.mainImg }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">SKU图</span>
            <span class="stat-value">{{ store.resourceStats.skuImg }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">详情图</span>
            <span class="stat-value">{{ store.resourceStats.detailImg }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">视频</span>
            <span class="stat-value">{{
              store.resourceStats.mainVideo + store.resourceStats.videoCover
            }}</span>
          </div>
        </div>

        <div class="actions">
          <el-button
            type="primary"
            size="large"
            :loading="store.downloading"
            :disabled="store.selectedResources.length === 0"
            @click="handleDownload"
          >
            <el-icon><Download /></el-icon>
            下载选中 ({{ store.selectedResources.length }})
          </el-button>
        </div>
      </template>
    </div>
  </el-drawer>
</template>

<script setup>
import { computed } from "vue";
import { useSingleDownloadStore } from "../stores/singleDownload";
import { useSettingsStore } from "../stores/settings";
import { useAuthStore } from "../stores/auth";
import { ElMessage } from "element-plus";

const emit = defineEmits(["extract"]);

const store = useSingleDownloadStore();
const settingsStore = useSettingsStore();
const authStore = useAuthStore();

const visible = computed({
  get: () => store.panelVisible,
  set: (value) => {
    if (value) {
      store.showPanel();
    } else {
      store.hidePanel();
    }
  },
});

function handleClose() {
  if (store.downloading) {
    ElMessage.warning("下载任务进行中，请等待下载完成后再关闭窗口");
    return;
  }
  store.hidePanel();
}

async function handleDownload() {
  const saveDir = settingsStore.getSavePath();

  if (!saveDir) {
    ElMessage.warning("请先在系统设置中配置文件保存路径");
    return;
  }

  const result = await store.startDownload(saveDir);
  if (result) {
    if (result.successCount > 0) {
      const deductResult = await authStore.deductPoint(
        store.productInfo.url,
        store.productInfo.platformName,
      );
      const pointsMsg = deductResult.ok
        ? ` | 扣除1点，剩余${deductResult.balance}点`
        : ` | 扣点失败: ${deductResult.error}`;
      ElMessage.success(
        `下载完成: 成功${result.successCount}个, 失败${result.failCount}个${pointsMsg}`,
      );
      store.hidePanel();
    } else {
      ElMessage.warning("下载失败");
    }
  }
}

function getTypeLabel(type) {
  const labels = {
    mainImg: "主图",
    skuImg: "SKU",
    detailImg: "详情",
    videoCover: "封面",
    mainVideo: "视频",
  };
  return labels[type] || type;
}
</script>

<style scoped>
.single-download-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.loading-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
}

.loading-text {
  font-size: 14px;
  color: #606266;
}

.product-info {
  padding: 16px;
  background: linear-gradient(135deg, #f5f7fa 0%, #f0f2f5 100%);
  border-radius: 10px;
  margin-bottom: 16px;
}

.info-title {
  font-size: 15px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 8px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.info-meta {
  display: flex;
  gap: 12px;
  margin-bottom: 4px;
}

.info-platform {
  font-size: 13px;
  color: #909399;
}

.info-price {
  font-size: 14px;
  font-weight: 600;
  color: #f56c6c;
}

.info-shop {
  font-size: 12px;
  color: #909399;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 12px;
}

.resource-count {
  font-size: 13px;
  color: #606266;
}

.resource-count strong {
  color: #409eff;
  font-size: 15px;
}

.toolbar-actions {
  display: flex;
  gap: 4px;
}

.resource-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.resource-list::-webkit-scrollbar {
  width: 6px;
}

.resource-list::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}

.resource-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 4px;
}

.resource-row:hover {
  background: #f5f7fa;
}

.resource-row.selected {
  background: #ecf5ff;
}

.resource-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #e4e7ed;
  color: #606266;
  flex-shrink: 0;
  min-width: 40px;
  text-align: center;
}

.resource-type.mainImg {
  background: #fef0f0;
  color: #f56c6c;
}

.resource-type.skuImg {
  background: #fdf6ec;
  color: #e6a23c;
}

.resource-type.detailImg {
  background: #ecf5ff;
  color: #409eff;
}

.resource-type.mainVideo,
.resource-type.videoCover {
  background: #f0f9ff;
  color: #67c23a;
}

.resource-label {
  flex: 1;
  font-size: 13px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.resource-ext {
  font-size: 11px;
  color: #909399;
  font-family: "Consolas", monospace;
  flex-shrink: 0;
}

.stats-bar {
  display: flex;
  gap: 16px;
  padding: 12px 16px;
  background: #f5f7fa;
  border-radius: 8px;
  margin-top: 16px;
  margin-bottom: 16px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.stat-label {
  font-size: 11px;
  color: #909399;
}

.stat-value {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.actions {
  padding-top: 16px;
  border-top: 1px solid #e4e7ed;
}
</style>
