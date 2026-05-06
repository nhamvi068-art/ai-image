import { create } from 'zustand'
import { addMessage, listMessages, listSessions, createSession, deleteSession, deleteMessages, type Session, type Message } from '../db/db'
import { resolveModelAdapter, AVAILABLE_MODELS } from '../services/ai/ModelRegistry'

// ─── Theme helpers ─────────────────────────────────────────────────────────────

function applyDarkMode(isDark: boolean) {
  if (isDark) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

function loadThemePreference(): boolean {
  try {
    const stored = localStorage.getItem('theme')
    if (stored !== null) return stored === 'dark'
  } catch {}
  return true // default to dark
}

// ─── Store shape ────────────────────────────────────────────────────────────────

interface ChatStore {
  // ── State ───────────────────────────────────────────────────────────────────
  sessions: Session[]
  currentSessionId: number | null
  messages: Message[]
  selectedModelId: string
  isLoading: boolean
  isSessionLoading: boolean
  isCreatingSession: boolean
  isSidebarOpen: boolean
  isDarkMode: boolean

  // ── Toast ────────────────────────────────────────────────────────────────────
  toastMessage: string
  toastType: 'error' | 'success'

  // ── Generation settings ─────────────────────────────────────────────────────
  activeRatio: string
  imageCount: number

  // ── Edit-prompt state ────────────────────────────────────────────────────────
  editPromptText: string | null
  editReferenceImages: string[]
  editRatio: string | null

  // ── Generation phase ─────────────────────────────────────────────────────────
  generationPhase: 'idle' | 'waiting' | 'generating'

  // ── UI actions ──────────────────────────────────────────────────────────────
  toggleSidebar: () => void
  toggleTheme: () => void
  showToast: (message: string, type?: 'error' | 'success') => void
  dismissToast: () => void

  // ── Session actions ─────────────────────────────────────────────────────────
  loadSessions: () => Promise<void>
  startNewSession: () => Promise<void>
  selectSession: (id: number) => Promise<void>
  removeSession: (id: number) => Promise<void>

  // ── Core message action ────────────────────────────────────────────────────
  sendMessageWithImage: (prompt: string, referenceImages: string[]) => Promise<void>

  // ── Model selection ─────────────────────────────────────────────────────────
  setSelectedModel: (modelId: string) => void

  // ── Generation settings actions ────────────────────────────────────────────
  setActiveRatio: (ratio: string) => void
  setImageCount: (count: number) => void
  editPrompt: (prompt: string, opts?: { referenceImages?: string[]; ratio?: string }) => void
  setEditReferenceImages: (images: string[]) => void
  setEditRatio: (ratio: string) => void
  clearEditPrompt: () => void
  deleteGenerationBatch: (userMsgId: number, assistantMsgId: number) => Promise<void>
}

// ─── Store ─────────────────────────────────────────────────────────────────────

export const useChatStore = create<ChatStore>((set, get) => {
  const initialDark = loadThemePreference()
  applyDarkMode(initialDark)

  return {
    // ── Initial state ──────────────────────────────────────────────────────────
    sessions: [],
    currentSessionId: null,
    messages: [],
    selectedModelId: AVAILABLE_MODELS[0].id,
    isLoading: false,
    isSessionLoading: false,
    isCreatingSession: false,
    isSidebarOpen: true,
    isDarkMode: initialDark,

    // ── Toast defaults ─────────────────────────────────────────────────────────
    toastMessage: '',
    toastType: 'error',

    // ── Generation settings defaults ─────────────────────────────────────────
    activeRatio: '3:4',
    imageCount: 1,

    // ── Edit-prompt state defaults ──────────────────────────────────────────────
    editPromptText: null,
    editReferenceImages: [],
    editRatio: null,

    // ── Generation phase defaults ───────────────────────────────────────────────
    generationPhase: 'idle',

    // ── UI actions ─────────────────────────────────────────────────────────────

    toggleSidebar: () => set((_state) => ({ isSidebarOpen: !_state.isSidebarOpen })),

    toggleTheme: () => {
      const next = !get().isDarkMode
      applyDarkMode(next)
      try { localStorage.setItem('theme', next ? 'dark' : 'light') } catch {}
      set({ isDarkMode: next })
    },

    showToast: (message: string, type: 'error' | 'success' = 'error') => {
      set({ toastMessage: message, toastType: type })
    },

    dismissToast: () => {
      set({ toastMessage: '', toastType: 'error' })
    },

    // ── Session actions ─────────────────────────────────────────────────────────

    loadSessions: async () => {
      const sessions = await listSessions()
      set({ sessions })
    },

    startNewSession: async () => {
      if (get().isCreatingSession) return
      set({ isCreatingSession: true })
      try {
        const id = await createSession()
        const sessions = await listSessions()
        set({ sessions, currentSessionId: id, messages: [], isCreatingSession: false })
      } catch (err) {
        console.error('[ChatStore] startNewSession failed:', err)
        set({ isCreatingSession: false })
        get().showToast('创建会话失败', 'error')
      }
    },

    selectSession: async (id: number) => {
      set({ isSessionLoading: true })
      const messages = await listMessages(id)
      set({ currentSessionId: id, messages, isSessionLoading: false, editPromptText: null, editReferenceImages: [], editRatio: null })
    },

    removeSession: async (id: number) => {
      await deleteSession(id)
      const sessions = await listSessions()
      const { currentSessionId } = get()

      if (currentSessionId === id) {
        const next = sessions[0] ?? null
        set({ sessions, currentSessionId: next?.id ?? null })
        if (next && next.id != null) {
          const msgs = await listMessages(next.id)
          set({ messages: msgs })
        } else {
          set({ messages: [] })
        }
      } else {
        set({ sessions })
      }
    },

    // ── Core message action ────────────────────────────────────────────────────

    sendMessageWithImage: async (prompt: string, referenceImages: string[]) => {
      const { currentSessionId, selectedModelId, imageCount } = get()
      let sessionId: number | null = currentSessionId
      const currentRatio = get().activeRatio

      try {
        if (!sessionId) {
          sessionId = await createSession(prompt.slice(0, 40))
          const sessions = await listSessions()
          set({ sessions, currentSessionId: sessionId })
        }

        const userMsgId = await addMessage({
          sessionId,
          role: 'user',
          type: 'text',
          content: prompt,
          modelId: null,
          referenceImages,
          ratio: get().activeRatio,
          createdAt: new Date(),
        })

        const userMsg: Message = {
          id: userMsgId,
          sessionId,
          role: 'user',
          type: 'text',
          content: prompt,
          modelId: null,
          referenceImages,
          ratio: get().activeRatio,
          createdAt: new Date(),
        }
        set((_state) => ({ messages: [..._state.messages, userMsg], isLoading: true, generationPhase: 'waiting' }))

        const adapter = resolveModelAdapter(selectedModelId)
        const imageUrls = referenceImages.length > 0 ? referenceImages : undefined

        set({ generationPhase: 'generating' })

        // Concurrent generation of N images — use allSettled so partial success is preserved
        const generatePromises = Array.from({ length: imageCount }, () =>
          adapter.generate({ prompt, ratio: currentRatio, imageUrls })
        )
        const settled = await Promise.allSettled(generatePromises)
        const blobs: Blob[] = []
        const failedErrors: string[] = []
        for (const result of settled) {
          if (result.status === 'fulfilled') {
            blobs.push(result.value.blob)
          } else {
            const msg = result.reason instanceof Error ? result.reason.message : String(result.reason)
            failedErrors.push(msg)
            console.error('[ChatStore] One image generation failed:', msg)
          }
        }

        // If no image succeeded, show error message
        if (blobs.length === 0) {
          const errorMessage = failedErrors.length > 0 ? failedErrors[0] : '生成失败'
          set({ isLoading: false, generationPhase: 'idle' })
          try {
            const errorMsgId = await addMessage({
              sessionId,
              role: 'assistant',
              type: 'text',
              content: `生成失败: ${errorMessage}`,
              modelId: selectedModelId,
              referenceImages: [],
              ratio: currentRatio,
              createdAt: new Date(),
            })
            set((_state) => ({
              messages: [..._state.messages, {
                id: errorMsgId,
                sessionId,
                role: 'assistant',
                type: 'text',
                content: `生成失败: ${errorMessage}`,
                modelId: selectedModelId,
                referenceImages: [],
                ratio: currentRatio,
                createdAt: new Date(),
              } as Message],
            }))
          } catch (dbErr) {
            console.error('[ChatStore] Failed to save error message to DB:', dbErr)
            set((_state) => ({
              messages: [..._state.messages, {
                id: Date.now(),
                sessionId,
                role: 'assistant',
                type: 'text',
                content: `生成失败: ${errorMessage}`,
                modelId: selectedModelId,
                referenceImages: [],
                ratio: currentRatio,
                createdAt: new Date(),
              } as Message],
            }))
          }
          const sessions = await listSessions()
          set({ sessions })
          return
        }

        const assistantMsgId = await addMessage({
          sessionId,
          role: 'assistant',
          type: 'image',
          content: blobs.length === 1 ? blobs[0] : blobs,
          modelId: selectedModelId,
          referenceImages: [],
          ratio: currentRatio,
          createdAt: new Date(),
        })

        const assistantMsg: Message = {
          id: assistantMsgId,
          sessionId,
          role: 'assistant',
          type: 'image',
          content: blobs.length === 1 ? blobs[0] : blobs,
          modelId: selectedModelId,
          referenceImages: [],
          ratio: currentRatio,
          createdAt: new Date(),
        }

        set((_state) => ({ messages: [..._state.messages, assistantMsg], isLoading: false, generationPhase: 'idle' }))
        const sessions = await listSessions()
        set({ sessions })
      } catch (err) {
        console.error('[ChatStore] Image generation failed:', err)
        set({ isLoading: false, generationPhase: 'idle' })
        const errorMessage = err instanceof Error ? err.message : String(err)
        if (sessionId != null) {
          try {
            const errorMsgId = await addMessage({
              sessionId,
              role: 'assistant',
              type: 'text',
              content: `生成失败: ${errorMessage}`,
              modelId: selectedModelId,
              referenceImages: [],
              ratio: currentRatio,
              createdAt: new Date(),
            })
            set((_state) => ({
              messages: [..._state.messages, {
                id: errorMsgId,
                sessionId,
                role: 'assistant',
                type: 'text',
                content: `生成失败: ${errorMessage}`,
                modelId: selectedModelId,
                referenceImages: [],
                ratio: currentRatio,
                createdAt: new Date(),
              } as Message],
            }))
          } catch (dbErr) {
            console.error('[ChatStore] Failed to save error message to DB:', dbErr)
            set((_state) => ({
              messages: [..._state.messages, {
                id: Date.now(),
                sessionId,
                role: 'assistant',
                type: 'text',
                content: `生成失败: ${errorMessage}`,
                modelId: selectedModelId,
                referenceImages: [],
                ratio: currentRatio,
                createdAt: new Date(),
              } as Message],
            }))
          }
        }
        try {
          const sessions = await listSessions()
          set({ sessions })
        } catch {
          // Ignore
        }
      }
    },

    // ── Model selection ─────────────────────────────────────────────────────────

    setSelectedModel: (modelId: string) => set({ selectedModelId: modelId }),

    // ── Generation settings actions ────────────────────────────────────────────

    setActiveRatio: (ratio: string) => {
      set({ activeRatio: ratio })
    },
    setImageCount: (count: number) => set({ imageCount: count }),
    editPrompt: (prompt: string, opts?: { referenceImages?: string[]; ratio?: string }) =>
      set({ editPromptText: prompt, editReferenceImages: opts?.referenceImages ?? [], editRatio: opts?.ratio ?? null }),
    setEditReferenceImages: (images: string[]) => set({ editReferenceImages: images }),
    setEditRatio: (ratio: string) => set({ editRatio: ratio }),
    clearEditPrompt: () => set({ editPromptText: null, editReferenceImages: [], editRatio: null }),

    deleteGenerationBatch: async (userMsgId: number, assistantMsgId: number) => {
      await deleteMessages([userMsgId, assistantMsgId])
      set((_state) => ({
        messages: _state.messages.filter(
          (m) => m.id !== userMsgId && m.id !== assistantMsgId
        ),
      }))
    },
  }
})
