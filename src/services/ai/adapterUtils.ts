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

export async function pollTask(
  url: string,
  headers: Record<string, string>,
  onProgress?: (status: string) => void,
): Promise<PollResult> {
  const MAX_WAIT = 5 * 60 * 1000
  const start = Date.now()
  let interval = 3000

  const COMPLETED_STATUSES = new Set(['completed', 'success', 'succeeded', 'finished', 'ok', 'done', 'complete'])
  const FAILED_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled', 'expired', 'rejected', 'failure', 'failed'])
  const PENDING_STATUSES = new Set(['pending', 'queued', 'queue', 'waiting', 'processing', 'in_progress', 'inqueue', 'submitted'])

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
      const text = await res.text().catch(() => '')
      throw new Error(`轮询响应解析失败: ${res.status} ${text}`.slice(0, 200))
    }

    console.log('[pollTask] Poll response:', JSON.stringify(json).slice(0, 500))

    if (!res.ok) {
      const errDetail = isErrorResponse(json) ?? JSON.stringify(json)
      throw new Error(`轮询 HTTP 错误 ${res.status}: ${errDetail}`.slice(0, 200))
    }

    const rawStatus = json.status ?? ''
    const status: string = typeof rawStatus === 'string' ? rawStatus.toLowerCase() : ''
    const hasStatusField = json.hasOwnProperty('status')
    onProgress?.(status)

    if (COMPLETED_STATUSES.has(status)) {
      const data = json.data ?? json.result ?? json.image ?? json
      const d = data as Record<string, unknown>
      const j = json as Record<string, unknown>
      return {
        b64_json: (d?.b64_json as string | undefined)
          ?? (d?.b64Json as string | undefined)
          ?? (j?.b64_json as string | undefined)
          ?? (j?.b64Json as string | undefined),
        url: (d?.url as string | undefined) ?? (j?.url as string | undefined),
      }
    }

    const errorMsg = isErrorResponse(json)

    // Backend returns { code, message, data } without a "status" field.
    // Treat code=0/'success'/'ok' as success, otherwise as failure.
    const codeField = json.code
    const isCodeSuccess = codeField === 0 || codeField === '0'
      || codeField === 'success' || codeField === 'Success'
      || codeField === 'ok' || codeField === 'Ok' || codeField === 'OK'

    if (hasStatusField) {
      // Normalize path: has status field, check it normally
      if (COMPLETED_STATUSES.has(status)) {
        // already handled above
      } else if (FAILED_STATUSES.has(status) || errorMsg) {
        throw new Error(`生成任务失败: ${errorMsg ?? JSON.stringify(json)}`.slice(0, 200))
      }
    } else {
      // No "status" field — use code/message/data structure.
      // The backend returns: { code, message, data: { status, data: [{ b64_json, url }], ... } }
      if (isCodeSuccess) {
        const outerData = json.data as Record<string, unknown> | undefined
        const taskStatus: string = (outerData?.status as string | undefined ?? '').toLowerCase()
        if (taskStatus === 'succeed' || taskStatus === 'succeeded' || taskStatus === 'completed' || taskStatus === 'success' || taskStatus === 'done' || taskStatus === 'finished') {
          const innerData = outerData?.data as Record<string, unknown> | undefined
          const imgWrapper = innerData?.data
          let b64: string | undefined
          let imgUrl: string | undefined

          if (Array.isArray(imgWrapper) && imgWrapper.length > 0) {
            const first = imgWrapper[0] as Record<string, unknown>
            b64 = (first.b64_json as string | undefined) ?? (first.b64Json as string | undefined)
            imgUrl = (first.url as string | undefined)
          } else if (typeof imgWrapper === 'object' && imgWrapper !== null) {
            const iw = imgWrapper as Record<string, unknown>
            b64 = (iw.b64_json as string | undefined) ?? (iw.b64Json as string | undefined)
            imgUrl = (iw.url as string | undefined)
          } else if (typeof imgWrapper === 'string') {
            b64 = imgWrapper
          }

          return { b64_json: b64, url: imgUrl }
        }
        // Task still processing — fall through to continue polling
      } else if (errorMsg) {
        throw new Error(`生成任务失败: ${errorMsg}`.slice(0, 200))
      }
      // Unknown state — continue polling
    }

    if (!PENDING_STATUSES.has(status) && status !== '') {
      console.warn(`[pollTask] Unknown status "${status}", continuing poll...`, json)
    }

    interval = Math.min(interval * 2, 30_000)
  }

  throw new Error('生成超时，请稍后重试')
}

export async function blobFromUrl(url: string): Promise<Blob> {
  const imgRes = await fetch(url)
  if (!imgRes.ok) throw new Error(`图片获取失败: ${imgRes.status}`)
  return imgRes.blob()
}
