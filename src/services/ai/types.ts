// ─── Parameter & Response types ─────────────────────────────────────────────

export interface GenerateImageParams {
  prompt: string
  /** Aspect ratio token, e.g. '1:1' | '16:9' | '9:16' */
  ratio?: string
  /** Reference image URLs or base64 strings (optional) */
  imageUrls?: string[]
  /** Additional model-specific options */
  [key: string]: unknown
}

export interface GenerateImageResponse {
  /** Raw image Blob — never base64 */
  blob: Blob
  /** MIME type of the returned blob */
  mimeType: string
  /** Human-readable model identifier that generated this image */
  modelId: string
}

// ─── Model configuration ──────────────────────────────────────────────────────

export interface ModelConfig {
  id: string
  name: string
  description: string
  adapterKey: string
  /** Max prompt length (rough) */
  maxPromptLength: number
  /** Supported ratios */
  supportedRatios: string[]
  /** Optional API endpoint placeholder */
  endpoint?: string
  /** Logo image URL (optional) */
  logo?: string
}
