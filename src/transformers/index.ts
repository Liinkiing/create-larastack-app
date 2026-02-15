import { join } from 'node:path'

import type { TransformerId } from './ids.js'
import type { TransformExecutionContext, Transformer } from './types.js'

import { transformEnvBackend } from './env-backend.js'
import { transformJsonOpencode } from './json-opencode.js'
import { transformPhpConfigServices } from './php-config-services.js'
import { transformPhpMigrationUsers } from './php-migration-users.js'
import { transformPhpRoutesApi } from './php-routes-api.js'
import { transformPhpRoutesWeb } from './php-routes-web.js'
import { transformPhpUser } from './php-user.js'
import { transformYamlGraphql } from './yaml-graphql.js'

const TRANSFORMERS: Record<TransformerId, Transformer> = {
  'php.user.applyProfile': transformPhpUser,
  'php.routes.api.applyProfile': transformPhpRoutesApi,
  'php.routes.web.applyProfile': transformPhpRoutesWeb,
  'php.migration.users.applyProfile': transformPhpMigrationUsers,
  'php.config.services.applyProfile': transformPhpConfigServices,
  'env.backend.applyProfile': transformEnvBackend,
  'yaml.graphql.syncProjects': transformYamlGraphql,
  'json.opencode.syncMcp': transformJsonOpencode,
}

export async function executeNamedTransform(context: TransformExecutionContext): Promise<void> {
  const transformer = TRANSFORMERS[context.operation.transform]

  await transformer({
    filePath: join(context.targetDirectory, context.operation.path),
    options: context.operation.options,
    ruleId: context.ruleId,
    selectedApps: new Set(context.selectedApps),
  })
}

export { AVAILABLE_TRANSFORMERS } from './ids.js'
export { transformEnvBackend } from './env-backend.js'
export { transformJsonOpencode } from './json-opencode.js'
export { transformPhpConfigServices } from './php-config-services.js'
export { transformPhpMigrationUsers } from './php-migration-users.js'
export { transformPhpRoutesApi } from './php-routes-api.js'
export { transformPhpRoutesWeb } from './php-routes-web.js'
export { transformPhpUser } from './php-user.js'
export type { TransformerId } from './ids.js'
export type { TransformExecutionContext, TransformOperation, Transformer, TransformerInput } from './types.js'
export { transformYamlGraphql } from './yaml-graphql.js'
