import type { AppChoice } from '../types.js'
import type { TransformerId } from './ids.js'

export interface TransformOperation {
  type: 'transform'
  path: string
  transform: TransformerId
  options?: Record<string, unknown>
}

export interface TransformExecutionContext {
  targetDirectory: string
  selectedApps: AppChoice[]
  ruleId: string
  operation: TransformOperation
}

export interface TransformerInput {
  filePath: string
  options?: Record<string, unknown>
  ruleId: string
  selectedApps: Set<AppChoice>
}

export type Transformer = (input: TransformerInput) => Promise<void>
