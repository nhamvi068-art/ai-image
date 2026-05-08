import { create } from 'zustand'
import { addMessage, listMessages, listSessions, createSession, deleteSession, deleteMessages, addGalleryImage, updateMessage, type Session, type Message } from '../db/db'
import { resolveModelAdapter, resolveModelTier, AVAILABLE_MODELS } from '../services/ai/ModelRegistry'
import { getBaseUrl, getHeaders, fetchTaskDirect, b64JsonToBlob } from '../services/ai/adapterUtils'

// ─── Theme helpers ─────────────────────────────────────────────────────────────

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

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

  // ── Partial generation results (keyed by assistantMsgId) ─────────────────────
  // Used so ChatArea can render each image as it completes, not just at the end
  generationProgress: Record<string, Blob[]>

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

  // ── Recovery ──────────────────────────────────────────────────────────────
  recoverFailedImage: (userMsgId: number, assistantMsgId: number, taskId: string) => Promise<void>

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
  restoreImageToChat: (galleryImage: { src: string; prompt: string; modelId: string | null; ratio: string; sessionId: number }) => Promise<void>
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

    // ── Partial generation results ─────────────────────────────────────────────
    generationProgress: {},

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
        const tier = resolveModelTier(selectedModelId)
        const imageUrls = referenceImages.length > 0 ? referenceImages : undefined

        set({ generationPhase: 'generating' })

        // Track results per image slot
        const blobs: (Blob | null)[] = new Array(imageCount).fill(null)
        const taskIds: (string | null)[] = new Array(imageCount).fill(null)
        const errors: (string | null)[] = new Array(imageCount).fill(null)

        // Place a "pending" assistant message in store only (no IDB yet) so UI can show slots immediately.
        // We will persist it to IndexedDB only once generation is complete — this avoids the bug where
        // a failed/partial generation leaves stale null-content records in IDB.
        let assistantMsgId = -1  // temporary negative ID, never written to IDB during generation
        const assistantMsgPlaceholder: Message = {
          id: assistantMsgId,
          sessionId,
          role: 'assistant',
          type: 'image',
          content: blobs,
          modelId: selectedModelId,
          referenceImages: [],
          ratio: currentRatio,
          createdAt: new Date(),
          taskIds: {},
        }
        set((_state) => ({ messages: [..._state.messages, assistantMsgPlaceholder] }))

        // Function to sync the assistant message into the store (UI only, no DB persistence)
        // Also writes to generationProgress so ChatArea can pick up partial results
        const syncToStore = () => {
          const partialBlobs = blobs.filter(Boolean) as Blob[]
          set((_state) => {
            const idx = _state.messages.findIndex(m => m.id === assistantMsgId)
            const updated = [..._state.messages]
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                content: partialBlobs,
                taskIds: Object.fromEntries(
                  taskIds
                    .map((id, i) => (id !== null ? [`gen_${i}`, id] : null))
                    .filter((e): e is [string, string] => e !== null)
                ),
              }
            }
            return {
              messages: updated,
              generationProgress: {
                ..._state.generationProgress,
                [String(assistantMsgId)]: partialBlobs,
              },
            }
          })
        }

        // Generate images ONE AT A TIME so each result immediately updates the UI
        for (let i = 0; i < imageCount; i++) {
          try {
            const result = await adapter.generate({ prompt, ratio: currentRatio, imageUrls, tier })
            blobs[i] = result.blob
            taskIds[i] = result.taskId
            console.log(`[ChatStore] Image ${i} generated, taskId: ${result.taskId}`)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            errors[i] = msg
            console.error(`[ChatStore] Image ${i} failed:`, msg)
          }

          // Immediately sync partial results to UI (store only, no DB persistence)
          syncToStore()
        }

        const successfulCount = blobs.filter(Boolean).length
        const failedErrors = errors.filter(Boolean) as string[]

        // If no image succeeded at all, replace with an error message
        if (successfulCount === 0) {
          const errorMessage = failedErrors[0] ?? '生成失败'
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
          set((_state) => {
            const idx = _state.messages.findIndex(m => m.id === assistantMsgId)
            const updated = [..._state.messages]
            if (idx !== -1) updated.splice(idx, 1)
            return {
              messages: [...updated, {
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
              isLoading: false,
              generationPhase: 'idle',
            }
          })
          const sessions = await listSessions()
          set({ sessions })
          return
        }

        // Final sync: persist to IndexedDB only now (after all images are done).
        // Writing to IDB only here avoids stale partial-content records when generation fails.
        const blobsToDataUrls = async (blobList: Blob[]): Promise<string[]> => {
          return Promise.all(blobList.map(blob => new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })))
        }
        const dataUrlContent = await blobsToDataUrls(blobs.filter(Boolean) as Blob[])
        const realMsgId = await addMessage({
          sessionId,
          role: 'assistant',
          type: 'image',
          content: dataUrlContent,
          modelId: selectedModelId,
          referenceImages: [],
          ratio: currentRatio,
          createdAt: new Date(),
          taskIds: Object.fromEntries(
            taskIds
              .map((id, i) => (id !== null ? [`gen_${i}`, id] : null))
              .filter((e): e is [string, string] => e !== null)
          ) || undefined,
        })

        set((_state) => {
          // Replace placeholder (negative ID) with the real IDB ID
          const updated = _state.messages.filter(m => m.id !== assistantMsgId)
          const { [String(assistantMsgId)]: _removed, ...restProgress } = _state.generationProgress
          return {
            messages: [...updated, {
              id: realMsgId,
              sessionId,
              role: 'assistant',
              type: 'image',
              content: dataUrlContent,
              modelId: selectedModelId,
              referenceImages: [],
              ratio: currentRatio,
              createdAt: new Date(),
              taskIds: Object.fromEntries(
                taskIds
                  .map((id, i) => (id !== null ? [`gen_${i}`, id] : null))
                  .filter((e): e is [string, string] => e !== null)
              ) || undefined,
            } as Message],
            isLoading: false,
            generationPhase: 'idle',
            generationProgress: restProgress,
          }
        })

        // Auto-save generated images to gallery — non-blocking
        const autoSave = localStorage.getItem('actum_auto_save_gallery')
        if (autoSave !== 'false') {
          const promptText = prompt.slice(0, 500)
          const blobsToSave = blobs.filter(Boolean) as Blob[]
          Promise.allSettled(blobsToSave.map(blob => new Promise<void>((resolve) => {
            const reader = new FileReader()
            reader.onload = async () => {
              const src = reader.result as string
              await addGalleryImage({
                src,
                prompt: promptText,
                modelId: selectedModelId,
                ratio: currentRatio,
                sessionId: sessionId ?? 0,
                isFavorite: false,
                createdAt: new Date(),
              })
              resolve()
            }
            reader.readAsDataURL(blob)
          }))).catch(e => console.warn('[ChatStore] Gallery save error:', e))
        }

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

    restoreImageToChat: async ({ src, prompt, modelId, ratio, sessionId }) => {
      const { currentSessionId } = get()

      // If the original session still exists, use it; otherwise create a new one
      const targetSessionId = sessionId && get().sessions.some(s => s.id === sessionId)
        ? sessionId
        : await createSession(prompt.slice(0, 40))

      const userMsgId = await addMessage({
        sessionId: targetSessionId,
        role: 'user',
        type: 'text',
        content: prompt,
        modelId,
        referenceImages: [],
        ratio: ratio ?? '1:1',
        createdAt: new Date(),
      })

      const assistantMsgId = await addMessage({
        sessionId: targetSessionId,
        role: 'assistant',
        type: 'image',
        content: [src],
        modelId,
        referenceImages: [],
        ratio: ratio ?? '1:1',
        createdAt: new Date(),
        taskIds: undefined,
      })

      // Switch to the session and reload its messages
      const sessions = await listSessions()
      const msgs = await listMessages(targetSessionId)
      set({
        sessions,
        currentSessionId: targetSessionId,
        messages: msgs,
        isLoading: false,
        generationPhase: 'idle',
        isSessionLoading: false,
      })
    },

    // ── Recovery ──────────────────────────────────────────────────────────────

    recoverFailedImage: async (userMsgId: number, assistantMsgId: number, taskId: string) => {
      const { messages, selectedModelId } = get()
      const userMsg = messages.find(m => m.id === userMsgId)
      const assistantMsg = messages.find(m => m.id === assistantMsgId)
      if (!userMsg || !assistantMsg) return

      const ratio = userMsg.ratio ?? get().activeRatio

      try {
        const baseUrl = getBaseUrl()
        const headers = getHeaders()
        const result = await fetchTaskDirect(`${baseUrl}/v1/images/tasks/${taskId}`, headers)

        let blob: Blob
        if (result.b64_json) {
          blob = await b64JsonToBlob(result.b64_json)
        } else if (result.url) {
          const imgRes = await fetch(result.url, { signal: AbortSignal.timeout(30_000) })
          if (!imgRes.ok) throw new Error(`图片获取失败: ${imgRes.status}`)
          blob = await imgRes.blob()
        } else {
          throw new Error('恢复响应中无图像数据')
        }

        const promptText = (userMsg.content as string).slice(0, 500)
        const sessionId = userMsg.sessionId

        await addGalleryImage({
          src: await blobToDataUrl(blob),
          prompt: promptText,
          modelId: selectedModelId,
          ratio,
          sessionId,
          isFavorite: false,
          createdAt: new Date(),
        })

        await updateMessage(assistantMsgId, { taskIds: undefined })

        set((_state) => ({
          messages: _state.messages.map(m =>
            m.id === assistantMsgId
              ? { ...m, type: 'image' as const, content: blob, taskIds: undefined }
              : m
          ),
        }))

        get().showToast('图片恢复成功', 'success')
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        get().showToast(`恢复失败: ${msg}`, 'error')
      }
    },
  }
})
