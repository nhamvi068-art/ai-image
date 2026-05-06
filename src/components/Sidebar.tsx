import { useEffect, useState } from 'react'
import { useChatStore } from '../store/chatStore'
import {
  MessageSquare,
  Settings,
  Trash2,
  Plus,
} from 'lucide-react'
import SettingsModal from './SettingsModal'

export default function Sidebar() {
  const [showSettings, setShowSettings] = useState(false)
  const isSidebarOpen = useChatStore(s => s.isSidebarOpen)
  const sessions = useChatStore(s => s.sessions)
  const currentSessionId = useChatStore(s => s.currentSessionId)
  const loadSessions = useChatStore(s => s.loadSessions)
  const startNewSession = useChatStore(s => s.startNewSession)
  const selectSession = useChatStore(s => s.selectSession)
  const removeSession = useChatStore(s => s.removeSession)
  const [hoveredSessionId, setHoveredSessionId] = useState<number | null>(null)

  useEffect(() => {
    loadSessions()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <aside
        className={`
          flex flex-col justify-between py-4 transition-[width] duration-300 ease-in-out overflow-hidden shrink-0
          ${isSidebarOpen ? 'w-[260px] px-2' : 'w-0 px-0'}
        `}
      >
      <div className="flex flex-col h-full overflow-hidden">

        {/* Logo region */}
        <div className="flex items-center justify-start gap-3 px-2 mb-8 mt-2 h-10">
          <span className="font-bold text-[22px] tracking-tight text-zinc-900 animate-fade-in whitespace-nowrap">
            Actum
          </span>
          <span className="px-2 py-1 rounded-full border border-zinc-400 text-zinc-500 font-semibold text-[9px] tracking-widest leading-none self-center">
            EXPERIMENT
          </span>
        </div>

        {/* New chat button */}
        <div className="px-1 mb-6">
          <button
            onClick={startNewSession}
            className="
              w-full flex items-center justify-start gap-1.5 rounded-full
              bg-zinc-200 text-zinc-700 text-[13px]
              hover:bg-zinc-300 active:scale-95
              transition-all duration-200
              px-3 py-2
            "
          >
            <Plus size={14} className="text-zinc-600 shrink-0" strokeWidth={2.5} />
            <span className="font-medium whitespace-nowrap animate-fade-in">
              发起新对话
            </span>
          </button>
        </div>

        {/* History list */}
        <div className="flex-1 overflow-y-auto px-1 custom-scrollbar">
          {isSidebarOpen && (
            <div className="text-[13px] font-semibold text-zinc-400 mb-3 px-3 mt-2 animate-fade-in">
              历史记录
            </div>
          )}
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
                  {isSidebarOpen && (
                    <span
                      className="flex-1 text-[14px] tracking-tight truncate animate-fade-in"
                      onClick={() => session.id !== undefined && selectSession(session.id)}
                    >
                      {session.title || '新对话'}
                    </span>
                  )}
                  {isSidebarOpen && isHovered && session.id !== undefined && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSession(session.id!)
                      }}
                      className="shrink-0 p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      title="删除对话"
                    >
                      <Trash2 size={14} strokeWidth={2} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
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
          {isSidebarOpen && (
            <span className="text-[14px] font-medium animate-fade-in">API 配置</span>
          )}
        </button>
      </div>
    </aside>
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
    </>
  )
}
