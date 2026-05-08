import { useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageLightboxProps {
  src: string | null
  images?: string[]
  currentIndex?: number
  onClose: () => void
  onNavigate?: (index: number) => void
}

export default function ImageLightbox({
  src,
  images = [],
  currentIndex = 0,
  onClose,
  onNavigate,
}: ImageLightboxProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && images.length > 1) {
        const prev = (currentIndex - 1 + images.length) % images.length
        onNavigate?.(prev)
      }
      if (e.key === 'ArrowRight' && images.length > 1) {
        const next = (currentIndex + 1) % images.length
        onNavigate?.(next)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [currentIndex, images.length, onClose, onNavigate])

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      const res = await fetch(src ?? '')
      const blob = await res.blob()
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      await navigator.clipboard.writeText(src ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (!src) return null

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 animate-fade-in"
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
      >
        <X size={20} />
      </button>

      {/* Copy */}
      <button
        onClick={handleCopy}
        className="absolute top-4 right-16 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        title="复制图片"
      >
        {copied ? '已复制' : '复制'}
      </button>

      {/* Prev */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            const prev = (currentIndex - 1 + images.length) % images.length
            onNavigate?.(prev)
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Next */}
      {images.length > 1 && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            const next = (currentIndex + 1) % images.length
            onNavigate?.(next)
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
        >
          <ChevronRight size={24} />
        </button>
      )}

      <img
        src={src}
        className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
        alt="放大预览"
        onClick={(e) => e.stopPropagation()}
      />

      {images.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
          {currentIndex + 1} / {images.length}
        </div>
      )}
    </div>
  )
}
