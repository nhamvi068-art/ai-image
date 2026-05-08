import { useSettingsStore } from '../../store/settingsStore'

const BASE_URL_RE = /\/$/

export function getBaseUrl(): string {
  const url = useSettingsStore.getState().baseUrl
  if (!url) throw new Error('API Base URL 未配置，请在侧边栏「API 配置」中设置')
  return url.replace(BASE_URL_RE, '')
}

export function getHeaders(): Record<string, string> {
  return useSettingsStore.getState().getHeaders()
}

export async function b64JsonToBlob(b64: string, mimeType = 'image/png'): Promise<Blob> {
  const DATA_URL_RE = /^data:([^;]+);base64,/
  const match = b64.match(DATA_URL_RE)
  const effectiveMimeType = match?.[1] ?? mimeType
  const base64Data = match ? b64.slice(match[0].length) : b64
  let binary: string
  try {
    binary = atob(base64Data)
  } catch {
    throw new Error(`base64 解码失败，内容前100字符: ${base64Data.slice(0, 100)}`)
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: effectiveMimeType })
}

export interface PollResult {
  b64_json?: string
  url?: string
}

export type PollProgressStatus =
  | 'pending'     // 等待提交
  | 'queued'      // 排队中
  | 'processing' // 处理中
  | 'in_progress'// 处理中（与 IN_PROGRESS 对应）
  | 'success'    // 成功
  | 'failure'    // 失败
  | 'unknown'    // 未知

export interface PollProgress {
  status: PollProgressStatus
  raw: string       // 原始 status 字符串（IN_PROGRESS / SUCCESS / FAILURE 等）
  progress?: string // 进度字符串，如 "45%"
}

// ─── Status mapping ─────────────────────────────────────────────────────────────

const COMPLETED_STATUSES = new Set(['completed', 'success', 'succeeded', 'finished', 'ok', 'done', 'complete'])
const FAILED_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled', 'expired', 'rejected', 'failure'])
const PENDING_STATUSES = new Set(['pending', 'queued', 'queue', 'waiting', 'processing', 'in_progress', 'inqueue', 'submitted'])

function mapToProgressStatus(raw: string): PollProgressStatus {
  const s = raw.toLowerCase()
  if (s === 'in_progress') return 'in_progress'
  if (s === 'not_start' || s === 'notstarted' || s === 'not_started') return 'pending'
  if (s === 'success' || s === 'succeeded') return 'success'
  if (s === 'failure' || s === 'failed') return 'failure'
  if (s === 'queued' || s === 'queue' || s === 'submitted') return 'queued'
  if (s === 'pending' || s === 'waiting') return 'pending'
  if (s === 'processing') return 'processing'
  return 'unknown'
}

function isErrorResponse(json: Record<string, unknown>): string | null {
  if (json.error) {
    if (typeof json.error === 'string') return json.error
    if (typeof json.error === 'object' && json.error !== null) {
      const e = json.error as Record<string, unknown>
      return String(e.message ?? e.msg ?? e.error ?? JSON.stringify(json.error))
    }
    return String(json.error)
  }
  if (json.message) return String(json.message)
  if (json.msg) return String(json.msg)
  if (json.fail_reason) return String(json.fail_reason)
  if (json.code && (json.code !== 0 && json.code !== '0' && json.code !== 'success' && json.code !== 'ok')) {
    return `code: ${json.code}`
  }
  return null
}

function isCodeSuccess(json: Record<string, unknown>): boolean {
  const codeField = json.code
  return codeField === 0 || codeField === '0'
    || codeField === 'success' || codeField === 'Success'
    || codeField === 'ok' || codeField === 'Ok' || codeField === 'OK'
}

function extractFirstImage(wrapper: unknown): PollResult {
  if (Array.isArray(wrapper) && wrapper.length > 0) {
    const first = wrapper[0] as Record<string, unknown>
    return {
      b64_json: (first.b64_json as string | undefined) ?? (first.b64Json as string | undefined),
      url: first.url as string | undefined,
    }
  }
  if (typeof wrapper === 'object' && wrapper !== null) {
    const obj = wrapper as Record<string, unknown>
    return {
      b64_json: (obj.b64_json as string | undefined) ?? (obj.b64Json as string | undefined),
      url: obj.url as string | undefined,
    }
  }
  if (typeof wrapper === 'string') {
    return { b64_json: wrapper }
  }
  return { b64_json: undefined, url: undefined }
}

/**
 * Extracts the image result from a task-polling response.
 *
 * API response shape (matches the spec):
 * {
 *   code: "success",
 *   status: "SUCCESS" | "IN_PROGRESS" | "FAILURE",
 *   data: {
 *     status: "SUCCESS",
 *     data: { data: [{ url, b64_json, revised_prompt }] }
 *   }
 * }
 *
 * Legacy / other API shapes also supported:
 * - { status: "completed", data: [{ url, b64_json }] }
 * - { code: 0, data: [{ url, b64_json }] }
 * - { data: { url, b64_json } }
 */
function extractResultFromJson(json: Record<string, unknown>): PollResult {
  // #region agent log
  fetch('http://127.0.0.1:7252/ingest/f0ec8a8c-1b3f-43cf-b3aa-e816736c30f5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9f09f2'},body:JSON.stringify({sessionId:'9f09f2',location:'adapterUtils.ts:extractResultFromJson',message:'extractResultFromJson called',data:{json:JSON.stringify(json).slice(0,300)},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const outerData = json.data as Record<string, unknown> | undefined
  const taskStatus: string = (outerData?.status as string | undefined ?? '').toLowerCase()
  const rawStatus: string = (json.data as Record<string, unknown> | undefined)?.status ?? json.status ?? ''
  const status: string = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : ''

  const log = (msg: string, detail?: unknown) => {
    console.log(`[extractResultFromJson] ${msg}`, detail ?? '')
  }

  log('input', { taskStatus, status, hasOuterData: !!outerData, outerDataKeys: outerData ? Object.keys(outerData) : [] })

  // Primary path: code + status wrapper
  if (isCodeSuccess(json)) {
    log('code=success, checking taskStatus=' + taskStatus)
    if (COMPLETED_STATUSES.has(taskStatus)) {
      const innerData = outerData?.data as Record<string, unknown> | undefined
      log('COMPLETED path, innerData=' + JSON.stringify(innerData).slice(0, 200))
      if (innerData) {
        const extracted = extractFirstImage(innerData.data)
        log('COMPLETED extracted', extracted)
        return extracted
      }
      return { b64_json: undefined, url: undefined }
    }
  }

  // Path A: top-level status field
  log('PathA check', { status, COMPLETED: COMPLETED_STATUSES.has(status) })
  if (status && COMPLETED_STATUSES.has(status)) {
    const data = json.data ?? json.result ?? json.image
    log('PathA data=' + JSON.stringify(data).slice(0, 200))
    if (data) {
      const extracted = extractFirstImage(data)
      log('PathA extracted', extracted)
      return extracted
    }
    return { b64_json: undefined, url: undefined }
  }

  // Path B: code-only wrapper (no status field)
  if (isCodeSuccess(json)) {
    log('PathB code-only, outerData=' + JSON.stringify(outerData).slice(0, 200))
    const data = outerData
    if (data) {
      const extracted = extractFirstImage(data)
      log('PathB extracted', extracted)
      return extracted
    }
  }

  // Path C: flat data object
  log('PathC flat data check')
  const flatData = json.data ?? json.result ?? json.image
  if (typeof flatData === 'object' && flatData !== null) {
    const obj = flatData as Record<string, unknown>
    log('PathC flat obj keys=' + JSON.stringify(Object.keys(obj)).slice(0, 200))
    if (obj.url || obj.b64_json || obj.b64Json) {
      const extracted = {
        b64_json: (obj.b64_json as string | undefined) ?? (obj.b64Json as string | undefined),
        url: obj.url as string | undefined,
      }
      log('PathC extracted', extracted)
      return extracted
    }
  }

  log('fallthrough — no image found')
  return { b64_json: undefined, url: undefined }
}

function parseProgress(json: Record<string, unknown>): PollProgress {
  const outerData = json.data as Record<string, unknown> | undefined
  const taskStatusField: unknown = outerData?.status ?? json.status ?? ''
  const raw = String(taskStatusField)
  return {
    status: mapToProgressStatus(raw),
    raw,
    progress: typeof json.progress === 'string' ? json.progress : undefined,
  }
}

export async function pollTask(
  url: string,
  headers: Record<string, string>,
  onProgress?: (progress: PollProgress) => void,
): Promise<PollResult> {
  const MAX_WAIT = 5 * 60 * 1000
  const start = Date.now()
  let interval = 500

  while (Date.now() - start < MAX_WAIT) {
    await new Promise(r => setTimeout(r, interval))

    let res: Response
    try {
      res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(10_000),
      })
    } catch (e) {
      if (e instanceof Error && e.name === 'TimeoutError') {
        throw new Error('轮询请求超时，请检查网络或后端服务')
      }
      throw e
    }

    let json: Record<string, unknown>
    try {
      json = await res.json()
    } catch {
      const rawRes = res.clone()
      const text = await rawRes.text().catch(() => '')
      console.log('[pollTask] JSON parse failed — status:', res.status, 'body:', JSON.stringify(text).slice(0, 200))
      let parsed: unknown
      try { parsed = JSON.parse(text) } catch { parsed = null }
      if (parsed !== null) {
        json = parsed as Record<string, unknown>
        console.log('[pollTask] body is valid JSON after all, using it')
      } else {
        if (!res.ok) {
          throw new Error(`轮询 HTTP 错误 ${res.status}: ${text}`.slice(0, 200))
        }
        throw new Error(`轮询响应解析失败: ${res.status} ${text}`.slice(0, 200))
      }
    }
    console.log('[pollTask] Poll response:', JSON.stringify(json).slice(0, 500))
    // #region agent log
    fetch('http://127.0.0.1:7252/ingest/f0ec8a8c-1b3f-43cf-b3aa-e816736c30f5',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9f09f2'},body:JSON.stringify({sessionId:'9f09f2',location:'adapterUtils.ts:pollTask',message:'pollTask response',data:{resOk:res.ok,resStatus:res.status,jsonStatus:json.status,jsonCode:json.code,parsedProgress:parseProgress(json)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    if (!res.ok) {
      const errDetail = isErrorResponse(json) ?? JSON.stringify(json)
      throw new Error(`轮询 HTTP 错误 ${res.status}: ${errDetail}`.slice(0, 200))
    }

    const progress = parseProgress(json)
    const status = progress.status
    onProgress?.(progress)

    const errorMsg = isErrorResponse(json)

    if (status === 'success') {
      const result = extractResultFromJson(json)
      if (result.b64_json || result.url) return result
      // Has success status but no image data yet (backend may still be writing) — keep polling
      console.log('[pollTask] status=success but no image data yet, continuing poll...')
    } else if (status === 'failure') {
      throw new Error(`生成任务失败: ${errorMsg ?? JSON.stringify(json)}`.slice(0, 200))
    } else if (errorMsg) {
      throw new Error(`生成任务失败: ${errorMsg}`.slice(0, 200))
    }

    // Fix: even if status is pending/in_progress/queued, return immediately if img data exists
    {
      const result = extractResultFromJson(json)
      if (result.b64_json || result.url) {
        console.log('[pollTask] Image data found (status=' + status + '), returning immediately')
        return result
      }
    }

    if (status === 'unknown' && progress.raw !== '') {
      console.warn(`[pollTask] Unknown status "${progress.raw}", continuing poll...`, json)
    }

    interval = Math.min(interval * 1.5, 10_000)
  }

  throw new Error('生成超时，请稍后重试')
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error(`图片获取失败: ${imgRes.status}`)
  return imgRes.blob()
}

/**
 * Direct task fetch — used for recovery when polling failed but the backend
 * has already finished generating. Returns the same PollResult shape as pollTask,
 * but only makes a single request and does not loop.
 */
export async function fetchTaskDirect(
  url: string,
  headers: Record<string, string>,
): Promise<PollResult> {
  let res: Response
  try {
    res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') {
      throw new Error('恢复请求超时，请稍后重试')
    }
    throw e
  }

  let json: Record<string, unknown>
  try {
    json = await res.json()
  } catch {
    const text = await res.text().catch(() => '')
    throw new Error(`恢复响应解析失败: ${res.status} ${text}`.slice(0, 200))
  }

  if (!res.ok) {
    const errDetail = isErrorResponse(json) ?? JSON.stringify(json)
    throw new Error(`恢复 HTTP 错误 ${res.status}: ${errDetail}`.slice(0, 200))
  }

  console.log('[fetchTaskDirect] Response:', JSON.stringify(json).slice(0, 500))

  const progress = parseProgress(json)
  const status = progress.status

  if (status === 'failure') {
    const errMsg = isErrorResponse(json) ?? JSON.stringify(json)
    throw new Error(`恢复失败: ${errMsg}`.slice(0, 200))
  }

  if (status === 'success') {
    const result = extractResultFromJson(json)
    if (result.b64_json || result.url) return result
  }

  const errMsg = isErrorResponse(json)
  if (errMsg) {
    throw new Error(`恢复失败: ${errMsg}`.slice(0, 200))
  }

  throw new Error(`图片仍在生成中，请稍后再试。当前状态: ${progress.raw || JSON.stringify(json).slice(0, 100)}`.slice(0, 200))
}
