import { BaseModelAdapter } from '../BaseModelAdapter'
import type { GenerateImageParams, GenerateImageResponse } from '../types'
import { getBaseUrl, getHeaders, b64JsonToBlob, pollTask } from '../adapterUtils'

/**
 * gpt-image-2 — converts ratio + tier to pixel dimensions respecting constraints:
 * - Max edge ≤ 3840
 * - Both edges multiples of 16
 * - Long:short ≤ 3:1
 * - Total pixels 655,360 – 8,294,400
 */
function ratioToSize(ratio: string | undefined, tier: '1k' | '2k' | '4k'): string {
  if (!ratio || ratio === '1:1') {
    return tier === '4k' ? '2048x2048' : tier === '2k' ? '2048x2048' : '1024x1024'
  }

  const [w, h] = ratio.split(':').map(Number)
  const isPortrait = w < h
  const shortEdge = tier === '4k' ? 2160 : tier === '2k' ? 2048 : 1024

  if (isPortrait) {
    const height = shortEdge
    const width = Math.round(shortEdge * (w / h))
    const clamped = Math.min(width, 3840)
    const rounded = Math.round(clamped / 16) * 16
    return `${rounded}x${height}`
  } else {
    const width = shortEdge
    const height = Math.round(shortEdge * (h / w))
    const clamped = Math.min(height, 3840)
    const rounded = Math.round(clamped / 16) * 16
    return `${width}x${rounded}`
  }
}

/** gpt-image-2 — async generations */
export class GptImage2Adapter extends BaseModelAdapter {
  readonly modelId = 'gpt-image-2'

  async generate(params: GenerateImageParams): Promise<GenerateImageResponse> {
    this.validateParams(params)

    const tier: '1k' | '2k' | '4k' = '1k'

    const headers = getHeaders()
    const baseUrl = getBaseUrl()

    const body: Record<string, unknown> = {
      model: 'gpt-image-2',
      prompt: params.prompt,
      response_format: 'b64_json',
      size: ratioToSize(params.ratio, tier),
    }

    if (params.imageUrls?.length) body.image = params.imageUrls

    const res = await fetch(`${baseUrl}/v1/images/generations?async=true`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })

    let taskInfo: Record<string, unknown>
    try {
      taskInfo = await res.json()
    } catch {
      const text = await res.text().catch(() => '')
      throw new Error(`响应解析失败: ${res.status} ${text}`.slice(0, 200))
    }

    console.log('[DEBUG-GPT2] POST response status:', res.status, 'body:', JSON.stringify(taskInfo).slice(0, 500))

    if (!res.ok) {
      const err = (taskInfo.error as string)
        ?? (taskInfo.message as string)
        ?? (taskInfo.msg as string)
        ?? JSON.stringify(taskInfo)
      throw new Error(`API 请求失败 ${res.status}: ${err}`.slice(0, 200))
    }

    const rawId = taskInfo.data ?? taskInfo.task_id ?? taskInfo.taskId ?? taskInfo.id ?? taskInfo
    const taskId: string = typeof rawId === 'string' ? rawId : rawId != null ? String(rawId) : ''
    console.log('[DEBUG-GPT2] rawId:', JSON.stringify(rawId).slice(0, 200), '-> taskId:', taskId)
    if (!taskId) {
      throw new Error(`未获取到有效 task_id，响应内容: ${JSON.stringify(taskInfo)}`.slice(0, 200))
    }

    console.log('[DEBUG-GPT2] Starting pollTask with taskId:', taskId)
    const result = await pollTask(`${baseUrl}/v1/images/tasks/${taskId}`, headers)
    console.log('[DEBUG-GPT2] pollTask returned:', JSON.stringify(result).slice(0, 300))

    let blob: Blob
    if (result.b64_json) {
      blob = await b64JsonToBlob(result.b64_json)
    } else if (result.url) {
      const imgRes = await fetch(result.url, { signal: AbortSignal.timeout(30_000) })
      blob = await imgRes.blob()
    } else {
      throw new Error('API 响应中无图像数据')
    }

    console.log('[DEBUG-GPT2] generate() returning blob, size:', blob.size, 'type:', blob.type)
    return { blob, mimeType: blob.type, modelId: this.modelId }
  }
}
