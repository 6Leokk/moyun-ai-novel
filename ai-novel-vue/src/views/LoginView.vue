<template>
  <div class="login-page">
    <div class="login-card">
      <div class="login-header">
        <h1>墨韵</h1>
        <p>AI 小说创作系统</p>
      </div>

      <div class="login-tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>

      <form @submit.prevent="handleSubmit" class="login-form">
        <div class="form-group">
          <label>邮箱</label>
          <input v-model="form.email" type="email" placeholder="请输入邮箱" required />
        </div>

        <div class="form-group">
          <label>密码</label>
          <input v-model="form.password" type="password" placeholder="请输入密码" required minlength="6" />
        </div>

        <div v-if="mode === 'register'" class="form-group">
          <label>昵称</label>
          <input v-model="form.nickname" type="text" placeholder="请输入昵称" required />
        </div>

        <div v-if="authStore.error" class="error-msg">{{ authStore.error }}</div>

        <button type="submit" class="submit-btn" :disabled="authStore.loading">
          {{ authStore.loading ? '处理中...' : (mode === 'login' ? '登录' : '注册') }}
        </button>
      </form>

      <div v-if="mode === 'login'" class="oauth-section">
        <div class="oauth-divider"><span>或</span></div>
        <button type="button" class="oauth-btn linuxdo" @click="authStore.loginWithLinuxDO()">
          Linux DO 登录
        </button>
      </div>

      <div v-if="mode === 'login'" class="demo-hint">
        演示账号: demo@example.com / 123456
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth.js'

const router = useRouter()
const authStore = useAuthStore()
const mode = ref('login')
const form = reactive({ email: '', password: '', nickname: '' })

onMounted(() => {
  const result = authStore.handleOAuthCallback()
  if (result?.success) {
    router.push('/dashboard')
  }
})

async function handleSubmit() {
  try {
    if (mode.value === 'login') {
      await authStore.login({ email: form.email, password: form.password })
    } else {
      await authStore.register({ email: form.email, password: form.password, nickname: form.nickname })
    }
    router.push('/dashboard')
  } catch (e) {
    // error is set in store
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-deepest);
  padding: 1rem;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--bg-panel);
  border-radius: 12px;
  padding: 2.5rem;
  border: 1px solid var(--border-color);
}

.login-header {
  text-align: center;
  margin-bottom: 2rem;
}

.login-header h1 {
  font-size: 2rem;
  color: var(--text-primary);
  margin: 0;
}

.login-header p {
  color: var(--text-secondary);
  margin: 0.5rem 0 0;
  font-size: 0.9rem;
}

.login-tabs {
  display: flex;
  gap: 0;
  margin-bottom: 1.5rem;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-color);
}

.login-tabs button {
  flex: 1;
  padding: 0.6rem;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  font-family: inherit;
}

.login-tabs button.active {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin-bottom: 0.4rem;
}

.form-group input {
  width: 100%;
  padding: 0.65rem 0.8rem;
  background: var(--bg-deepest);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 0.9rem;
  outline: none;
  box-sizing: border-box;
}

.form-group input:focus {
  border-color: var(--accent);
}

.error-msg {
  color: var(--accent-rose, #e87c7c);
  font-size: 0.8rem;
  margin-bottom: 0.8rem;
}

.submit-btn {
  width: 100%;
  padding: 0.7rem;
  background: var(--gradient-brand);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.2s;
  font-family: inherit;
}

.submit-btn:hover {
  opacity: 0.9;
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.oauth-section {
  margin-top: 1.25rem;
}

.oauth-divider {
  display: flex;
  align-items: center;
  color: var(--text-muted);
  font-size: 0.8rem;
  margin-bottom: 0.75rem;
}

.oauth-divider::before,
.oauth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.oauth-divider span {
  padding: 0 0.75rem;
}

.oauth-btn {
  width: 100%;
  padding: 0.65rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-deepest);
  color: var(--text-primary);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
  font-family: inherit;
}

.oauth-btn:hover {
  border-color: var(--accent);
  background: rgba(74, 109, 122, 0.08);
}

.demo-hint {
  text-align: center;
  margin-top: 1rem;
  color: var(--text-muted);
  font-size: 0.75rem;
}
</style>