import { useEffect, useState } from 'react'
import ChatArea from './components/ChatArea'
import InputBar from './components/InputBar'
import Toast from './components/Toast'
import SettingsModal from './components/SettingsModal'
import { useChatStore } from './store/chatStore'
import { useSettingsStore } from './store/settingsStore'
import { PanelLeft, RefreshCw, Plus, Settings, MessageSquare, Menu } from 'lucide-react'

function SidebarSessionList() {
  const sessions = useChatStore(s => s.sessions)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const selectSession = useChatStore(s => s.selectSession)
  const removeSession = useChatStore(s => s.removeSession)
  const [hoveredSessionId, setHoveredSessionId] = useState<number | null>(null)
  return (
    <div className="space-y-1">
      {sessions.map(session => {
        const isActive = session.id === currentSessionId
        const isHovered = session.id === hoveredSessionId
        return (
          <div
            key={session.id}
            onMouseEnter={() => setHoveredSessionId(session.id ?? null)}
            onMouseLeave={() => setHoveredSessionId(null)}
            className={`
              flex items-center gap-2 rounded-full cursor-pointer transition-colors group
              px-3 py-2
              ${isActive
                ? 'bg-zinc-200 text-zinc-800 font-medium'
                : 'text-zinc-500 hover:bg-zinc-200/50 hover:text-zinc-800 font-medium'
              }
            `}
          >
            <MessageSquare size={16} className="shrink-0" strokeWidth={2} />
            <span
              className="flex-1 text-[14px] tracking-tight truncate"
              onClick={() => session.id !== undefined && selectSession(session.id)}
            >
              {session.title || '新对话'}
            </span>
            {isHovered && session.id !== undefined && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  removeSession(session.id!)
                }}
                className="shrink-0 p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="删除对话"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default function App() {
  // #region debug logs
  const dbg = (label: string, data?: unknown) => {
    console.log(`[DBG App] ${label}`, data);
    fetch('http://127.0.0.1:7252/ingest/f0ec8a8c-1b3f-43cf-b3aa-e816736c30f5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9fecf5' },
      body: JSON.stringify({ sessionId: '9fecf5', location: 'App.tsx', message: label, data, timestamp: Date.now() })
    }).catch(() => {});
  };
  // #endregion

  useEffect(() => {
    useChatStore.getState().loadSessions()
  }, [])

  const { quota, quotaLoading, fetchQuota } = useSettingsStore()
  const { sessions, currentSessionId, toggleSidebar, toastMessage, toastType, dismissToast, isSidebarOpen } = useChatStore()
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const currentSession = sessions.find(s => s.id === currentSessionId)
  const sessionTitle = currentSession?.title || '开始创作'
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div
      className={`
      flex h-screen font-sans text-zinc-900 antialiased overflow-hidden selection:bg-zinc-200
      ${isSidebarOpen
        ? 'bg-[#F5F5F7] p-2 md:p-3 gap-2 md:gap-3'
        : 'bg-[#F5F5F7] p-0 gap-0 m-0'
      }
    `}
      onClick={(e) => dbg('app div click', { tag: (e.target as HTMLElement).tagName, className: String((e.target as HTMLElement).className).slice(0, 100) })}
    >

      {/* Mobile overlay backdrop */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm md:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          flex flex-col justify-between py-4 overflow-hidden shrink-0
          transition-[width,padding,transform,opacity] duration-300 ease-in-out
          fixed md:relative inset-y-0 left-0 z-40
          ${isSidebarOpen
            ? 'w-[260px] px-2 translate-x-0 opacity-100'
            : 'w-[260px] px-2 -translate-x-full opacity-0 md:translate-x-0 md:opacity-100 md:w-0 md:px-0'
          }
          ${mobileSidebarOpen ? 'translate-x-0 opacity-100' : ''}
          bg-[#F5F5F7]
        `}
      >
        <div className="flex flex-col h-full overflow-hidden">

          {/* Logo region */}
          <div className="flex items-center justify-start gap-3 px-2 mb-8 mt-2 h-10">
            <span className="font-bold text-[22px] tracking-tight text-zinc-900 whitespace-nowrap">
              Actum
            </span>
            <span className="px-2 py-1 rounded-full border border-zinc-400 text-zinc-500 font-semibold text-[9px] tracking-widest leading-none self-center">
              EXPERIMENT
            </span>
          </div>

          {/* New chat button */}
          <div className="px-1 mb-6">
            <button
              onClick={() => useChatStore.getState().startNewSession()}
              className="
                w-full flex items-center justify-start gap-1.5 rounded-full
                bg-zinc-200 text-zinc-700 text-[13px]
                hover:bg-zinc-300 active:scale-95
                transition-all duration-200
                px-3 py-2
              "
            >
              <Plus size={14} className="text-zinc-600 shrink-0" strokeWidth={2.5} />
              <span className="font-medium whitespace-nowrap">
                发起新对话
              </span>
            </button>
          </div>

          {/* History list */}
          <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
            <div className={`
              text-[13px] font-semibold text-zinc-400 mb-3 px-3 mt-2
              transition-all duration-300 ease-in-out
              ${isSidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}
            `}>
              历史记录
            </div>
            <SidebarSessionList />
          </div>
        </div>

        {/* API config button */}
        <div className="px-1 mt-4 pt-4 border-t border-zinc-200/50">
          <button
            onClick={() => setShowSettings(true)}
            className="
              w-full flex items-center gap-2 rounded-full text-zinc-500
              hover:bg-zinc-200/60 hover:text-zinc-800 transition-colors
              px-3 py-2
            "
            title="API 配置"
          >
            <Settings size={18} strokeWidth={2} className="shrink-0" />
            <span className="text-[14px] font-medium">API 配置</span>
          </button>
        </div>
      </aside>

      {/* Main Canvas */}
      <main className={`
        flex-1 relative flex flex-col overflow-hidden
        transition-all duration-300 ease-in-out
        ${isSidebarOpen
          ? 'bg-zinc-50 rounded-2xl md:rounded-3xl shadow-[0_0_0_1px_rgba(0,0,0,0.02),0_8px_32px_rgba(0,0,0,0.04)]'
          : 'bg-zinc-50 rounded-none shadow-none'
        }
      `}>
        {/* Unified header: menu button + title + token balance */}
        <header className="flex items-center justify-between px-4 md:px-8 pt-6 pb-3 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (window.innerWidth >= 768) {
                  toggleSidebar()
                } else {
                  setMobileSidebarOpen(v => !v)
                }
              }}
              className="w-9 h-9 flex items-center justify-center bg-zinc-100 hover:bg-zinc-200 rounded-xl transition-colors"
              title="菜单"
            >
              <Menu size={18} strokeWidth={2.5} className="text-zinc-600 md:hidden" />
              <PanelLeft size={18} strokeWidth={2.5} className="text-zinc-600 hidden md:block" />
            </button>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-800">
              {sessionTitle}
            </h2>
          </div>
          <div
            onClick={fetchQuota}
            className="
              flex items-center gap-2 rounded-2xl text-zinc-500
              hover:text-zinc-700 hover:bg-zinc-100 cursor-pointer transition-colors
              px-4 py-2
            "
            title="点击刷新余额"
          >
            {quotaLoading ? (
              <RefreshCw size={15} className="animate-spin" strokeWidth={2.5} />
            ) : (
              <span className="text-[13px] font-bold whitespace-nowrap">令牌余额</span>
            )}
            <span className="text-[14px] font-black tracking-tight">
              {quotaLoading ? '' : (quota !== null ? quota : '--')}
            </span>
          </div>
        </header>

        <ChatArea />
        <InputBar />
      </main>

      {toastMessage && (
        <Toast message={toastMessage} type={toastType} onDismiss={dismissToast} />
      )}

      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(0, 0, 0, 0.08);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(0, 0, 0, 0.15);
        }

        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 1.5s infinite;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}} />
    </div>
  )
}
