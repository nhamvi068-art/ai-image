import type { GenerateImageParams, GenerateImageResponse } from './types'

/**
 * BaseModelAdapter — every model adapter must implement this contract.
 * New models are added by creating a subclass and registering it in ModelRegistry.
 */
export abstract class BaseModelAdapter {
  abstract readonly modelId: string

  abstract generate(params: GenerateImageParams): Promise<GenerateImageResponse>

  protected validateParams(params: GenerateImageParams): void {
    if (!params.prompt || params.prompt.trim().length === 0) {
      throw new Error('Prompt cannot be empty')
    }
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
