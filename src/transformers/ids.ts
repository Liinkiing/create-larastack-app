export const AVAILABLE_TRANSFORMERS = [
  'php.user.applyProfile',
  'php.routes.api.applyProfile',
  'php.routes.web.applyProfile',
  'php.migration.users.applyProfile',
  'php.config.services.applyProfile',
  'env.backend.applyProfile',
  'yaml.graphql.syncProjects',
  'json.opencode.syncMcp',
] as const

export type TransformerId = (typeof AVAILABLE_TRANSFORMERS)[number]

const TRANSFORMER_ID_SET = new Set<string>(AVAILABLE_TRANSFORMERS)

export function isTransformerId(value: string): value is TransformerId {
  return TRANSFORMER_ID_SET.has(value)
}
