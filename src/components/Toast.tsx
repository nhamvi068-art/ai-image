import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertCircle, CheckCircle2, X } from 'lucide-react'

export type ToastType = 'error' | 'success'

interface ToastProps {
  message: string
  type: ToastType
  onDismiss: () => void
}

function Toast({ message, type, onDismiss }: ToastProps) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(onDismiss, 300)
    }, 4000)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [message])

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
    setTimeout(onDismiss, 300)
  }

  const isError = type === 'error'

  return createPortal(
    <div
      className={`
        fixed bottom-28 left-1/2 -translate-x-1/2 z-[300]
        flex items-center gap-3 px-4 py-3 rounded-2xl
        text-sm font-medium shadow-xl
        transition-all duration-300
        ${isError
          ? 'bg-red-50 text-red-700 border border-red-200'
          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
        }
        ${visible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-3 pointer-events-none'
        }
      `}
    >
      {isError
        ? <AlertCircle size={18} className="shrink-0 text-red-500" />
        : <CheckCircle2 size={18} className="shrink-0 text-emerald-500" />
      }
      <span className="max-w-sm">{message}</span>
      <button
        onClick={handleClose}
        className={`shrink-0 p-0.5 rounded-lg hover:bg-black/5 transition-colors ${isError ? 'text-red-400' : 'text-emerald-400'}`}
      >
        <X size={14} />
      </button>
    </div>,
    document.body
  )
}

export default Toast
