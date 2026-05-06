import { BaseModelAdapter } from '../BaseModelAdapter'
import type { GenerateImageParams, GenerateImageResponse } from '../types'
import { getBaseUrl, getHeaders, b64JsonToBlob, pollTask } from '../adapterUtils'

/** nano-banana-2 (Pro) — async generations */
export class NanoBanana2Adapter extends BaseModelAdapter {
  readonly modelId = 'nano-banana-2'

  async generate(params: GenerateImageParams): Promise<GenerateImageResponse> {
    this.validateParams(params)
    const headers = getHeaders()
    const baseUrl = getBaseUrl()

    const body: Record<string, unknown> = {
      model: 'nano-banana-2',
      prompt: params.prompt,
      response_format: 'b64_json',
    }

    if (params.ratio) body.aspect_ratio = params.ratio
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

    console.log('[DEBUG-NB2] POST response status:', res.status, 'body:', JSON.stringify(taskInfo).slice(0, 500))

    if (!res.ok) {
      const err = (taskInfo.error as string)
        ?? (taskInfo.message as string)
        ?? (taskInfo.msg as string)
        ?? JSON.stringify(taskInfo)
      throw new Error(`API 请求失败 ${res.status}: ${err}`.slice(0, 200))
    }

    const rawId = taskInfo.data ?? taskInfo.task_id ?? taskInfo.taskId ?? taskInfo.id ?? taskInfo
    const taskId: string = typeof rawId === 'string' ? rawId : rawId != null ? String(rawId) : ''
    console.log('[DEBUG-NB2] rawId:', JSON.stringify(rawId).slice(0, 200), '-> taskId:', taskId)
    if (!taskId) {
      throw new Error(`未获取到有效 task_id，响应内容: ${JSON.stringify(taskInfo)}`.slice(0, 200))
    }

    console.log('[DEBUG-NB2] Starting pollTask with taskId:', taskId)
    const result = await pollTask(`${baseUrl}/v1/images/tasks/${taskId}`, headers)
    console.log('[DEBUG-NB2] pollTask returned:', JSON.stringify(result).slice(0, 300))

    let blob: Blob
    if (result.b64_json) {
      blob = await b64JsonToBlob(result.b64_json)
    } else if (result.url) {
      const imgRes = await fetch(result.url, { signal: AbortSignal.timeout(30_000) })
      blob = await imgRes.blob()
    } else {
      throw new Error('API 响应中无图像数据')
    }

    console.log('[DEBUG-NB2] generate() returning blob, size:', blob.size, 'type:', blob.type)
    return { blob, mimeType: blob.type, modelId: this.modelId }
  }
}
