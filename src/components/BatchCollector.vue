<template>
  <el-drawer
    v-model="visible"
    title="批量下载"
    direction="rtl"
    size="700px"
    @close="handleClose"
  >
    <div class="batch-collector">
      <div class="step-indicator">
        <el-steps
          :active="batchStore.currentStep - 1"
          finish-status="success"
          align-center
        >
          <el-step title="输入URL" description="粘贴商品链接" />
          <el-step title="分组确认" description="选择要采集的商品" />
          <el-step title="采集下载" description="下载商品资源" />
        </el-steps>
      </div>

      <div v-if="batchStore.currentStep === 1" class="step-content">
        <div class="input-section">
          <div class="section-header">
            <span class="section-title">商品URL列表</span>
            <span class="section-desc"
              >支持淘宝、天猫、京东、1688、阿里巴巴等平台</span
            >
          </div>
          <el-input
            v-model="batchStore.urlInput"
            type="textarea"
            :rows="18"
            spellcheck="false"
            placeholder="请输入商品URL，每行一个&#10;&#10;示例:&#10;https://item.taobao.com/item.htm?id=123456&#10;https://detail.tmall.com/item.htm?id=789012&#10;https://item.jd.com/123456.html"
            class="url-textarea"
          />
          <div class="input-tips">
            <el-icon><InfoFilled /></el-icon>
            <span>提示：系统将自动识别URL所属平台并进行分组</span>
          </div>
        </div>
        <div class="step-actions">
          <el-button type="primary" size="large" @click="handleParseUrls">
            <el-icon><Right /></el-icon>
            解析并分组
          </el-button>
        </div>
      </div>

      <div v-else-if="batchStore.currentStep === 2" class="step-content">
        <div class="summary-bar">
          <div class="summary-item">
            <span class="summary-label">总计</span>
            <span class="summary-value">{{ batchStore.summary.total }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">已识别</span>
            <span class="summary-value success">{{
              batchStore.summary.recognized
            }}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">未识别</span>
            <span class="summary-value warning">{{
              batchStore.summary.unknown
            }}</span>
          </div>
        </div>

        <div class="groups-container">
          <div
            v-for="(group, platformId) in batchStore.groups"
            :key="platformId"
          >
            <div v-if="group.length > 0" class="group-card">
              <div class="group-header" @click="toggleGroup(platformId)">
                <div class="group-left">
                  <span class="group-icon">{{
                    getPlatformIcon(platformId)
                  }}</span>
                  <span class="group-name">{{
                    getPlatformName(platformId)
                  }}</span>
                  <el-tag size="small" type="info">{{ group.length }}</el-tag>
                </div>
                <div class="group-right">
                  <el-button
                    size="small"
                    text
                    type="primary"
                    @click.stop="selectAllInGroup(platformId)"
                  >
                    全选
                  </el-button>
                  <el-button
                    size="small"
                    text
                    @click.stop="deselectAllInGroup(platformId)"
                  >
                    取消
                  </el-button>
                  <el-icon
                    class="toggle-icon"
                    :class="{ expanded: expandedGroups.includes(platformId) }"
                  >
                    <ArrowDown />
                  </el-icon>
                </div>
              </div>
              <el-collapse-transition>
                <div
                  v-show="expandedGroups.includes(platformId)"
                  class="group-body"
                >
                  <div v-for="item in group" :key="item.url" class="url-row">
                    <el-checkbox v-model="item.selected" />
                    <span class="url-text">{{ item.url }}</span>
                  </div>
                </div>
              </el-collapse-transition>
            </div>
          </div>
        </div>

        <div class="step-actions">
          <el-button size="large" @click="goBack">
            <el-icon><Back /></el-icon>
            返回修改
          </el-button>
          <el-button
            type="primary"
            size="large"
            @click="startCollection"
            :loading="batchStore.collecting"
          >
            <el-icon><VideoPlay /></el-icon>
            开始采集
          </el-button>
        </div>
      </div>

      <div v-else-if="batchStore.currentStep === 3" class="step-content">
        <div v-if="batchStore.collecting" class="collecting-status">
          <div class="progress-wrapper">
            <el-progress
              type="dashboard"
              :percentage="batchStore.collectProgress"
              :width="150"
              :stroke-width="12"
            >
              <template #default="{ percentage }">
                <span class="percentage-value">{{ percentage }}%</span>
                <span class="percentage-label">采集进度</span>
              </template>
            </el-progress>
          </div>
          <p class="collecting-text">正在采集下载商品数据，请稍候...</p>
        </div>

        <div v-else class="results-container">
          <div class="results-summary">
            <div class="summary-item">
              <span class="summary-label">采集成功</span>
              <span class="summary-value success">{{ successCount }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">采集失败</span>
              <span class="summary-value fail">{{ failCount }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">下载成功</span>
              <span class="summary-value success">{{
                batchStore.downloadStats.success
              }}</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">下载失败</span>
              <span class="summary-value fail">{{
                batchStore.downloadStats.fail
              }}</span>
            </div>
          </div>

          <div class="results-list">
            <div
              v-for="result in batchStore.collectResults"
              :key="result.url"
              class="result-item"
              :class="{ success: result.success, fail: !result.success }"
            >
              <div class="result-header" @click="toggleResult(result.url)">
                <div class="result-left">
                  <el-icon
                    class="result-icon"
                    :class="{ success: result.success, fail: !result.success }"
                  >
                    <component
                      :is="result.success ? 'CircleCheck' : 'CircleClose'"
                    />
                  </el-icon>
                  <span class="result-platform">{{ result.platformName }}</span>
                  <span class="result-title">{{
                    result.data?.title || "未知商品"
                  }}</span>
                </div>
                <div class="result-right">
                  <el-tag v-if="result.success" size="small" type="success">
                    {{ getResourceCount(result) }} 个资源
                  </el-tag>
                  <el-tag v-else size="small" type="danger">失败</el-tag>
                  <el-icon
                    class="toggle-icon"
                    :class="{ expanded: expandedResults.includes(result.url) }"
                  >
                    <ArrowDown />
                  </el-icon>
                </div>
              </div>
              <el-collapse-transition>
                <div
                  v-show="expandedResults.includes(result.url)"
                  class="result-body"
                >
                  <div
                    v-if="result.success && result.data"
                    class="resource-details"
                  >
                    <div class="resource-row">
                      <span class="resource-label">主图</span>
                      <span class="resource-count"
                        >{{ result.data.mainImages?.length || 0 }} 张</span
                      >
                    </div>
                    <div class="resource-row">
                      <span class="resource-label">详情图</span>
                      <span class="resource-count"
                        >{{ result.data.detailImages?.length || 0 }} 张</span
                      >
                    </div>
                    <div class="resource-row">
                      <span class="resource-label">视频</span>
                      <span class="resource-count"
                        >{{ result.data.mainVideo ? 1 : 0 }} 个</span
                      >
                    </div>
                    <div v-if="result.data.price" class="resource-row">
                      <span class="resource-label">价格</span>
                      <span class="resource-value price">{{
                        result.data.price
                      }}</span>
                    </div>
                  </div>
                  <div v-else class="result-error">
                    <el-icon><WarningFilled /></el-icon>
                    <span>{{ result.error }}</span>
                  </div>
                </div>
              </el-collapse-transition>
            </div>
          </div>

          <div class="step-actions">
            <el-button size="large" @click="resetAll">
              <el-icon><RefreshRight /></el-icon>
              重新开始
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed } from "vue";
import { useBatchStore } from "../stores/batch";
import { useSettingsStore } from "../stores/settings";
import { ElMessage } from "element-plus";

const emit = defineEmits(["start-collect"]);

const batchStore = useBatchStore();
const settingsStore = useSettingsStore();
const expandedGroups = ref([
  "taobao",
  "tmall",
  "jd",
  "1688",
  "alibaba",
  "unknown",
]);
const expandedResults = ref([]);

const visible = computed({
  get: () => batchStore.panelVisible,
  set: (value) => {
    if (value) {
      batchStore.showPanel();
    } else {
      batchStore.hidePanel();
    }
  },
});

const successCount = computed(
  () => batchStore.collectResults.filter((r) => r.success).length,
);
const failCount = computed(
  () => batchStore.collectResults.filter((r) => !r.success).length,
);

function handleClose() {
  batchStore.hidePanel();
}

function handleParseUrls() {
  if (!batchStore.urlInput.trim()) {
    ElMessage.warning("请输入URL");
    return;
  }
  batchStore.parseUrls();
  batchStore.groupUrls();
}

function goBack() {
  batchStore.currentStep = 1;
}

function toggleGroup(platformId) {
  const index = expandedGroups.value.indexOf(platformId);
  if (index > -1) {
    expandedGroups.value.splice(index, 1);
  } else {
    expandedGroups.value.push(platformId);
  }
}

function toggleResult(url) {
  const index = expandedResults.value.indexOf(url);
  if (index > -1) {
    expandedResults.value.splice(index, 1);
  } else {
    expandedResults.value.push(url);
  }
}

function selectAllInGroup(platformId) {
  batchStore.selectAllInGroup(platformId);
}

function deselectAllInGroup(platformId) {
  batchStore.deselectAllInGroup(platformId);
}

async function startCollection() {
  const saveDir = settingsStore.getSavePath();

  if (!saveDir) {
    ElMessage.warning("请先在系统设置中配置文件保存路径");
    return;
  }

  const selectedCount = Object.values(batchStore.groups)
    .flat()
    .filter((item) => item.selected).length;
  if (selectedCount === 0) {
    ElMessage.warning("请至少选择一个URL");
    return;
  }
  emit("start-collect");
}

function resetAll() {
  batchStore.resetState();
  expandedGroups.value = [
    "taobao",
    "tmall",
    "jd",
    "1688",
    "alibaba",
    "unknown",
  ];
  expandedResults.value = [];
}

function getResourceCount(result) {
  if (!result.data) return 0;
  return (
    (result.data.mainImages?.length || 0) +
    (result.data.detailImages?.length || 0) +
    (result.data.mainVideo ? 1 : 0)
  );
}

function getPlatformIcon(platformId) {
  const icons = {
    taobao: "🏪",
    tmall: "🐱",
    jd: "📦",
    1688: "🏢",
    alibaba: "🌐",
    unknown: "❓",
  };
  return icons[platformId] || "❓";
}

function getPlatformName(platformId) {
  const names = {
    taobao: "淘宝",
    tmall: "天猫",
    jd: "京东",
    1688: "1688",
    alibaba: "阿里巴巴",
    unknown: "未识别",
  };
  return names[platformId] || "未知平台";
}
</script>

<style scoped>
.batch-collector {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0 4px;
}

.step-indicator {
  margin-bottom: 32px;
  padding: 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
}

.step-indicator :deep(.el-step__title) {
  font-weight: 600;
}

.step-indicator :deep(.el-step__description) {
  font-size: 12px;
}

.step-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.input-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  margin-bottom: 16px;
}

.section-header {
  margin-bottom: 12px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin-right: 12px;
}

.section-desc {
  font-size: 13px;
  color: #909399;
}

.url-textarea {
  flex: 1;
}

.url-textarea :deep(.el-textarea__inner) {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 13px;
  line-height: 1.6;
  border-radius: 8px;
  border: 2px solid #e4e7ed;
  transition: border-color 0.3s;
}

.url-textarea :deep(.el-textarea__inner:focus) {
  border-color: #667eea;
}

.input-tips {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 12px;
  padding: 10px 14px;
  background: #f0f9ff;
  border-radius: 6px;
  font-size: 13px;
  color: #409eff;
}

.step-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding-top: 20px;
  border-top: 1px solid #e4e7ed;
  margin-top: auto;
}

.summary-bar {
  display: flex;
  gap: 24px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #f0f2f5 100%);
  border-radius: 10px;
  margin-bottom: 20px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-label {
  font-size: 12px;
  color: #909399;
}

.summary-value {
  font-size: 24px;
  font-weight: 700;
  color: #303133;
}

.summary-value.success {
  color: #67c23a;
}

.summary-value.warning {
  color: #e6a23c;
}

.summary-value.fail {
  color: #f56c6c;
}

.groups-container {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.groups-container::-webkit-scrollbar {
  width: 6px;
}

.groups-container::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}

.group-card {
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  margin-bottom: 12px;
  overflow: hidden;
  transition: box-shadow 0.3s;
}

.group-card:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #fafafa;
  cursor: pointer;
  transition: background 0.3s;
}

.group-header:hover {
  background: #f0f2f5;
}

.group-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.group-icon {
  font-size: 20px;
}

.group-name {
  font-weight: 600;
  font-size: 15px;
  color: #303133;
}

.group-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.group-right :deep(.el-button--primary.is-text) {
  color: #fff;
}

.toggle-icon {
  transition: transform 0.3s;
  color: #909399;
}

.toggle-icon.expanded {
  transform: rotate(180deg);
}

.group-body {
  padding: 12px 16px;
  background: #fff;
  border-top: 1px solid #f0f0f0;
}

.url-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid #f5f5f5;
}

.url-row:last-child {
  border-bottom: none;
}

.url-text {
  flex: 1;
  font-size: 12px;
  color: #606266;
  font-family: "Consolas", "Monaco", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.collecting-status {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.progress-wrapper {
  margin-bottom: 24px;
}

.percentage-value {
  font-size: 28px;
  font-weight: 700;
  color: #667eea;
}

.percentage-label {
  font-size: 12px;
  color: #909399;
  display: block;
  margin-top: 4px;
}

.collecting-text {
  font-size: 15px;
  color: #606266;
}

.results-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.results-summary {
  display: flex;
  gap: 24px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #f0f2f5 100%);
  border-radius: 10px;
  margin-bottom: 20px;
}

.results-list {
  flex: 1;
  overflow-y: auto;
  padding-right: 4px;
}

.results-list::-webkit-scrollbar {
  width: 6px;
}

.results-list::-webkit-scrollbar-thumb {
  background: #c0c4cc;
  border-radius: 3px;
}

.result-item {
  border: 1px solid #e4e7ed;
  border-radius: 10px;
  margin-bottom: 10px;
  overflow: hidden;
  transition: box-shadow 0.3s;
}

.result-item:hover {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}

.result-item.success {
  border-left: 4px solid #67c23a;
}

.result-item.fail {
  border-left: 4px solid #f56c6c;
}

.result-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  background: #fafafa;
  cursor: pointer;
  transition: background 0.3s;
}

.result-header:hover {
  background: #f0f2f5;
}

.result-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  overflow: hidden;
}

.result-icon {
  font-size: 18px;
}

.result-icon.success {
  color: #67c23a;
}

.result-icon.fail {
  color: #f56c6c;
}

.result-platform {
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}

.result-title {
  font-size: 14px;
  color: #303133;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.result-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.result-body {
  padding: 16px;
  background: #fff;
  border-top: 1px solid #f0f0f0;
}

.resource-details {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.resource-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #f9fafb;
  border-radius: 6px;
}

.resource-label {
  font-size: 13px;
  color: #606266;
}

.resource-count {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.resource-value.price {
  color: #f56c6c;
  font-weight: 600;
}

.result-error {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #fef0f0;
  border-radius: 6px;
  font-size: 13px;
  color: #f56c6c;
}
</style>
