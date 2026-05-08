import Dexie, { Table } from 'dexie'

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Session {
  id?: number
  title: string
  updatedAt: Date
}

export interface Message {
  id?: number
  sessionId: number
  role: 'user' | 'assistant'
  type: 'text' | 'image'
  content: string | Blob | Blob[]
  modelId: string | null
  referenceImages: string[]
  ratio: string | null
  createdAt: Date
  /** taskId(s) for recovery: key is a unique index per generated image within this message */
  taskIds?: Record<string, string>
}

export interface GalleryImage {
  id?: number
  src: string
  prompt: string
  modelId: string | null
  ratio: string
  sessionId: number
  isFavorite: boolean
  createdAt: Date
}

export interface ReferenceImage {
  id?: number
  src: string
  name: string
  createdAt: Date
}

// ─── Database ───────────────────────────────────────────────────────────────

export class OpenTuDB extends Dexie {
  sessions!: Table<Session, number>
  messages!: Table<Message, number>
  galleryImages!: Table<GalleryImage, number>
  referenceImages!: Table<ReferenceImage, number>

  constructor() {
    super('OpenTuDB')

    this.version(1).stores({
      sessions: '++id, updatedAt',
      messages: '++id, sessionId, role, type, createdAt',
    })
    this.version(3).stores({
      sessions: '++id, updatedAt',
      messages: '++id, sessionId, role, type, createdAt, referenceImage, ratio',
    }).upgrade(tx => tx.table('messages').toCollection().modify(msg => {
      if (msg.ratio === undefined) msg.ratio = null
    }))
    this.version(4).stores({
      sessions: '++id, updatedAt',
      messages: '++id, sessionId, role, type, createdAt, referenceImage, ratio',
      galleryImages: '++id, isFavorite, createdAt',
      referenceImages: '++id, createdAt',
    })
    this.version(5).stores({
      sessions: '++id, updatedAt',
      messages: '++id, sessionId, role, type, createdAt, referenceImage, ratio, taskIds',
      galleryImages: '++id, isFavorite, createdAt',
      referenceImages: '++id, createdAt',
    })
  }
}

export const db = new OpenTuDB()

// ─── IndexedDB health check ─────────────────────────────────────────────────

let idbAvailable: boolean | null = null
let idbCheckDone = false

async function checkIdbHealth(): Promise<boolean> {
  if (idbCheckDone) return idbAvailable!
  idbCheckDone = true
  try {
    await Promise.race([
      db.sessions.count(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('IDB_TIMEOUT')), 3000))
    ])
    idbAvailable = true
  } catch {
    idbAvailable = false
    console.warn('[db] IndexedDB unavailable — falling back to in-memory storage')
  }
  return idbAvailable
}

// ─── In-memory fallback ─────────────────────────────────────────────────────

const memSessions = new Map<number, Session>()
const memMessages = new Map<number, Message>()
let nextSessionId = 1
let nextMessageId = 1

// ─── Unified API ────────────────────────────────────────────────────────────

export async function createSession(title = '新对话'): Promise<number> {
  const useIdb = await checkIdbHealth()
  if (useIdb) {
    return (await db.sessions.add({ title, updatedAt: new Date() })) as number
  }

  const id = nextSessionId++
  memSessions.set(id, { id, title, updatedAt: new Date() })
  return id
}

export async function listSessions(): Promise<Session[]> {
  const useIdb = await checkIdbHealth()
  if (useIdb) {
    return db.sessions.orderBy('updatedAt').reverse().toArray()
  }

  return Array.from(memSessions.values()).sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  )
}

export async function deleteSession(id: number): Promise<void> {
  const useIdb = await checkIdbHealth()
  if (useIdb) {
    await db.transaction('rw', [db.sessions, db.messages], async () => {
      await db.messages.where('sessionId').equals(id).delete()
      await db.sessions.delete(id)
    })
    return
  }

  memMessages.forEach((msg, msgId) => {
    if (msg.sessionId === id) memMessages.delete(msgId)
  })
  memSessions.delete(id)
}

export async function addMessage(msg: Omit<Message, 'id'>): Promise<number> {
  const useIdb = await checkIdbHealth()

  // Clone to avoid mutating the caller's object
  let toSave: Message = { ...msg }

  // IndexedDB cannot store Blob — convert to data URL for persistence
  if (useIdb) {
    const convertToDataUrl = async (blob: Blob): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as string)
        reader.onerror = reject
        reader.readAsDataURL(blob)
      })
    }
    if (Array.isArray(toSave.content)) {
      const urls: string[] = []
      for (const item of toSave.content) {
        if (item instanceof Blob) {
          urls.push(await convertToDataUrl(item))
        } else {
          urls.push(item as string)
        }
      }
      toSave = { ...toSave, content: urls }
    } else if (toSave.content instanceof Blob) {
      toSave = { ...toSave, content: await convertToDataUrl(toSave.content) }
    }
  }

  if (useIdb) {
    const id = (await db.messages.add(toSave)) as number
    await db.sessions.update(msg.sessionId, { updatedAt: new Date() })
    return id
  }

  const id = nextMessageId++
  const full: Message = { ...toSave, id }
  memMessages.set(id, full)

  const session = memSessions.get(msg.sessionId)
  if (session) {
    memSessions.set(msg.sessionId, { ...session, updatedAt: new Date() })
  }
  return id
}

export async function listMessages(sessionId: number): Promise<Message[]> {
  const useIdb = await checkIdbHealth()
  if (useIdb) {
    return db.messages.where('sessionId').equals(sessionId).sortBy('createdAt')
  }

  return Array.from(memMessages.values())
    .filter(m => m.sessionId === sessionId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
}

export async function deleteMessages(ids: number[]): Promise<void> {
  if (ids.length === 0) return
  const useIdb = await checkIdbHealth()
  if (useIdb) {
    await db.messages.bulkDelete(ids)
    return
  }

  ids.forEach(id => memMessages.delete(id))
}

export async function updateMessage(id: number, patch: Partial<Message>): Promise<void> {
  const useIdb = await checkIdbHealth()
  if (useIdb) {
    await db.messages.update(id, patch)
    return
  }

  const msg = memMessages.get(id)
  if (msg) memMessages.set(id, { ...msg, ...patch })
}

// ─── Gallery images ─────────────────────────────────────────────────────────

export async function addGalleryImage(img: Omit<GalleryImage, 'id'>): Promise<number> {
  const useIdb = await checkIdbHealth()
  if (useIdb) return (await db.galleryImages.add(img as GalleryImage)) as number
  return Date.now()
}

export async function deleteGalleryImage(id: number): Promise<void> {
  const useIdb = await checkIdbHealth()
  if (useIdb) await db.galleryImages.delete(id)
}

export async function getAllGalleryImages(): Promise<GalleryImage[]> {
  const useIdb = await checkIdbHealth()
  if (useIdb) return db.galleryImages.orderBy('createdAt').reverse().toArray()
  return []
}

export async function toggleGalleryFavorite(id: number): Promise<void> {
  const useIdb = await checkIdbHealth()
  if (!useIdb) return
  const img = await db.galleryImages.get(id)
  if (img) await db.galleryImages.update(id, { isFavorite: !img.isFavorite })
}

// ─── Reference images ───────────────────────────────────────────────────────

export async function addReferenceImage(img: Omit<ReferenceImage, 'id'>): Promise<number> {
  const useIdb = await checkIdbHealth()
  if (useIdb) return (await db.referenceImages.add(img as ReferenceImage)) as number
  return Date.now()
}

export async function deleteReferenceImage(id: number): Promise<void> {
  const useIdb = await checkIdbHealth()
  if (useIdb) await db.referenceImages.delete(id)
}

export async function getAllReferenceImages(): Promise<ReferenceImage[]> {
  const useIdb = await checkIdbHealth()
  if (useIdb) return db.referenceImages.orderBy('createdAt').reverse().toArray()
  return []
}
