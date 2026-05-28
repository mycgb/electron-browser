import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'auth_token'
const USER_KEY = 'auth_user'

function getStoredToken() {
  return localStorage.getItem(STORAGE_KEY) || ''
}

function getStoredUser() {
  try {
    const u = localStorage.getItem(USER_KEY)
    return u ? JSON.parse(u) : null
  } catch {
    return null
  }
}

function saveAuth(token, user) {
  localStorage.setItem(STORAGE_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

function clearAuth() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(USER_KEY)
}

export const useAuthStore = defineStore('auth', () => {
  const token = ref(getStoredToken())
  const user = ref(getStoredUser())
  const panelVisible = ref(false)
  const activeTab = ref('login')

  const loginForm = ref({
    username: '',
    password: '',
    remember: false
  })

  const registerForm = ref({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    agree: false
  })

  const loginLoading = ref(false)
  const registerLoading = ref(false)
  const loginError = ref('')
  const registerError = ref('')

  const isLoggedIn = computed(() => !!token.value && !!user.value)

  function showPanel(mode = 'login') {
    activeTab.value = mode
    loginError.value = ''
    registerError.value = ''
    loginForm.value.username = ''
    loginForm.value.password = ''
    loginForm.value.remember = false
    registerForm.value.username = ''
    registerForm.value.email = ''
    registerForm.value.password = ''
    registerForm.value.confirmPassword = ''
    registerForm.value.agree = false
    panelVisible.value = true
  }

  function hidePanel() {
    panelVisible.value = false
  }

  function togglePanel() {
    if (panelVisible.value) {
      hidePanel()
    } else {
      showPanel()
    }
  }

  function switchTab(tab) {
    activeTab.value = tab
    loginError.value = ''
    registerError.value = ''
  }

  async function handleLogin() {
    loginError.value = ''
    if (!loginForm.value.username.trim()) {
      loginError.value = '请输入用户名'
      return
    }
    if (!loginForm.value.password.trim()) {
      loginError.value = '请输入密码'
      return
    }

    loginLoading.value = true
    try {
      const result = await window.electronAPI?.authLogin({
        username: loginForm.value.username.trim(),
        password: loginForm.value.password
      })

      if (result.success) {
        token.value = result.token
        user.value = result.user
        saveAuth(result.token, result.user)
        hidePanel()
      } else {
        loginError.value = result.error || '登录失败'
      }
    } catch (e) {
      loginError.value = '登录失败，请检查网络连接'
    } finally {
      loginLoading.value = false
    }
  }

  async function handleRegister() {
    registerError.value = ''
    if (!registerForm.value.username.trim()) {
      registerError.value = '请输入用户名'
      return
    }
    if (!registerForm.value.email.trim()) {
      registerError.value = '请输入邮箱'
      return
    }
    if (!registerForm.value.password.trim()) {
      registerError.value = '请输入密码'
      return
    }
    if (registerForm.value.password.length < 6) {
      registerError.value = '密码至少6位'
      return
    }
    if (registerForm.value.password !== registerForm.value.confirmPassword) {
      registerError.value = '两次密码不一致'
      return
    }
    if (!registerForm.value.agree) {
      registerError.value = '请同意用户协议'
      return
    }

    registerLoading.value = true
    try {
      const result = await window.electronAPI?.authRegister({
        username: registerForm.value.username.trim(),
        email: registerForm.value.email.trim(),
        password: registerForm.value.password
      })

      if (result.success) {
        token.value = result.token
        user.value = result.user
        saveAuth(result.token, result.user)
        hidePanel()
      } else {
        registerError.value = result.error || '注册失败'
      }
    } catch (e) {
      registerError.value = '注册失败，请检查网络连接'
    } finally {
      registerLoading.value = false
    }
  }

  function logout() {
    if (token.value) {
      window.electronAPI?.authLogout(token.value)
    }
    token.value = ''
    user.value = null
    clearAuth()
    loginForm.value.username = ''
    loginForm.value.password = ''
    loginForm.value.remember = false
    registerForm.value.username = ''
    registerForm.value.email = ''
    registerForm.value.password = ''
    registerForm.value.confirmPassword = ''
    registerForm.value.agree = false
    loginError.value = ''
    registerError.value = ''
    panelVisible.value = false
    activeTab.value = 'login'
  }

  // ===== 点数相关 =====

  async function checkPoints() {
    if (!token.value) return { ok: false, error: '未登录' }
    try {
      const result = await window.electronAPI?.pointsBalance(token.value)
      if (result.success) {
        user.value = { ...user.value, points: result.points }
        saveAuth(token.value, user.value)
        if (result.points <= 0) {
          return { ok: false, error: '点数不足，请充值后继续使用', points: 0 }
        }
        return { ok: true, points: result.points }
      }
      return { ok: false, error: result.error || '获取点数失败' }
    } catch {
      return { ok: false, error: '无法连接服务器' }
    }
  }

  async function deductPoint(url, platform) {
    if (!token.value) return { ok: false, error: '未登录' }
    try {
      const result = await window.electronAPI?.pointsDeduct({
        token: token.value,
        url,
        platform,
        amount: 1
      })
      if (result.success) {
        user.value = { ...user.value, points: result.balance }
        saveAuth(token.value, user.value)
        return { ok: true, balance: result.balance }
      }
      return { ok: false, error: result.error || '扣点失败', balance: result.balance }
    } catch {
      return { ok: false, error: '无法连接服务器' }
    }
  }

  async function deductPointsBatch(urls) {
    if (!token.value) return { ok: false, error: '未登录' }
    try {
      const result = await window.electronAPI?.pointsDeductBatch({
        token: token.value,
        urls
      })
      if (result.success) {
        user.value = { ...user.value, points: result.balance }
        saveAuth(token.value, user.value)
        return { ok: true, totalCost: result.totalCost, balance: result.balance }
      }
      return { ok: false, error: result.error || '批量扣点失败', balance: result.balance }
    } catch {
      return { ok: false, error: '无法连接服务器' }
    }
  }

  return {
    token,
    user,
    panelVisible,
    activeTab,
    isLoggedIn,
    loginForm,
    registerForm,
    loginLoading,
    registerLoading,
    loginError,
    registerError,
    showPanel,
    hidePanel,
    togglePanel,
    switchTab,
    handleLogin,
    handleRegister,
    logout,
    checkPoints,
    deductPoint,
    deductPointsBatch
  }
})
