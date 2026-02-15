import MagicString from 'magic-string'

import type { Transformer } from './types.js'

import {
  assertNever,
  findClassNode,
  parsePhp,
  readProfileOption,
  readTextFile,
  removeArrayEntriesFromUserCasts,
  removeArrayEntriesFromUserProperty,
  removeTraitUsage,
  removeUseImports,
  writeIfChanged,
} from './shared.js'

export const transformPhpUser: Transformer = async ({ filePath, options, ruleId }) => {
  const profile = readProfileOption(options, ['no-mobile', 'backend-only'] as const, ruleId)
  const source = await readTextFile(filePath, ruleId)
  const ast = parsePhp(source, filePath, ruleId)
  const classNode = findClassNode(ast)
  const magic = new MagicString(source)

  removeUseImports(source, magic, ast, ['Laravel\\Sanctum\\HasApiTokens'])
  removeTraitUsage(source, magic, classNode, 'HasApiTokens')

  switch (profile) {
    case 'no-mobile': {
      break
    }

    case 'backend-only': {
      removeArrayEntriesFromUserProperty(source, magic, classNode, 'hidden', ['google_token', 'google_refresh_token'])
      removeArrayEntriesFromUserCasts(source, magic, classNode, ['google_token', 'google_refresh_token'])
      break
    }

    default: {
      assertNever(profile, 'php.user profile')
    }
  }

  await writeIfChanged(filePath, source, magic.toString())
}
