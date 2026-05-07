import React, { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useChatStore } from '../store/chatStore'
import { AVAILABLE_MODELS } from '../services/ai/ModelRegistry'
import {
  Plus,
  ArrowUp,
  ChevronDown,
  MoreVertical,
  Check,
  X,
} from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────────

const RATIO_CATEGORIES = [
  {
    label: '方形',
    items: [
      { id: '1:1', label: '1:1', desc: '1024×1024' },
    ],
  },
  {
    label: '竖向',
    items: [
      { id: '3:4', label: '3:4', desc: '768×1024' },
      { id: '4:5', label: '4:5', desc: '819×1024' },
      { id: '9:16', label: '9:16', desc: '576×1024' },
    ],
  },
  {
    label: '横向',
    items: [
      { id: '16:9', label: '16:9', desc: '1024×576' },
      { id: '4:3', label: '4:3', desc: '1024×768' },
      { id: '5:4', label: '5:4', desc: '1024×819' },
    ],
  },
  {
    label: '宽幅',
    items: [
      { id: '21:9', label: '21:9', desc: '1280×534' },
    ],
  },
]

// ─── Ratio icon ────────────────────────────────────────────────────────────────

function RatioIcon({ id, active }: { id: string; active: boolean }) {
  const map: Record<string, { bw: number; bh: number }> = {
    '1:1': { bw: 10, bh: 10 },
    '16:9': { bw: 16, bh: 9 },
    '4:3': { bw: 4, bh: 3 },
    '3:4': { bw: 3, bh: 4 },
    '9:16': { bw: 9, bh: 16 },
    '4:5': { bw: 4, bh: 5 },
    '5:4': { bw: 5, bh: 4 },
    '21:9': { bw: 21, bh: 9 },
  }
  const { bw, bh } = map[id] ?? { bw: 10, bh: 10 }
  const maxSide = 16
  const scale = maxSide / Math.max(bw, bh)
  const w = Math.round(bw * scale)
  const h = Math.round(bh * scale)
  const color = active ? '#18181b' : '#a1a1aa'

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${bw} ${bh}`}
      style={{ flexShrink: 0 }}
    >
      <rect width={bw} height={bh} rx={1} fill={color} />
    </svg>
  )
}

// ─── Floating Input Bar ──────────────────────────────────────────────────────────

export default function InputBar() {
  const [isFocused, setIsFocused] = useState(false)
  const [showRatioMenu, setShowRatioMenu] = useState(false)
  const [showModelMenu, setShowModelMenu] = useState(false)
  const [showCountMenu, setShowCountMenu] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [modelMenuPos, setModelMenuPos] = useState({ top: 0, left: 0 })
  const [ratioMenuPos, setRatioMenuPos] = useState({ top: 0, left: 0 })
  const [countMenuPos, setCountMenuPos] = useState({ top: 0, left: 0 })
  const modelBtnRef = useRef<HTMLButtonElement>(null)
  const ratioBtnRef = useRef<HTMLButtonElement>(null)
  const countBtnRef = useRef<HTMLButtonElement>(null)
  const [promptText, setPromptText] = useState('')
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const {
    sendMessageWithImage,
    isLoading,
    activeRatio,
    setActiveRatio,
    imageCount,
    setImageCount,
    selectedModelId,
    setSelectedModel,
    editPromptText,
    editReferenceImages,
    editRatio,
    clearEditPrompt,
  } = useChatStore()

  useEffect(() => {
    if (editPromptText !== null) {
      setPromptText(editPromptText)
      if (editReferenceImages.length > 0) setReferenceImages(editReferenceImages)
      if (editRatio) setActiveRatio(editRatio)
      clearEditPrompt()
      textareaRef.current?.focus()
    }
  }, [editPromptText, editReferenceImages, editRatio])

  const selectedModel = AVAILABLE_MODELS.find(m => m.id === selectedModelId)

  // Paste and drag-over handlers
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as ClipboardEvent
      const items = ce.clipboardData?.items
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            e.preventDefault()
            const file = item.getAsFile()
            if (file) readAndAddImage(file)
          }
        }
      }
    }
    textareaRef.current?.addEventListener('paste', handler)
    return () => textareaRef.current?.removeEventListener('paste', handler)
  }, [])

  // #region debug logs
  const dbg = (label: string, data?: unknown) => {
    console.log(`[DBG InputBar] ${label}`, data);
    fetch('http://127.0.0.1:7252/ingest/f0ec8a8c-1b3f-43cf-b3aa-e816736c30f5', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '9fecf5' },
      body: JSON.stringify({ sessionId: '9fecf5', location: 'InputBar.tsx', message: label, data, timestamp: Date.now() })
    }).catch(() => {});
  };
  // #endregion

  // #region debug render logs
  useEffect(() => { dbg('modelMenu render', { showModelMenu }); }, [showModelMenu]);
  useEffect(() => { dbg('ratioMenu render', { showRatioMenu }); }, [showRatioMenu]);
  useEffect(() => { dbg('countMenu render', { showCountMenu }); }, [showCountMenu]);
  // #endregion

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const inModel = target.closest('[data-dropdown="model"]') !== null;
      const inRatio = target.closest('[data-dropdown="ratio"]') !== null;
      const inCount = target.closest('[data-dropdown="count"]') !== null;
      dbg('doc mousedown', { tag: target.tagName, inModel, inRatio, inCount, xy: `${e.clientX},${e.clientY}` });
      if (!inModel) { dbg('close model menu'); setShowModelMenu(false); }
      if (!inRatio) { dbg('close ratio menu'); setShowRatioMenu(false); }
      if (!inCount) { dbg('close count menu'); setShowCountMenu(false); }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPromptText(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const readAndAddImage = (file: File) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string
      setReferenceImages(prev => [...prev, dataUrl])
    }
    reader.readAsDataURL(file)
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(readAndAddImage)
    if (imageInputRef.current) imageInputRef.current.value = ''
  }

  const handleSubmit = () => {
    const trimmed = promptText.trim()
    if (!trimmed || isLoading) return
    // Fire and forget — clear UI immediately, let generation run async
    sendMessageWithImage(trimmed, referenceImages)
    setPromptText('')
    setReferenceImages([])
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const removeReferenceImage = (index: number) =>
    setReferenceImages(prev => prev.filter((_, i) => i !== index))

  return (
    <div className="absolute bottom-0 w-full flex justify-center pb-6 md:pb-8 pt-20 px-4 md:px-8 pointer-events-none z-20">
      <div className="w-full max-w-3xl mx-0 md:mx-auto pointer-events-auto" style={{ transform: window.innerWidth >= 768 ? 'translateX(26px)' : 'none' }}>

        {/* Layered rounded input card */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))
            files.forEach(readAndAddImage)
          }}
          className={`
            relative bg-white rounded-[28px] p-4 md:px-6 md:py-5
            transition-all duration-300 ease-out
            p-3 md:p-4 xl:p-5
            ${isDragOver ? 'ring-2 ring-zinc-400 ring-offset-2 bg-zinc-50' : ''}
            ${isFocused || promptText.length > 0 || referenceImages.length > 0
              ? 'shadow-[0_4px_16px_rgba(0,0,0,0.08),0_1px_3px_rgba(0,0,0,0.05)]'
              : 'shadow-[0_2px_8px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03)]'
            }
          `}
        >
          {/* Reference image preview */}
          {referenceImages.length > 0 && (
            <div className="mb-3 flex items-center gap-2 flex-wrap">
              {referenceImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={img}
                    className="w-10 h-10 rounded-xl object-cover border border-zinc-200 shadow-sm"
                    alt="参考图"
                  />
                  <button
                    onClick={() => removeReferenceImage(idx)}
                    className="
                      absolute -top-1.5 -right-1.5 w-5 h-5 bg-zinc-800 rounded-full
                      flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100
                      transition-opacity
                    "
                  >
                    <X size={10} className="text-white" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Top row: textarea + more options */}
          <div className="flex items-start gap-2 mb-4">
            <textarea
              ref={textareaRef}
              value={promptText}
              onChange={handleInput}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onKeyDown={handleKeyDown}
              placeholder="今天你想创作什么"
              disabled={isLoading}
              className="
                flex-1 max-h-30 min-h-[28px] bg-transparent border-none outline-none resize-none
                text-zinc-800 text-base md:text-lg placeholder-zinc-400
                font-medium leading-relaxed
                disabled:cursor-not-allowed disabled:opacity-50
              "
              rows={1}
            />
            <button className="hidden md:block text-zinc-400 hover:text-zinc-600 p-1 transition-colors flex-shrink-0">
              <MoreVertical size={20} strokeWidth={2.5} />
            </button>
          </div>

          {/* Bottom row: toolbar + send */}
          <div className="flex items-center justify-between flex-wrap gap-3">

            {/* Left config */}
            <div className="flex items-center gap-3 md:gap-4">
              <button
                onClick={() => imageInputRef.current?.click()}
                className="group transition-colors p-1.5 rounded-full hover:bg-zinc-100"
                title="上传参考图"
              >
                <Plus size={18} strokeWidth={2.5} className="text-zinc-400 group-hover:text-zinc-700 transition-colors" />
              </button>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
              />

              <div className="w-px h-4 bg-zinc-200 mx-1"></div>

              {/* Model selector pill */}
              <div className="relative" data-dropdown="model">
                <button
                  ref={modelBtnRef}
                  onClick={() => {
                    if (modelBtnRef.current) {
                      const rect = modelBtnRef.current.getBoundingClientRect();
                      setModelMenuPos({ top: rect.top, left: rect.left });
                    }
                    setShowModelMenu(v => !v);
                  }}
                  className="flex items-center gap-1.5 text-zinc-600 hover:text-zinc-900 font-medium text-[15px] transition-colors rounded-full px-2.5 py-1.5 hover:bg-zinc-100"
                >
                  {selectedModel?.logo && (
                    <img
                      src={selectedModel.logo}
                      alt=""
                      className="w-4 h-4 rounded object-contain shrink-0"
                    />
                  )}
                  <span>{selectedModel?.name ?? '选择模型'}</span>
                  <ChevronDown size={14} className="text-zinc-400" />
                </button>

                {showModelMenu && createPortal(
                  <div
                    data-dropdown="model"
                    style={{ position: 'fixed', top: modelMenuPos.top - 8, left: modelMenuPos.left, transform: 'translateY(-100%)' }}
                    className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] border border-zinc-100 z-[9999] min-w-[200px] animate-fade-in overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-zinc-100">
                      <span className="text-[12px] text-zinc-400 font-medium">模型</span>
                    </div>
                    <div className="p-1.5">
                      {AVAILABLE_MODELS.map((model, index) => {
                        const prevKey = index > 0 ? AVAILABLE_MODELS[index - 1].adapterKey : null
                        return (
                          <React.Fragment key={model.id}>
                            {prevKey !== null && prevKey !== model.adapterKey && (
                              <div className="h-px bg-zinc-100 my-1" />
                            )}
                            <button
                              onClick={() => {
                                setSelectedModel(model.id)
                                setShowModelMenu(false)
                              }}
                              className={`
                                w-full text-left px-2 py-1.5 rounded-lg transition-colors flex items-center justify-between gap-2
                                ${selectedModelId === model.id
                                  ? 'bg-zinc-100'
                                  : 'hover:bg-zinc-50'
                                }
                              `}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                {model.logo && (
                                  <img
                                    src={model.logo}
                                    alt=""
                                    className="w-5 h-5 rounded object-contain shrink-0"
                                  />
                                )}
                                <span className="text-[13px] font-semibold text-zinc-500 truncate">
                                  {model.name}
                                </span>
                              </div>
                              {selectedModelId === model.id && (
                                <Check size={13} className="text-zinc-400 shrink-0" strokeWidth={3} />
                              )}
                            </button>
                          </React.Fragment>
                        )
                      })}
                    </div>
                  </div>,
                  document.body
                )}
              </div>

            </div>

            {/* Right config + send */}
            <div className="flex items-center gap-3 md:gap-4">

              {/* Ratio selector */}
              <div className="relative" data-dropdown="ratio">
                <button
                  ref={ratioBtnRef}
                  onClick={() => {
                    if (ratioBtnRef.current) {
                      const rect = ratioBtnRef.current.getBoundingClientRect();
                      setRatioMenuPos({ top: rect.top, left: rect.left });
                    }
                    setShowRatioMenu(!showRatioMenu);
                  }}
                  className="flex items-center gap-1 text-zinc-500 hover:text-zinc-800 text-[14px] font-medium transition-colors rounded-full px-2.5 py-1.5 hover:bg-zinc-100"
                >
                  {activeRatio} <ChevronDown size={14} className="text-zinc-400" />
                </button>

                {showRatioMenu && createPortal(
                  <div
                    data-dropdown="ratio"
                    style={{ position: 'fixed', top: ratioMenuPos.top - 8, left: ratioMenuPos.left, transform: 'translateY(-100%)' }}
                    className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] border border-zinc-100 z-[9999] min-w-[200px] animate-fade-in overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-zinc-100">
                      <span className="text-[12px] text-zinc-400 font-medium">比例</span>
                    </div>
                    <div className="p-1.5">
                      {RATIO_CATEGORIES.map((cat, ci) => (
                        <React.Fragment key={cat.label}>
                          {ci > 0 && <div className="h-px bg-zinc-100 my-1" />}
                          <div className="px-2 py-1">
                            <span className="text-[10px] text-zinc-300 font-semibold uppercase tracking-wider">
                              {cat.label}
                            </span>
                          </div>
                          {cat.items.map(ratio => (
                            <button
                              key={ratio.id}
                              onClick={() => {
                                setActiveRatio(ratio.id)
                                setShowRatioMenu(false)
                              }}
                              className={`
                                w-full text-left px-2 py-1.5 rounded-lg transition-colors flex items-center justify-between
                                ${activeRatio === ratio.id
                                  ? 'bg-zinc-100'
                                  : 'hover:bg-zinc-50'
                                }
                              `}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 flex items-center justify-center">
                                  <RatioIcon id={ratio.id} active={activeRatio === ratio.id} />
                                </div>
                                <span className={`
                                  text-[13px] font-semibold
                                  ${activeRatio === ratio.id ? 'text-zinc-900' : 'text-zinc-700'}
                                `}>
                                  {ratio.label}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={`
                                  text-[11px]
                                  ${activeRatio === ratio.id ? 'text-zinc-500' : 'text-zinc-300'}
                                `}>
                                  {ratio.desc}
                                </span>
                                {activeRatio === ratio.id && (
                                  <Check size={13} className="text-zinc-900 shrink-0" strokeWidth={3} />
                                )}
                              </div>
                            </button>
                          ))}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>,
                  document.body
                )}
              </div>

              {/* Image count selector */}
              <div className="relative" data-dropdown="count">
                <button
                  ref={countBtnRef}
                  onClick={() => {
                    if (countBtnRef.current) {
                      const rect = countBtnRef.current.getBoundingClientRect();
                      setCountMenuPos({ top: rect.top, left: rect.left });
                    }
                    setShowCountMenu(v => !v);
                  }}
                  className="flex items-center gap-1 text-zinc-500 hover:text-zinc-800 text-[14px] font-medium transition-colors rounded-full px-2.5 py-1.5 hover:bg-zinc-100"
                >
                  {imageCount}张 <ChevronDown size={14} className="text-zinc-400" />
                </button>

                {showCountMenu && createPortal(
                  <div
                    data-dropdown="count"
                    style={{ position: 'fixed', top: countMenuPos.top - 8, left: countMenuPos.left, transform: 'translateY(-100%)' }}
                    className="bg-white rounded-2xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] border border-zinc-100 z-[9999] min-w-[140px] animate-fade-in overflow-hidden"
                  >
                    <div className="px-3 py-2 border-b border-zinc-100">
                      <span className="text-[12px] text-zinc-400 font-medium">生成数量</span>
                    </div>
                    <div className="p-1.5 grid grid-cols-2 gap-1">
                      {[1, 2, 3, 4].map(n => (
                        <button
                          key={n}
                          onClick={() => {
                            setImageCount(n)
                            setShowCountMenu(false)
                          }}
                          className={`
                            px-3 py-2 rounded-xl text-[13px] font-semibold transition-colors
                            ${imageCount === n
                              ? 'bg-zinc-900 text-white'
                              : 'text-zinc-600 hover:bg-zinc-50'
                            }
                          `}
                        >
                          {n}张
                        </button>
                      ))}
                    </div>
                  </div>,
                  document.body
                )}
              </div>

              {/* Send button */}
              <button
                onClick={handleSubmit}
                disabled={!promptText.trim() || isLoading}
                className={`
                  w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center
                  transition-all duration-300 ml-1 flex-shrink-0
                  ${promptText.trim() && !isLoading
                    ? 'bg-zinc-900 text-white hover:scale-105 shadow-md'
                    : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
                  }
                `}
                aria-label="发送"
              >
                <ArrowUp size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
