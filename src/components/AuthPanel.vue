<template>
  <div
    class="auth-overlay"
    v-if="authStore.panelVisible"
    @click.self="authStore.hidePanel"
  >
    <div class="auth-panel">
      <button class="auth-close-btn" @click="authStore.hidePanel">
        &times;
      </button>

      <div class="auth-tabs">
        <button
          :class="['auth-tab', { active: authStore.activeTab === 'login' }]"
          @click="authStore.switchTab('login')"
        >
          登录
        </button>
        <button
          :class="['auth-tab', { active: authStore.activeTab === 'register' }]"
          @click="authStore.switchTab('register')"
        >
          注册
        </button>
      </div>

      <div class="auth-body">
        <form
          v-if="authStore.activeTab === 'login'"
          @submit.prevent="authStore.handleLogin"
          class="auth-form"
        >
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input
              type="text"
              class="form-input"
              v-model="authStore.loginForm.username"
              placeholder="请输入用户名"
            />
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input
              type="password"
              class="form-input"
              v-model="authStore.loginForm.password"
              placeholder="请输入密码"
            />
          </div>
          <div class="form-extra">
            <label class="form-checkbox">
              <input type="checkbox" v-model="authStore.loginForm.remember" />
              <span>记住密码</span>
            </label>
          </div>
          <div v-if="authStore.loginError" class="form-error">
            {{ authStore.loginError }}
          </div>
          <button
            type="submit"
            class="auth-btn"
            :disabled="authStore.loginLoading"
          >
            {{ authStore.loginLoading ? "登录中..." : "登 录" }}
          </button>
        </form>

        <form
          v-if="authStore.activeTab === 'register'"
          @submit.prevent="authStore.handleRegister"
          class="auth-form"
        >
          <div class="form-group">
            <label class="form-label">用户名</label>
            <input
              type="text"
              class="form-input"
              v-model="authStore.registerForm.username"
              placeholder="请输入用户名"
            />
          </div>
          <div class="form-group">
            <label class="form-label">邮箱</label>
            <input
              type="email"
              class="form-input"
              v-model="authStore.registerForm.email"
              placeholder="请输入邮箱地址"
            />
          </div>
          <div class="form-group">
            <label class="form-label">密码</label>
            <input
              type="password"
              class="form-input"
              v-model="authStore.registerForm.password"
              placeholder="至少6位密码"
            />
          </div>
          <div class="form-group">
            <label class="form-label">确认密码</label>
            <input
              type="password"
              class="form-input"
              v-model="authStore.registerForm.confirmPassword"
              placeholder="再次输入密码"
            />
          </div>
          <div class="form-extra">
            <label class="form-checkbox">
              <input type="checkbox" v-model="authStore.registerForm.agree" />
              <span>同意用户协议和隐私政策</span>
            </label>
          </div>
          <div v-if="authStore.registerError" class="form-error">
            {{ authStore.registerError }}
          </div>
          <button
            type="submit"
            class="auth-btn register-btn"
            :disabled="authStore.registerLoading"
          >
            {{ authStore.registerLoading ? "注册中..." : "注 册" }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAuthStore } from "../stores/auth";

const authStore = useAuthStore();
</script>

<style scoped>
.auth-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
}

.auth-panel {
  background: #1a1a2e;
  border: 1px solid #0f3460;
  border-radius: 12px;
  width: 400px;
  padding: 0;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

.auth-close-btn {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
  z-index: 1;
  transition: color 0.2s;
}

.auth-close-btn:hover {
  color: #fff;
}

.auth-tabs {
  display: flex;
  border-bottom: 1px solid #0f3460;
}

.auth-tab {
  flex: 1;
  padding: 16px;
  border: none;
  background: transparent;
  color: #888;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}

.auth-tab:hover {
  color: #ccc;
}

.auth-tab.active {
  color: #4fc3f7;
}

.auth-tab.active::after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 20%;
  right: 20%;
  height: 2px;
  background: #4fc3f7;
  border-radius: 1px;
}

.auth-body {
  padding: 24px 32px 32px;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  color: #aaa;
}

.form-input {
  padding: 10px 14px;
  border: 1px solid #0f3460;
  border-radius: 8px;
  background: #16213e;
  color: #e0e0e0;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s;
}

.form-input::placeholder {
  color: #555;
}

.form-input:focus {
  border-color: #4fc3f7;
}

.form-extra {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.form-checkbox {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #aaa;
  cursor: pointer;
}

.form-checkbox input {
  accent-color: #4fc3f7;
}

.form-error {
  background: rgba(233, 69, 96, 0.15);
  border: 1px solid rgba(233, 69, 96, 0.3);
  color: #e94560;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.auth-btn {
  padding: 12px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #4fc3f7, #2196f3);
  color: #fff;
  font-size: 15px;
  cursor: pointer;
  transition: opacity 0.2s;
  margin-top: 4px;
}

.auth-btn:hover:not(:disabled) {
  opacity: 0.9;
}

.auth-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.register-btn {
  background: linear-gradient(135deg, #81c784, #4caf50);
}
</style>
