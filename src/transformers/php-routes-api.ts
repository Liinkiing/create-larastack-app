import MagicString from 'magic-string'

import type { Transformer } from './types.js'

import {
  assertNever,
  parsePhp,
  readProfileOption,
  readTextFile,
  removeRouteStatements,
  removeUseImports,
  writeIfChanged,
} from './shared.js'

export const transformPhpRoutesApi: Transformer = async ({ filePath, options, ruleId }) => {
  const profile = readProfileOption(options, ['no-mobile', 'backend-only'] as const, ruleId)
  const source = await readTextFile(filePath, ruleId)
  let output = source

  switch (profile) {
    case 'backend-only': {
      output = '<?php\n'
      break
    }

    case 'no-mobile': {
      const ast = parsePhp(source, filePath, ruleId)
      const magic = new MagicString(source)

      removeUseImports(source, magic, ast, [
        'App\\Http\\Controllers\\Auth\\MobileAppleAuthController',
        'App\\Http\\Controllers\\Auth\\MobileGoogleAuthController',
        'App\\Http\\Controllers\\Auth\\MobileTokenController',
      ])
      removeRouteStatements(source, magic, ast, ['/auth/apple/mobile', '/auth/google/mobile', '/auth/mobile/logout'])

      output = magic.toString()
      break
    }

    default: {
      assertNever(profile, 'php.routes.api profile')
    }
  }

  await writeIfChanged(filePath, source, output)
}
