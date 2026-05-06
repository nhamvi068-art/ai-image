import { create } from 'zustand'

interface SettingsStore {
  apiKey: string
  baseUrl: string
  quota: number | null
  quotaLoading: boolean
  quotaError: string | null
  setApiKey: (key: string) => void
  setBaseUrl: (url: string) => void
  getHeaders: () => Record<string, string>
  fetchQuota: () => Promise<void>
  testConnection: (url: string, key: string) => Promise<{ success: boolean; quota?: number; error?: string }>
}

function loadFromStorage(key: string): string {
  try {
    return localStorage.getItem(key) ?? ''
  } catch {
    return ''
  }
}

function loadNumberFromStorage(key: string): number | null {
  try {
    const val = localStorage.getItem(key)
    return val !== null ? Number(val) : null
  } catch {
    return null
  }
}

function saveToStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  apiKey: loadFromStorage('actum_api_key'),
  baseUrl: loadFromStorage('actum_base_url'),
  quota: loadNumberFromStorage('actum_quota'),
  quotaLoading: false,
  quotaError: null,

  setApiKey: (key: string) => {
    saveToStorage('actum_api_key', key)
    set({ apiKey: key })
  },

  setBaseUrl: (url: string) => {
    saveToStorage('actum_base_url', url)
    set({ baseUrl: url })
  },

  getHeaders: () => {
    const { apiKey } = get()
    return {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    }
  },

  fetchQuota: async () => {
    const { baseUrl, apiKey } = get()
    if (!baseUrl || !apiKey) {
      set({ quotaError: '请先配置 API 地址和密钥' })
      return
    }
    set({ quotaLoading: true, quotaError: null })
    try {
      const res = await fetch(`${baseUrl}/v1/token/quota`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      if (!res.ok) {
        const msg = `请求失败 (${res.status})`
        set({ quotaLoading: false, quotaError: msg })
        return
      }
      const data = await res.json()
      const quota = data.quota
      saveToStorage('actum_quota', String(quota))
      set({ quota, quotaLoading: false, quotaError: null })
    } catch (err) {
      set({ quotaLoading: false, quotaError: '网络错误，请检查网络连接' })
    }
  },

  testConnection: async (url: string, key: string) => {
    if (!url || !key) {
      return { success: false, error: '请填写 API 地址和密钥' }
    }
    try {
      const res = await fetch(`${url}/v1/token/quota`, {
        headers: { Authorization: `Bearer ${key}` },
      })
      if (!res.ok) {
        return { success: false, error: `请求失败 (${res.status})` }
      }
      const data = await res.json()
      const quota = data.quota
      return { success: true, quota }
    } catch {
      return { success: false, error: '网络错误，请检查网络连接' }
    }
  },
}))
