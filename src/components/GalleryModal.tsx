import { useRef, useCallback, useState } from 'react'
import { useGalleryStore } from '../store/galleryStore'
import { useChatStore } from '../store/chatStore'
import ImageLightbox from './ImageLightbox'
import { X, Upload, Trash2, Star, Copy, Image as ImageIcon, ArrowLeft, RotateCcw } from 'lucide-react'
import { AVAILABLE_MODELS } from '../services/ai/ModelRegistry'

export default function GalleryModal() {
  const {
    isOpen,
    activeTab,
    closeGallery,
    setActiveTab,
    images,
    referenceImages,
    isLoading,
    deleteGalleryImage,
    toggleFavorite,
    addReference,
    deleteReference,
    useAsReference,
  } = useGalleryStore()

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = useState(0)
  const [isDragOver, setIsDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const openLightbox = useCallback((src: string, index: number) => {
    setLightboxSrc(src)
    setLightboxIndex(index)
  }, [])

  const closeLightbox = useCallback(() => {
    setLightboxSrc(null)
  }, [])

  const handleFileSelect = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    fileArray.forEach((file) => {
      if (!file.type.startsWith('image/')) return
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        addReference(dataUrl, file.name)
      }
      reader.readAsDataURL(file)
    })
  }, [addReference])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileSelect(e.dataTransfer.files)
  }, [handleFileSelect])

  const handleCopyPrompt = useCallback(async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      // fallback
    }
  }, [])

  const handleLightboxNavigate = useCallback((index: number) => {
    setLightboxIndex(index)
    const srcs = images.map((i) => i.src)
    setLightboxSrc(srcs[index] ?? null)
  }, [images])

  if (!isOpen) return null

  return (
    <>
      <div className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in-up">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 shrink-0">
            <div className="flex items-center gap-1 bg-zinc-100 rounded-full p-1">
              <button
                onClick={() => setActiveTab('generated')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  activeTab === 'generated'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <ImageIcon size={14} />
                生成图库
                {images.length > 0 && (
                  <span className="bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {images.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('reference')}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  activeTab === 'reference'
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-700'
                }`}
              >
                <ArrowLeft size={14} />
                参考图库
                {referenceImages.length > 0 && (
                  <span className="bg-zinc-200 text-zinc-600 text-[10px] font-bold rounded-full px-1.5 py-0.5">
                    {referenceImages.length}
                  </span>
                )}
              </button>
            </div>
            <button
              onClick={closeGallery}
              className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'generated' ? (
              <>
                {isLoading ? (
                  <div className="flex items-center justify-center py-20 text-zinc-400">
                    <span className="text-sm">加载中...</span>
                  </div>
                ) : images.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-400 gap-3">
                    <ImageIcon size={48} strokeWidth={1} />
                    <p className="text-sm font-medium">还没有生成图片</p>
                    <p className="text-xs">生成的图片会自动保存在这里</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 md:gap-3">
                    {images.map((img, idx) => {
                      const model = AVAILABLE_MODELS.find((m) => m.id === img.modelId)
                      return (
                        <div
                          key={img.id}
                          className="relative group bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-100 cursor-pointer"
                        >
                          <img
                            src={img.src}
                            alt={img.prompt}
                            className="w-full aspect-square object-cover"
                            onClick={() => openLightbox(img.src, idx)}
                          />
                          {/* Overlay */}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                          {/* Prompt */}
                          <div className="absolute bottom-0 left-0 right-0 p-2 translate-y-full group-hover:translate-y-0 transition-transform">
                            <p className="text-white text-[11px] line-clamp-2 leading-relaxed">{img.prompt}</p>
                            <p className="text-white/60 text-[10px] mt-1">
                              {model?.name ?? img.modelId} | {img.ratio}
                            </p>
                          </div>
                          {/* Actions */}
                          <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFavorite(img.id!) }}
                              className={`p-1.5 rounded-lg transition-colors ${
                                img.isFavorite ? 'bg-yellow-400 text-yellow-900' : 'bg-black/40 text-white hover:bg-black/60'
                              }`}
                              title="收藏"
                            >
                              <Star size={12} fill={img.isFavorite ? 'currentColor' : 'none'} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCopyPrompt(img.prompt) }}
                              className="p-1.5 bg-black/40 text-white rounded-lg hover:bg-black/60 transition-colors"
                              title="复制 prompt"
                            >
                              <Copy size={12} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                useChatStore.getState().restoreImageToChat({
                                  src: img.src,
                                  prompt: img.prompt,
                                  modelId: img.modelId,
                                  ratio: img.ratio,
                                  sessionId: img.sessionId,
                                })
                              }}
                              className="p-1.5 bg-black/40 text-white rounded-lg hover:bg-blue-500 transition-colors"
                              title="还原到对话"
                            >
                              <RotateCcw size={12} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteGalleryImage(img.id!) }}
                              className="p-1.5 bg-black/40 text-white rounded-lg hover:bg-red-500 transition-colors"
                              title="删除"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              <>
                {/* Upload zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`mb-6 border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors ${
                    isDragOver
                      ? 'border-zinc-400 bg-zinc-50'
                      : 'border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                  }`}
                >
                  <Upload size={24} className="text-zinc-400" />
                  <p className="text-sm font-medium text-zinc-600">点击或拖拽上传图片</p>
                  <p className="text-xs text-zinc-400">支持多选，JPG / PNG / WebP</p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                  />
                </div>

                {referenceImages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-zinc-400 gap-3">
                    <ArrowLeft size={40} strokeWidth={1} />
                    <p className="text-sm font-medium">还没有参考图</p>
                    <p className="text-xs">上传的参考图会保存在这里</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 md:gap-3">
                    {referenceImages.map((img) => (
                      <div
                        key={img.id}
                        className="relative group bg-zinc-50 rounded-2xl overflow-hidden border border-zinc-100"
                      >
                        <img
                          src={img.src}
                          alt={img.name}
                          className="w-full aspect-square object-cover cursor-pointer"
                          onClick={() => openLightbox(img.src, 0)}
                        />
                        {/* Use as reference button */}
                        <button
                          onClick={() => useAsReference(img.src)}
                          className="absolute bottom-0 left-0 right-0 py-2 bg-black/50 text-white text-[11px] font-medium text-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                        >
                          用作垫图
                        </button>
                        {/* Delete */}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteReference(img.id!) }}
                          className="absolute top-2 right-2 p-1.5 bg-black/40 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
                          title="删除"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Lightbox */}
      <ImageLightbox
        src={lightboxSrc}
        images={activeTab === 'generated' ? images.map((i) => i.src) : referenceImages.map((i) => i.src)}
        currentIndex={lightboxIndex}
        onClose={closeLightbox}
        onNavigate={handleLightboxNavigate}
      />
    </>
  )
}
