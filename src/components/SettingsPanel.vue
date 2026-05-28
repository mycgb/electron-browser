<template>
  <div
    class="settings-overlay"
    v-show="settingsStore.panelVisible"
    @click.self="settingsStore.closePanel"
  >
    <div class="settings-panel">
      <div class="settings-header">
        <span>⚙️ 设置</span>
        <button class="settings-close-btn" @click="settingsStore.closePanel">
          ×
        </button>
      </div>

      <div class="settings-nav">
        <button
          v-for="section in sections"
          :key="section.key"
          :class="[
            'settings-nav-btn',
            { active: settingsStore.activeSection === section.key },
          ]"
          @click="settingsStore.setActiveSection(section.key)"
        >
          {{ section.label }}
        </button>
      </div>

      <div class="settings-body">
        <div
          v-show="settingsStore.activeSection === 'basic'"
          class="settings-section"
        >
          <div class="setting-group">
            <label class="setting-label">文件保存路径</label>
            <div class="setting-row">
              <input
                type="text"
                class="setting-input"
                :value="settingsStore.settings.savePath"
                readonly
                placeholder="选择保存路径..."
              />
              <button class="setting-btn" @click="settingsStore.selectFolder">
                浏览
              </button>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">请求间隔（毫秒）</label>
            <div class="setting-row">
              <input
                type="number"
                class="setting-input"
                v-model.number="settingsStore.settings.requestInterval"
                min="0"
                max="60000"
                step="100"
              />
              <span class="setting-hint">0 = 无间隔，建议 300-1000</span>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">默认文件格式</label>
            <div class="setting-row">
              <select
                class="setting-select"
                v-model="settingsStore.settings.fileFormat"
              >
                <option value="original">保留原始格式</option>
                <option value="jpg">JPG</option>
                <option value="png">PNG</option>
                <option value="webp">WebP</option>
              </select>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">命名规则</label>
            <div class="setting-row">
              <input
                type="text"
                class="setting-input"
                v-model="settingsStore.settings.namingRule"
                placeholder="{type}_{index}"
              />
            </div>
            <div class="setting-hint">
              可用变量：{type} 类型, {index} 序号, {name} 原始名称, {date} 日期,
              {time} 时间
            </div>
            <div class="setting-row" style="margin-top: 8px">
              <label class="setting-label-sm">分隔符</label>
              <select
                class="setting-select setting-select-sm"
                v-model="settingsStore.settings.separator"
              >
                <option value="_">下划线 _</option>
                <option value="-">连字符 -</option>
                <option value="#">井号 #</option>
                <option value="">无</option>
              </select>
            </div>
          </div>

          <div class="setting-group">
            <label class="toggle-item">
              <input
                type="checkbox"
                v-model="settingsStore.settings.folderStructure.enabled"
              />
              <span class="toggle-switch"></span>
              <span class="setting-label">文件夹组织</span>
            </label>
            <div class="setting-hint">启用后按规则自动创建文件夹分类保存</div>

            <div
              class="folder-structure-options"
              :class="{
                enabled: settingsStore.settings.folderStructure.enabled,
              }"
            >
              <div class="setting-row" style="margin-top: 12px">
                <label class="toggle-item">
                  <input
                    type="checkbox"
                    v-model="settingsStore.settings.folderStructure.byTitle"
                  />
                  <span class="toggle-switch toggle-switch-sm"></span>
                  <span class="toggle-text">按商品标题创建文件夹</span>
                </label>
              </div>
              <div class="setting-row" style="margin-top: 8px">
                <label class="toggle-item">
                  <input
                    type="checkbox"
                    v-model="settingsStore.settings.folderStructure.byType"
                  />
                  <span class="toggle-switch toggle-switch-sm"></span>
                  <span class="toggle-text">按资源类型创建子文件夹</span>
                </label>
              </div>

              <div
                v-if="settingsStore.settings.folderStructure.byType"
                class="folder-name-settings"
              >
                <div class="setting-row" style="margin-top: 12px">
                  <label class="setting-label-sm" style="width: 70px"
                    >主图文件夹</label
                  >
                  <input
                    type="text"
                    class="setting-input setting-input-sm"
                    v-model="
                      settingsStore.settings.folderStructure.mainImgFolder
                    "
                  />
                </div>
                <div class="setting-row" style="margin-top: 8px">
                  <label class="setting-label-sm" style="width: 70px"
                    >SKU文件夹</label
                  >
                  <input
                    type="text"
                    class="setting-input setting-input-sm"
                    v-model="
                      settingsStore.settings.folderStructure.skuImgFolder
                    "
                  />
                </div>
                <div class="setting-row" style="margin-top: 8px">
                  <label class="setting-label-sm" style="width: 70px"
                    >详情图文件夹</label
                  >
                  <input
                    type="text"
                    class="setting-input setting-input-sm"
                    v-model="
                      settingsStore.settings.folderStructure.detailImgFolder
                    "
                  />
                </div>
                <div class="setting-row" style="margin-top: 8px">
                  <label class="setting-label-sm" style="width: 70px"
                    >视频封面文件夹</label
                  >
                  <input
                    type="text"
                    class="setting-input setting-input-sm"
                    v-model="
                      settingsStore.settings.folderStructure.videoCoverFolder
                    "
                  />
                </div>
                <div class="setting-row" style="margin-top: 8px">
                  <label class="setting-label-sm" style="width: 70px"
                    >视频文件夹</label
                  >
                  <input
                    type="text"
                    class="setting-input setting-input-sm"
                    v-model="
                      settingsStore.settings.folderStructure.mainVideoFolder
                    "
                  />
                </div>
              </div>

              <div class="folder-preview" style="margin-top: 12px">
                <div class="setting-hint">预览结构：</div>
                <div class="preview-tree">
                  <div class="preview-item">📁 保存路径/</div>
                  <div
                    v-if="settingsStore.settings.folderStructure.byTitle"
                    class="preview-item preview-indent-1"
                  >
                    📁 商品标题/
                  </div>
                  <template
                    v-if="settingsStore.settings.folderStructure.byType"
                  >
                    <div class="preview-item preview-indent-2">
                      📁
                      {{
                        settingsStore.settings.folderStructure.mainImgFolder
                      }}/
                    </div>
                    <div class="preview-item preview-indent-3">
                      📄 主图_1.jpg
                    </div>
                    <div class="preview-item preview-indent-2">
                      📁
                      {{ settingsStore.settings.folderStructure.skuImgFolder }}/
                    </div>
                    <div class="preview-item preview-indent-3">
                      📄 SKU图_1.jpg
                    </div>
                    <div class="preview-item preview-indent-2">
                      📁
                      {{
                        settingsStore.settings.folderStructure.detailImgFolder
                      }}/
                    </div>
                    <div class="preview-item preview-indent-3">
                      📄 详情图_1.jpg
                    </div>
                  </template>
                  <div
                    v-else-if="settingsStore.settings.folderStructure.byTitle"
                    class="preview-item preview-indent-2"
                  >
                    📄 主图_1.jpg
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="setting-group">
            <label class="setting-label">导出CSV</label>
            <div class="setting-row">
              <button class="setting-btn" @click="exportCSV">导出 CSV</button>
              <select
                class="setting-select setting-select-sm"
                v-model="settingsStore.settings.csvEncoding"
              >
                <option value="utf8bom">UTF-8 with BOM</option>
                <option value="gb2312">GB2312</option>
              </select>
            </div>
          </div>
        </div>

        <div
          v-show="settingsStore.activeSection === 'theme'"
          class="settings-section"
        >
          <div class="setting-group">
            <label class="setting-label">选择主题</label>
            <div class="theme-grid">
              <div
                v-for="theme in themes"
                :key="theme.key"
                :class="[
                  'theme-card',
                  { active: settingsStore.settings.theme === theme.key },
                ]"
                @click="settingsStore.settings.theme = theme.key"
              >
                <div
                  class="theme-preview"
                  :style="{
                    background: `linear-gradient(135deg, ${theme.colors[0]} 0%, ${theme.colors[0]} 60%, ${theme.colors[1]} 100%)`,
                  }"
                >
                  <div
                    class="theme-preview-bar"
                    :style="{ background: theme.colors[1] }"
                  ></div>
                  <div
                    class="theme-preview-dot"
                    :style="{ background: theme.colors[1] }"
                  ></div>
                </div>
                <div class="theme-info">
                  <div class="theme-name">{{ theme.label }}</div>
                  <div class="theme-desc">{{ theme.desc }}</div>
                </div>
                <div
                  v-if="settingsStore.settings.theme === theme.key"
                  class="theme-check"
                >
                  ✓
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          v-show="settingsStore.activeSection === 'collect'"
          class="settings-section"
        >
          <div class="setting-group">
            <label class="setting-label">下载分类</label>
            <div class="setting-toggles">
              <label class="toggle-item">
                <input
                  type="checkbox"
                  v-model="settingsStore.settings.collectCategories.mainImg"
                />
                <span class="toggle-switch"></span>
                <span class="toggle-text">主图</span>
              </label>
              <label class="toggle-item">
                <input
                  type="checkbox"
                  v-model="settingsStore.settings.collectCategories.skuImg"
                />
                <span class="toggle-switch"></span>
                <span class="toggle-text">SKU图</span>
              </label>
              <label class="toggle-item">
                <input
                  type="checkbox"
                  v-model="settingsStore.settings.collectCategories.detailImg"
                />
                <span class="toggle-switch"></span>
                <span class="toggle-text">详情页长图</span>
              </label>
              <label class="toggle-item">
                <input
                  type="checkbox"
                  v-model="settingsStore.settings.collectCategories.videoCover"
                />
                <span class="toggle-switch"></span>
                <span class="toggle-text">视频封面图</span>
              </label>
              <label class="toggle-item">
                <input
                  type="checkbox"
                  v-model="settingsStore.settings.collectCategories.mainVideo"
                />
                <span class="toggle-switch"></span>
                <span class="toggle-text">主图视频</span>
              </label>
            </div>
          </div>
        </div>

        <div
          v-show="settingsStore.activeSection === 'proxy'"
          class="settings-section"
        >
          <div class="setting-group">
            <label class="toggle-item">
              <input
                type="checkbox"
                v-model="settingsStore.settings.proxy.enabled"
              />
              <span class="toggle-switch"></span>
              <span class="setting-label">启用代理</span>
            </label>
            <div class="setting-hint">
              启用后，所有 HTTP/HTTPS 请求将通过代理发出
            </div>
          </div>

          <div
            class="setting-group proxy-settings-fields"
            :class="{ enabled: settingsStore.settings.proxy.enabled }"
          >
            <div class="setting-row">
              <label class="setting-label-sm">协议</label>
              <select
                class="setting-select setting-select-sm"
                v-model="settingsStore.settings.proxy.protocol"
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>
            <div class="setting-row" style="margin-top: 8px">
              <label class="setting-label-sm">地址</label>
              <input
                type="text"
                class="setting-input"
                v-model="settingsStore.settings.proxy.host"
                placeholder="127.0.0.1"
              />
            </div>
            <div class="setting-row" style="margin-top: 8px">
              <label class="setting-label-sm">端口</label>
              <input
                type="number"
                class="setting-input"
                v-model.number="settingsStore.settings.proxy.port"
                placeholder="7890"
                min="1"
                max="65535"
              />
            </div>
            <div class="setting-row" style="margin-top: 8px">
              <label class="setting-label-sm">用户名</label>
              <input
                type="text"
                class="setting-input"
                v-model="settingsStore.settings.proxy.user"
                placeholder="可选"
              />
            </div>
            <div class="setting-row" style="margin-top: 8px">
              <label class="setting-label-sm">密码</label>
              <input
                type="password"
                class="setting-input"
                v-model="settingsStore.settings.proxy.pass"
                placeholder="可选"
              />
            </div>
          </div>
        </div>
      </div>

      <div class="settings-footer">
        <button class="setting-btn setting-btn-primary" @click="handleSave">
          保存设置
        </button>
        <button class="setting-btn" @click="handleReset">恢复默认</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useSettingsStore } from "../stores/settings";
import { useStatusStore } from "../stores/status";

const settingsStore = useSettingsStore();
const statusStore = useStatusStore();

const sections = [
  { key: "basic", label: "基础设置" },
  { key: "theme", label: "主题设置" },
  { key: "collect", label: "采集设置" },
  { key: "proxy", label: "代理设置" },
];

const themes = [
  {
    key: "default",
    label: "默认主题",
    desc: "深色主题，红色强调",
    colors: ["#1a1a2e", "#e94560"],
  },
  {
    key: "light-gray",
    label: "浅灰色主题",
    desc: "浅色主题，灰色强调",
    colors: ["#f5f5f5", "#606266"],
  },
  {
    key: "dark-red",
    label: "深红色主题",
    desc: "深色主题，红色系",
    colors: ["#2d1b1b", "#ff4d4d"],
  },
  {
    key: "dark-blue",
    label: "深蓝色主题",
    desc: "深色主题，蓝色系",
    colors: ["#0d1b2a", "#4a9eff"],
  },
  {
    key: "dark-green",
    label: "深绿色主题",
    desc: "深色主题，绿色系",
    colors: ["#1a2d1a", "#4ade80"],
  },
  {
    key: "dark-purple",
    label: "深紫色主题",
    desc: "深色主题，紫色系",
    colors: ["#1d1a2d", "#a855f7"],
  },
];

function handleSave() {
  settingsStore.closePanel();
  statusStore.setStatus("设置已保存");
}

function handleReset() {
  if (confirm("确定要恢复默认设置吗？")) {
    settingsStore.resetSettings();
  }
}

function exportCSV() {
  const encoding = settingsStore.settings.csvEncoding;
  const categories = settingsStore.settings.collectCategories;
  const activeCategories = [];
  if (categories.mainImg) activeCategories.push("主图");
  if (categories.skuImg) activeCategories.push("SKU图");
  if (categories.detailImg) activeCategories.push("详情页长图");
  if (categories.videoCover) activeCategories.push("视频封面图");
  if (categories.mainVideo) activeCategories.push("主图视频");

  const rows = [["类型", "URL", "文件名", "格式", "下载时间"]];
  const csvContent = rows.map((r) => r.join(",")).join("\n");

  let blob;
  if (encoding === "utf8bom") {
    const bom = "\uFEFF";
    blob = new Blob([bom + csvContent], { type: "text/csv;charset=utf-8" });
  } else {
    blob = new Blob([csvContent], { type: "text/csv;charset=gb2312" });
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "采集数据_" + new Date().toISOString().slice(0, 10) + ".csv";
  a.click();
  URL.revokeObjectURL(url);

  statusStore.setStatus("CSV 已导出");
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--theme-overlay);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9000;
}

.settings-panel {
  width: 680px;
  max-height: 80vh;
  background: var(--theme-bg-primary);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 12px 48px var(--theme-overlay);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  border-bottom: 1px solid var(--theme-border);
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-accent);
}

.settings-close-btn {
  background: none;
  border: none;
  color: var(--theme-text-secondary);
  font-size: 20px;
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
}

.settings-close-btn:hover {
  color: var(--theme-accent);
}

.settings-nav {
  display: flex;
  border-bottom: 1px solid var(--theme-border);
  padding: 0 16px;
}

.settings-nav-btn {
  background: none;
  border: none;
  color: var(--theme-text-muted);
  padding: 12px 20px;
  font-size: 14px;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.settings-nav-btn:hover {
  color: var(--theme-text-secondary);
}

.settings-nav-btn.active {
  color: var(--theme-accent);
  border-bottom-color: var(--theme-accent);
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.settings-section {
  display: block;
}

.setting-group {
  margin-bottom: 20px;
}

.setting-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text-secondary);
  margin-bottom: 8px;
}

.setting-label-sm {
  font-size: 13px;
  color: var(--theme-text-muted);
  min-width: 50px;
  flex-shrink: 0;
}

.setting-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.setting-input {
  flex: 1;
  background: var(--theme-input-bg);
  border: 1px solid var(--theme-input-border);
  border-radius: 6px;
  padding: 8px 12px;
  color: var(--theme-text-secondary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.2s;
}

.setting-input:focus {
  border-color: var(--theme-accent);
}

.setting-input[readonly] {
  cursor: pointer;
  opacity: 0.8;
}

.setting-select {
  background: var(--theme-input-bg);
  border: 1px solid var(--theme-input-border);
  border-radius: 6px;
  padding: 8px 12px;
  color: var(--theme-text-secondary);
  font-size: 13px;
  outline: none;
  cursor: pointer;
}

.setting-select-sm {
  width: auto;
  min-width: 120px;
}

.setting-btn {
  padding: 8px 16px;
  background: var(--theme-button-bg);
  border: none;
  color: var(--theme-text-primary);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
  white-space: nowrap;
}

.setting-btn:hover {
  background: var(--theme-button-hover);
}

.setting-btn-primary {
  background: var(--theme-accent);
}

.setting-btn-primary:hover {
  background: var(--theme-accent-hover);
}

.setting-hint {
  font-size: 12px;
  color: var(--theme-text-muted);
  margin-top: 4px;
}

.setting-toggles {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toggle-item {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}

.toggle-item input[type="checkbox"] {
  display: none;
}

.toggle-switch {
  width: 40px;
  height: 20px;
  background: var(--theme-bg-tertiary);
  border-radius: 10px;
  position: relative;
  transition: background 0.2s;
}

.toggle-switch::after {
  content: "";
  position: absolute;
  width: 16px;
  height: 16px;
  background: #fff;
  border-radius: 50%;
  top: 2px;
  left: 2px;
  transition: transform 0.2s;
}

.toggle-item input:checked + .toggle-switch {
  background: var(--theme-accent);
}

.toggle-item input:checked + .toggle-switch::after {
  transform: translateX(20px);
}

.toggle-text {
  font-size: 13px;
  color: var(--theme-text-secondary);
}

.proxy-settings-fields {
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 0.2s;
}

.proxy-settings-fields.enabled {
  opacity: 1;
  pointer-events: auto;
}

.folder-structure-options {
  opacity: 0.5;
  pointer-events: none;
  transition: opacity 0.2s;
  margin-top: 12px;
  padding: 12px;
  background: rgba(15, 52, 96, 0.3);
  border-radius: 8px;
}

.folder-structure-options.enabled {
  opacity: 1;
  pointer-events: auto;
}

.folder-name-settings {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--theme-border-light);
}

.setting-input-sm {
  max-width: 200px;
}

.toggle-switch-sm {
  width: 32px;
  height: 16px;
}

.toggle-switch-sm::after {
  width: 12px;
  height: 12px;
}

.toggle-item input:checked + .toggle-switch-sm::after {
  transform: translateX(16px);
}

.folder-preview {
  padding: 12px;
  background: var(--theme-overlay);
  border-radius: 6px;
  border: 1px solid var(--theme-border-light);
}

.preview-tree {
  font-family: "Consolas", "Monaco", monospace;
  font-size: 12px;
  margin-top: 8px;
}

.preview-item {
  color: var(--theme-text-muted);
  padding: 2px 0;
}

.preview-indent-1 {
  padding-left: 20px;
}

.preview-indent-2 {
  padding-left: 40px;
}

.preview-indent-3 {
  padding-left: 60px;
}

.settings-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--theme-border);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-top: 12px;
}

.theme-card {
  position: relative;
  padding: 12px;
  background: var(--theme-input-bg);
  border: 2px solid var(--theme-border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.theme-card:hover {
  border-color: #4a4a5e;
}

.theme-card.active {
  border-color: var(--theme-accent);
}

.theme-preview {
  height: 60px;
  border-radius: 4px;
  position: relative;
  overflow: hidden;
}

.theme-preview-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 8px;
}

.theme-preview-dot {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.theme-info {
  margin-top: 8px;
}

.theme-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text-secondary);
}

.theme-desc {
  font-size: 11px;
  color: var(--theme-text-muted);
  margin-top: 2px;
}

.theme-check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 20px;
  height: 20px;
  background: var(--theme-accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #fff;
}
</style>
