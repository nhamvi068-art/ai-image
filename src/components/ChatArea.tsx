import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { useChatStore } from '../store/chatStore'
import { AVAILABLE_MODELS } from '../services/ai/ModelRegistry'
import { Edit3, MoreHorizontal, Loader2, Copy, Check, Trash2, RefreshCw } from 'lucide-react'

// ─── Date Divider ───────────────────────────────────────────────────────────────

function DateDivider({ date }: { date: string }) {
  return (
    <div className="flex items-center justify-center py-8">
      <span className="
        px-4 py-1.5 rounded-full text-xs font-medium tracking-wider
        text-zinc-400
        bg-zinc-50/80
        border border-zinc-100/50
        backdrop-blur-sm
      ">
        {date}
      </span>
    </div>
  )
}

// ─── Image Lightbox ─────────────────────────────────────────────────────────────

function ImageLightbox({ src, onClose }: { src: string | null; onClose: () => void }) {
  if (!src) return null
  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-8 cursor-zoom-out animate-fade-in"
      onClick={onClose}
    >
      <img
        src={src}
        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
        alt="放大预览"
      />
    </div>
  )
}

// ─── Image Item (auto-detects landscape vs portrait) ───────────────────────────

function CopyableImage({ src, alt, onZoom, className, onImageLoad, showCopyButton = false }: {
  src: string; alt: string; onZoom?: (src: string) => void; className?: string; onImageLoad?: (e: React.SyntheticEvent<HTMLImageElement>) => void; showCopyButton?: boolean
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(src)
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      await navigator.clipboard.writeText(src)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="relative group">
      <img
        src={src}
        className={`${className} w-full h-auto cursor-zoom-in hover:opacity-90 transition-opacity`}
        onClick={onZoom ? () => onZoom(src) : undefined}
        alt={alt}
        onLoad={onImageLoad}
      />
      {showCopyButton && (
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-black/50 hover:bg-black/70 rounded-lg text-white"
          title="复制图片"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      )}
    </div>
  )
}

function ImageItem({ src, onZoom }: { src: string; onZoom: (src: string) => void }) {
  const [colSpan, setColSpan] = useState(1)
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [isLoaded, setIsLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // IntersectionObserver: defer actual render until the image card is near the viewport.
  // The data URL is already in memory (from listMessages), so this only defers DOM
  // creation and <img> decoding — no network request is saved, but JS main thread is freed.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsLoaded(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' }  // pre-load slightly before the image scrolls into view
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    if (isMobile) return
    const img = e.currentTarget
    if (img.naturalWidth > img.naturalHeight) {
      setColSpan(2)
    } else {
      setColSpan(1)
    }
  }, [isMobile])

  return (
    <div
      ref={containerRef}
      className="overflow-hidden rounded-2xl bg-zinc-100 border border-zinc-100"
      style={{ gridColumn: `span ${colSpan}` }}
    >
      {isLoaded ? (
        <CopyableImage src={src} alt="生成图片" onZoom={onZoom} className="w-full h-auto object-contain rounded-xl" onImageLoad={handleLoad} />
      ) : (
        // Skeleton placeholder — same aspect ratio hint so layout doesn't shift
        <div className="w-full aspect-[3/4] bg-zinc-200 animate-pulse rounded-xl" />
      )}
    </div>
  )
}

// ─── Generation Item ────────────────────────────────────────────────────────────

interface GenerationItemProps {
  userMsgId: number
  assistantMsgId: number
  referenceImages: string[] | string | null | undefined
  promptText: string
  tags: string
  generatedImages: string[]
  errorMessage?: string
  modelId: string | null
  ratio: string
  taskIds?: Record<string, string>
  onZoom: (src: string) => void
  onEdit: (prompt: string, referenceImages: string[], ratio: string) => void
  onDelete: (userMsgId: number, assistantMsgId: number) => void
  onRecover?: (userMsgId: number, assistantMsgId: number, taskId: string) => void
}

function GenerationItem({
  userMsgId,
  assistantMsgId,
  referenceImages,
  promptText,
  tags,
  generatedImages,
  errorMessage,
  ratio,
  taskIds,
  onZoom,
  onEdit,
  onDelete,
  onRecover,
}: GenerationItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const isError = !!errorMessage
  const hasRecoverable = taskIds && Object.keys(taskIds).length > 0
  const [recoveringKey, setRecoveringKey] = useState<string | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  const normalizedImages: string[] = Array.isArray(referenceImages)
    ? referenceImages
    : typeof referenceImages === 'string'
      ? [referenceImages]
      : []

  return (
    <div className="flex flex-col gap-3 pt-8">
      {/* Content Area */}
      <div className="flex flex-col gap-3 min-w-0">
        {/* Prompt Header */}
        <div className="text-[13px] md:text-[14px] text-zinc-800 leading-relaxed flex items-end flex-wrap gap-2">
          {normalizedImages.length > 0 && normalizedImages.map((img, i) => (
            <CopyableImage
              key={i}
              src={img}
              alt="参考图"
              onZoom={onZoom}
              showCopyButton={false}
              className="w-8 h-8 md:w-10 md:h-10 rounded-xl object-cover hover:scale-105 hover:ring-2 hover:ring-zinc-300 transition-all duration-200 shadow-sm shrink-0"
            />
          ))}
          <span>{promptText}</span>
          {!isError && <span className="text-zinc-400 text-[13px]">{tags}</span>}
          {isError && (
            <span className="px-2 py-0.5 text-[12px] font-medium text-red-600 bg-red-50 border border-red-200 rounded-full">
              错误
            </span>
          )}
        </div>

        {/* Error Message */}
        {isError && (
          <div className="flex flex-col gap-2">
            <div className="text-[13px] text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
              {errorMessage}
            </div>
            {hasRecoverable ? (
              <div className="flex flex-wrap gap-2">
                {Object.entries(taskIds!).map(([key, taskId]) => (
                  <button
                    key={key}
                    onClick={() => {
                      setRecoveringKey(key)
                      onRecover?.(userMsgId, assistantMsgId, taskId)
                    }}
                    disabled={recoveringKey !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-[13px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {recoveringKey === key
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <RefreshCw className="w-3.5 h-3.5" />
                    }
                    {recoveringKey === key ? '恢复中...' : `恢复图片 ${key.replace('gen_', '#')}`}
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-zinc-400 italic">
                [taskIds: {JSON.stringify(taskIds)}]
              </div>
            )}
          </div>
        )}

        {/* Generated Images: grid with auto-detected column spans */}
        {generatedImages.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1 md:gap-[3px] mt-1">
            {generatedImages.map((img, idx) => (
              <ImageItem key={idx} src={img} onZoom={onZoom} />
            ))}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => onEdit(promptText, normalizedImages, ratio)}
            className="
              flex items-center gap-1.5 px-3.5 py-1.5
              bg-zinc-100/80 hover:bg-zinc-200/80
              text-zinc-700
              text-[13px] font-medium rounded-xl
              border border-zinc-200/60
              transition-colors
            "
          >
            <Edit3 className="w-3.5 h-3.5" /> 重新编辑
          </button>
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="
                flex items-center justify-center px-2 py-1.5
                bg-zinc-100/80 hover:bg-zinc-200/80
                text-zinc-700 rounded-xl
                border border-zinc-200/60
                transition-colors
              "
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute top-full mt-1 right-0 min-w-[140px] bg-white border border-zinc-200 rounded-xl shadow-lg py-1 z-50 animate-fade-in">
                <button
                  onClick={() => {
                    onDelete(userMsgId, assistantMsgId)
                    setMenuOpen(false)
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> 删除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Chat Area ─────────────────────────────────────────────────────────────────

export default function ChatArea() {
  const { messages, currentSessionId, isLoading, isSessionLoading, activeRatio, imageCount, selectedModelId, generationProgress } = useChatStore()
  const [zoomedImage, setZoomedImage] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Track phase locally — ensures waiting phase is always visible
  const [localPhase, setLocalPhase] = useState<'idle' | 'waiting' | 'generating'>('idle')
  const [elapsedSec, setElapsedSec] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (isLoading) {
      if (localPhase === 'idle') {
        setLocalPhase('waiting')
        startTimeRef.current = Date.now()
        setElapsedSec(0)
        timerRef.current = setInterval(() => {
          if (startTimeRef.current) {
            setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000))
          }
        }, 1000)
        // Switch to generating after a short delay
        setTimeout(() => setLocalPhase('generating'), 300)
      }
    } else {
      setLocalPhase('idle')
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      startTimeRef.current = null
    }
    return () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    }
  }, [isLoading])

  // Auto-scroll to bottom when session finishes loading or messages update
  useEffect(() => {
    if (isSessionLoading) return
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'auto' })
      }
    }, 0)
    return () => clearTimeout(timer)
  }, [isSessionLoading, messages.length])

  // Scroll to top when generation starts (loading skeleton is at the top)
  useEffect(() => {
    if (isLoading) {
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [isLoading])

  const blobUrlsRef = useRef<string[]>([])

  const generationItems = useMemo(() => {
    // Clean up old blob URLs when messages change
    blobUrlsRef.current.forEach(url => URL.revokeObjectURL(url))
    blobUrlsRef.current = []

    const items: GenerationItemProps[] = []
    for (let i = 0; i < messages.length; i += 2) {
      const userMsg = messages[i]
      const assistantMsg = messages[i + 1]

        if (isLoading && i + 2 >= messages.length) break

        if (userMsg?.role === 'user' && userMsg.type === 'text') {
          let generatedUrls: string[] = []
          let tags = ''
          let errorMessage: string | undefined
          let taskIds: Record<string, string> | undefined

          if (assistantMsg?.role === 'assistant' && assistantMsg.type === 'image') {
            // Prefer partial Blob[] from generationProgress (updated per-image),
            // fall back to assistantMsg.content (data URLs or final Blobs)
            const isLiveGeneration = isLoading && i + 2 >= messages.length
            const partialBlobs = isLiveGeneration ? (generationProgress[String(assistantMsg.id)] ?? []) : []
            const content = partialBlobs.length > 0 ? partialBlobs : assistantMsg.content

            if (Array.isArray(content)) {
              // Support Blob[] (live generation), string[] (restored from IndexedDB as data URLs),
              // and (Blob | null)[] (in-progress placeholder with empty slots)
              for (const item of content) {
                if (item === null) continue
                if (typeof item === 'string' && item.startsWith('data:')) {
                  generatedUrls.push(item)
                } else if (item instanceof Blob) {
                  const url = URL.createObjectURL(item)
                  generatedUrls.push(url)
                  blobUrlsRef.current.push(url)
                }
              }
            } else if (typeof content === 'string' && content.startsWith('data:')) {
              // Restored from IndexedDB as a single data URL string
              generatedUrls = [content]
            } else if (content instanceof Blob) {
              const url = URL.createObjectURL(content)
              generatedUrls = [url]
              blobUrlsRef.current.push(url)
            }
            const model = AVAILABLE_MODELS.find(m => m.id === assistantMsg.modelId)
            const ratio = userMsg.ratio ?? '1:1'
            tags = `${model?.name ?? assistantMsg.modelId ?? ''} | ${ratio}`
            taskIds = assistantMsg.taskIds
          } else if (assistantMsg?.role === 'assistant' && assistantMsg.type === 'text') {
            errorMessage = assistantMsg.content as string
            taskIds = assistantMsg.taskIds
          }

          items.push({
            userMsgId: userMsg.id!,
            assistantMsgId: assistantMsg?.id ?? 0,
            referenceImages: userMsg.referenceImages ?? [],
            promptText: userMsg.content as string,
            tags,
            generatedImages: generatedUrls,
            errorMessage,
            modelId: assistantMsg?.modelId ?? null,
            ratio: userMsg.ratio ?? '1:1',
            taskIds,
            onZoom: setZoomedImage,
            onEdit: (prompt: string, refImgs: string[], ratio: string) =>
              useChatStore.getState().editPrompt(prompt, { referenceImages: refImgs, ratio }),
            onDelete: (userMsgId: number, assistantMsgId: number) =>
              useChatStore.getState().deleteGenerationBatch(userMsgId, assistantMsgId),
            onRecover: (userMsgId: number, assistantMsgId: number, taskId: string) =>
              useChatStore.getState().recoverFailedImage(userMsgId, assistantMsgId, taskId),
          })
      }
    }
    return items
  }, [messages, generationProgress])

  const isNewChat = !currentSessionId || (generationItems.length === 0 && !isLoading)
  // lastUserMessage: the most recent user message (last even index when loading, or last element otherwise)
  const lastUserMessage = messages.length > 0
    ? (isLoading && messages.length >= 2 ? messages[messages.length - 2] : messages[messages.length - 1])
    : null

  return (
    <>
      {/* Session switching overlay */}
      {isSessionLoading && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-white/70 backdrop-blur-sm animate-fade-in">
          <div className="flex items-center gap-3 text-zinc-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm font-medium">加载对话中...</span>
          </div>
        </div>
      )}

      {/* Scroll area — full height, skeleton lives inside */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 md:px-12 pt-2 pb-48 custom-scrollbar flex flex-col">
        <div className={`max-w-4xl mx-auto w-full flex-1 animate-fade-in-up ${isNewChat ? 'flex flex-col items-center justify-center' : ''}`}>

          {isNewChat ? (
            <div className="flex flex-col items-center justify-center px-4">
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-zinc-900 mb-4 text-center">
                今天你想创作什么？
              </h1>
              <p className="text-base md:text-lg text-zinc-400 font-medium text-center">
                输入详细描述，或者上传参考图开始
              </p>
            </div>
          ) : (
            <div className="w-full">
              {generationItems.length > 0 && (
                <>
                  <DateDivider date="Today" />
                  {generationItems.map((item, idx) => (
                    <GenerationItem key={idx} {...item} />
                  ))}
                </>
              )}
            </div>
          )}

          {/* Loading skeleton — inside scroll area at top when generating */}
          {isLoading && lastUserMessage?.role === 'user' && lastUserMessage.type === 'text' ? (
            <div className="w-full pt-8">
              <div className="flex flex-col gap-3 min-w-0">
                <div className="text-[14px] text-zinc-800 leading-relaxed flex items-end flex-wrap gap-2">
                  {(() => {
                    const imgs = lastUserMessage.referenceImages
                    const list = Array.isArray(imgs) ? imgs : typeof imgs === 'string' ? [imgs] : []
                    return list.length > 0 && list.map((img, i) => (
                      <CopyableImage
                        key={i}
                        src={img}
                        alt="参考图"
                        onZoom={undefined}
                        showCopyButton={false}
                        className="w-8 h-8 md:w-10 md:h-10 rounded-xl object-cover hover:scale-105 hover:ring-2 hover:ring-zinc-300 transition-all duration-200 shadow-sm shrink-0"
                      />
                    ))
                  })()}
                  <span>{lastUserMessage.content as string}</span>
                  <span className="text-zinc-400 text-[13px]">{AVAILABLE_MODELS.find(m => m.id === selectedModelId)?.name ?? selectedModelId} | {lastUserMessage.ratio}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-1 md:gap-[3px] mt-1">
                  {Array.from({ length: imageCount }).map((_, idx) => {
                    const skeletonRatio = lastUserMessage.ratio ?? activeRatio
                    const aspectClass = (() => {
                      if (skeletonRatio === '16:9' || skeletonRatio === '4:3' || skeletonRatio === '5:4' || skeletonRatio === '21:9') return 'aspect-[16/9]'
                      if (skeletonRatio === '9:16') return 'aspect-[9/16]'
                      if (skeletonRatio === '3:4' || skeletonRatio === '4:5') return 'aspect-[3/4]'
                      return 'aspect-square'
                    })()
                    return (
                      <div
                        key={idx}
                        className="overflow-hidden rounded-2xl bg-zinc-100 border border-zinc-100"
                      >
                        <div className={`relative w-full ${aspectClass}`}>
                          <div className="absolute inset-0 bg-zinc-200 rounded-xl animate-shimmer" />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[11px] text-zinc-400 font-medium">
                              {localPhase === 'waiting'
                                ? '等待中'
                                : `生成中 ${elapsedSec > 0 ? `${elapsedSec}s` : ''}`
                              }
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox src={zoomedImage} onClose={() => setZoomedImage(null)} />
    </>
  )
}
