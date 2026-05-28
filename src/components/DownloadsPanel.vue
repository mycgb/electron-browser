<template>
  <el-drawer v-model="visible" title="下载资源" direction="rtl" size="50%">
    <div class="downloads-content">
      <div class="downloads-toolbar">
        <el-input
          v-model="searchText"
          placeholder="筛选 URL..."
          size="small"
          style="width: 200px"
          @input="handleSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-select
          v-model="selectedType"
          size="small"
          style="width: 120px"
          @change="handleTypeChange"
        >
          <el-option label="全部类型" value="all" />
          <el-option label="图片" value="image" />
          <el-option label="媒体" value="media" />
        </el-select>
        <div class="downloads-actions">
          <el-button type="primary" size="small" @click="downloadSelected">
            下载选中
          </el-button>
          <el-button type="primary" size="small" @click="downloadAll">
            下载全部
          </el-button>
        </div>
      </div>

      <el-table
        ref="tableRef"
        :data="filteredResources"
        style="width: 100%"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" />
        <el-table-column prop="type" label="类型" width="80">
          <template #default="{ row }">
            <el-tag size="small">{{ getTypeLabel(row.type) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="url" label="URL" show-overflow-tooltip />
      </el-table>
    </div>
  </el-drawer>
</template>

<script setup>
import { ref, computed, watch } from "vue";
import { useDownloadsStore } from "../stores/downloads";
import { useNetworkStore } from "../stores/network";
import { ElMessage } from "element-plus";

const downloadsStore = useDownloadsStore();
const networkStore = useNetworkStore();

const visible = computed({
  get: () => downloadsStore.panelVisible,
  set: (value) => {
    if (value) {
      downloadsStore.showPanel();
    } else {
      downloadsStore.hidePanel();
    }
  },
});

const searchText = ref("");
const selectedType = ref("all");
const tableRef = ref(null);
const selectedRows = ref([]);

const filteredResources = computed(() => {
  let result = networkStore.filteredRequests;

  if (selectedType.value !== "all") {
    const typeMap = {
      image: ["image"],
      media: ["video", "audio", "media"],
    };
    const types = typeMap[selectedType.value] || [];
    result = result.filter((req) => {
      const type = (req.type || "").toLowerCase();
      return types.some((t) => type.includes(t));
    });
  }

  if (searchText.value) {
    const search = searchText.value.toLowerCase();
    result = result.filter((req) => req.url.toLowerCase().includes(search));
  }

  return result;
});

function handleSearch(value) {
  downloadsStore.setFilterText(value);
}

function handleTypeChange(value) {
  downloadsStore.setFilterType(value);
}

function handleSelectionChange(selection) {
  selectedRows.value = selection;
}

function getTypeLabel(type) {
  const typeMap = {
    image: "图片",
    video: "视频",
    audio: "音频",
    media: "媒体",
    xhr: "XHR",
    script: "脚本",
    stylesheet: "样式",
  };
  return typeMap[type] || type || "其他";
}

async function downloadSelected() {
  if (selectedRows.value.length === 0) {
    ElMessage.warning("请先选择要下载的资源");
    return;
  }

  const result = await downloadsStore.downloadSelected(
    selectedRows.value.map((row) => ({ id: row.id, url: row.url })),
  );

  if (result) {
    ElMessage.success(
      `下载完成: 成功 ${result.successCount} 个, 失败 ${result.failCount} 个`,
    );
  }
}

async function downloadAll() {
  const result = await downloadsStore.downloadAll(filteredResources.value);

  if (result) {
    ElMessage.success(
      `下载完成: 成功 ${result.successCount} 个, 失败 ${result.failCount} 个`,
    );
  }
}
</script>

<style scoped>
.downloads-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.downloads-toolbar {
  display: flex;
  gap: 3px;
}

.downloads-actions {
  display: flex;
  gap: 8px;
}
</style>
