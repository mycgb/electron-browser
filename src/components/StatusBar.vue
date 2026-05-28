<template>
  <div class="status-bar">
    <span class="status-text">{{ statusStore.statusText }}</span>
    <span class="status-right">
      <span class="status-info" v-if="statusStore.statusInfo">{{
        statusStore.statusInfo
      }}</span>
      <span v-if="authStore.isLoggedIn" class="login-info">
        <span class="login-user" title="用户名">{{
          authStore.user?.username
        }}</span>
        <span class="login-divider">|</span>
        <span class="login-points" title="点数"
          >{{ authStore.user?.points || 0 }}点</span
        >
        <span class="login-divider">|</span>
      </span>
      <span class="status-version">版本 v1.0.0</span>
      <span class="login-divider">|</span>
      <span class="status-author" title="作者微信">作者微信 xixi_soft69</span>
    </span>
  </div>
</template>

<script setup>
import { useStatusStore } from "../stores/status";
import { useAuthStore } from "../stores/auth";

const statusStore = useStatusStore();
const authStore = useAuthStore();
</script>

<style scoped>
.status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 12px;
  background: var(--theme-bg-secondary);
  border-top: 1px solid var(--theme-border);
  font-size: 12px;
  color: var(--theme-text-primary);
  height: 24px;
}

.status-text {
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.status-info {
  color: var(--theme-text-primary);
}

.status-version {
  color: var(--theme-info);
}

.status-author {
  color: var(--theme-success);
}

.login-info {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.login-user {
  color: var(--theme-text-secondary);
}

.login-points {
  color: var(--theme-info);
  font-weight: bold;
}

.login-divider {
  color: var(--theme-text-muted);
}
</style>
