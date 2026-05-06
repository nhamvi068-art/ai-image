import { useState, useEffect } from 'react'
import { X, Key, Globe, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useSettingsStore } from '../store/settingsStore'

interface Props {
  open: boolean
  onClose: () => void
}

type TestStatus = 'idle' | 'loading' | 'success' | 'error'

export default function SettingsModal({ open, onClose }: Props) {
  const { apiKey, baseUrl, setApiKey, setBaseUrl, testConnection, fetchQuota } = useSettingsStore()
  const [localKey, setLocalKey] = useState('')
  const [localUrl, setLocalUrl] = useState('')
  const [testStatus, setTestStatus] = useState<TestStatus>('idle')
  const [testMessage, setTestMessage] = useState('')

  useEffect(() => {
    if (open) {
      setLocalKey(apiKey)
      setLocalUrl(baseUrl)
      setTestStatus('idle')
      setTestMessage('')
    }
  }, [open, apiKey, baseUrl])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (open) document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const handleTest = async () => {
    setTestStatus('loading')
    setTestMessage('')
    const result = await testConnection(localUrl.trim(), localKey.trim())
    if (result.success) {
      setTestStatus('success')
      setTestMessage(result.quota !== undefined ? `连接成功，当前余额: ${result.quota}` : '连接成功')
    } else {
      setTestStatus('error')
      setTestMessage(result.error ?? '连接失败')
    }
  }

  const handleSave = () => {
    setApiKey(localKey.trim())
    setBaseUrl(localUrl.trim())
    setTestStatus('idle')
    setTestMessage('')
    onClose()
    if (localKey.trim() && localUrl.trim()) {
      fetchQuota()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Card */}
      <div className="
        relative bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4
        max-h-[90vh] overflow-y-auto
        animate-fade-in-up
      ">
        {/* Header */}
        <div className="flex items-center justify-between px-5 md:px-7 pt-6 md:pt-7 pb-4 md:pb-5">
          <h2 className="text-[18px] font-bold text-zinc-900">API 配置</h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors p-1 rounded-lg"
          >
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 md:px-7 pb-4 md:pb-5 space-y-5">
          {/* Base URL */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px] font-semibold text-zinc-600">
              <Globe size={14} strokeWidth={2.5} />
              API Base URL
            </label>
            <input
              type="url"
              value={localUrl}
              onChange={e => setLocalUrl(e.target.value)}
              placeholder="https://api.example.com"
              className="
                w-full px-4 py-3 rounded-xl border border-zinc-200
                text-[14px] text-zinc-800 placeholder-zinc-400
                focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent
                transition-all
              "
            />
            <p className="text-[11px] text-zinc-400">
              图像生成服务的 API 地址
            </p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[13px] font-semibold text-zinc-600">
              <Key size={14} strokeWidth={2.5} />
              API Key
            </label>
            <input
              type="password"
              value={localKey}
              onChange={e => setLocalKey(e.target.value)}
              placeholder="sk-xxxxxxxxxxxxxxxx"
              className="
                w-full px-4 py-3 rounded-xl border border-zinc-200
                text-[14px] text-zinc-800 placeholder-zinc-400
                focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:border-transparent
                transition-all
              "
            />
            <p className="text-[11px] text-zinc-400">
              存储在浏览器本地，不会被上传至任何服务器
            </p>
          </div>

          {/* Test result message */}
          {testMessage && (
            <div className={`
              flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-medium
              ${testStatus === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-500'}
            `}>
              {testStatus === 'success' ? (
                <CheckCircle size={15} strokeWidth={2.5} />
              ) : (
                <XCircle size={15} strokeWidth={2.5} />
              )}
              {testMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 md:px-7 pb-5 md:pb-7 flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleTest}
            disabled={testStatus === 'loading' || !localUrl.trim() || !localKey.trim()}
            className="
              flex-1 py-3 rounded-xl border border-zinc-200 text-zinc-600 text-[15px] font-semibold
              hover:bg-zinc-50 active:scale-[0.98] transition-all
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white
            "
          >
            {testStatus === 'loading' ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" />
                测试中...
              </span>
            ) : (
              '测试连接'
            )}
          </button>
          <button
            onClick={handleSave}
            className="
              flex-1 py-3 rounded-xl bg-zinc-900 text-white text-[15px] font-semibold
              hover:bg-zinc-700 active:scale-[0.98] transition-all
            "
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
