import type { ModelConfig } from './types'
import { BaseModelAdapter } from './BaseModelAdapter'
import { NanoBanana2Adapter } from './adapters/NanoBanana2Adapter'
import { NanoBanana3FlashAdapter } from './adapters/NanoBanana3FlashAdapter'
import { GptImage2Adapter } from './adapters/GptImage2Adapter'
import gptLogo from '../../assets/logos/gptlogo.png'
import geminiLogo from '../../assets/logos/gemini logo.png'

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * AVAILABLE_MODELS — the single source of truth for all supported models.
 * To add a new model:
 *   1. Create src/services/ai/adapters/MyModelAdapter.ts implementing BaseModelAdapter
 *   2. Add its entry to AVAILABLE_MODELS below
 *   3. Add the import above
 */

// Adapter key → logo (shared by all models using the same adapter)
const ADAPTER_LOGOS: Record<string, string> = {
  'gpt-image-2': gptLogo,
  'nano-banana-pro': geminiLogo,
  'nano-banana-2': geminiLogo,
}

export const AVAILABLE_MODELS: ModelConfig[] = [
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    description: 'OpenAI GPT Image 2',
    adapterKey: 'gpt-image-2',
    maxPromptLength: 4000,
    supportedRatios: ['1:1', '16:9', '9:16'],
    logo: ADAPTER_LOGOS['gpt-image-2'],
  },
  {
    id: 'gpt-image-2-2k',
    name: 'GPT Image 2 2K',
    description: 'OpenAI GPT Image 2，2K 输出',
    adapterKey: 'gpt-image-2',
    maxPromptLength: 4000,
    supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '21:9'],
    logo: ADAPTER_LOGOS['gpt-image-2'],
  },
  {
    id: 'gpt-image-2-4k',
    name: 'GPT Image 2 4K',
    description: 'OpenAI GPT Image 2，4K 输出',
    adapterKey: 'gpt-image-2',
    maxPromptLength: 4000,
    supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '21:9'],
    logo: ADAPTER_LOGOS['gpt-image-2'],
  },
  {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    description: 'Nano Banana 2，512px 输出',
    adapterKey: 'nano-banana-2',
    maxPromptLength: 4000,
    supportedRatios: ['1:1', '16:9', '9:16'],
    logo: ADAPTER_LOGOS['nano-banana-2'],
  },
  {
    id: 'nano-banana-2-2k',
    name: 'Nano Banana 2 2K',
    description: 'Nano Banana 2，2K 输出',
    adapterKey: 'nano-banana-2',
    maxPromptLength: 4000,
    supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '21:9'],
    logo: ADAPTER_LOGOS['nano-banana-2'],
  },
  {
    id: 'nano-banana-2-4k',
    name: 'Nano Banana 2 4K',
    description: 'Nano Banana 2，4K 输出',
    adapterKey: 'nano-banana-2',
    maxPromptLength: 4000,
    supportedRatios: ['1:1', '16:9', '9:16', '4:3', '3:4', '4:5', '5:4', '21:9'],
    logo: ADAPTER_LOGOS['nano-banana-2'],
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'Nano Banana Pro，支持多比例输出',
    adapterKey: 'nano-banana-pro',
    maxPromptLength: 4000,
    supportedRatios: ['4:3', '3:4', '16:9', '9:16', '1:1', '4:5', '5:4', '21:9'],
    logo: ADAPTER_LOGOS['nano-banana-pro'],
  },
  {
    id: 'nano-banana-pro-2k',
    name: 'Nano Banana Pro 2K',
    description: 'Nano Banana Pro，固定 2K 输出',
    adapterKey: 'nano-banana-pro',
    maxPromptLength: 4000,
    supportedRatios: ['4:3', '3:4', '16:9', '9:16', '1:1', '4:5', '5:4', '21:9'],
    logo: ADAPTER_LOGOS['nano-banana-pro'],
  },
  {
    id: 'nano-banana-pro-4k',
    name: 'Nano Banana Pro 4K',
    description: 'Nano Banana Pro，固定 4K 输出',
    adapterKey: 'nano-banana-pro',
    maxPromptLength: 4000,
    supportedRatios: ['4:3', '3:4', '16:9', '9:16', '1:1', '4:5', '5:4', '21:9'],
    logo: ADAPTER_LOGOS['nano-banana-pro'],
  },
]

// Adapter key → class constructor (factory map)
const ADAPTER_MAP: Record<string, new () => BaseModelAdapter> = {
  'nano-banana-2': NanoBanana2Adapter,
  'nano-banana-pro': NanoBanana3FlashAdapter,
  'gpt-image-2': GptImage2Adapter,
}

// ─── Factory ─────────────────────────────────────────────────────────────────

let _adapterCache: Record<string, BaseModelAdapter> = {}

function getAdapterInstance(key: string): BaseModelAdapter {
  if (!_adapterCache[key]) {
    const AdapterClass = ADAPTER_MAP[key]
    if (!AdapterClass) {
      throw new Error(`[ModelRegistry] Unknown adapter key: "${key}". ` +
        'Did you forget to register it in AVAILABLE_MODELS?')
    }
    _adapterCache[key] = new AdapterClass()
  }
  return _adapterCache[key]
}

/**
 * Resolve a model config by its id and return the corresponding adapter instance.
 */
export function resolveModelAdapter(modelId: string): BaseModelAdapter {
  const config = AVAILABLE_MODELS.find((m) => m.id === modelId)
  if (!config) {
    // Graceful fallback to first model
    console.warn(`[ModelRegistry] Model "${modelId}" not found, falling back to first available.`)
    return getAdapterInstance(AVAILABLE_MODELS[0].adapterKey)
  }
  return getAdapterInstance(config.adapterKey)
}

/**
 * Returns the ModelConfig for a given id, or undefined.
 */
export function getModelConfig(modelId: string): ModelConfig | undefined {
  return AVAILABLE_MODELS.find((m) => m.id === modelId)
}

/**
 * Extracts the resolution tier from a model id.
 * Examples:
 *   'nano-banana-pro-4k'          → '4k'
 *   'nano-banana-pro-2k'          → '2k'
 *   'nano-banana-pro'             → '1k'
 *   'nano-banana-2-4k'            → '4k'
 *   'nano-banana-2-2k'            → '2k'
 *   'nano-banana-2'               → '1k'
 *   'gpt-image-2-4k'             → '4k'
 *   'gpt-image-2-2k'             → '2k'
 *   'gpt-image-2'                 → '1k'
 */
export function resolveModelTier(modelId: string): '1k' | '2k' | '4k' {
  if (modelId.endsWith('-4k')) return '4k'
  if (modelId.endsWith('-2k')) return '2k'
  return '1k'
}
