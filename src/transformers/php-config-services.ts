import MagicString from 'magic-string'

import type { Transformer } from './types.js'

import {
  assertNever,
  findTopLevelReturnArray,
  isRecord,
  parsePhp,
  readProfileOption,
  readTextFile,
  wholeLineRange,
  writeIfChanged,
} from './shared.js'

export const transformPhpConfigServices: Transformer = async ({ filePath, options, ruleId }) => {
  const profile = readProfileOption(options, ['no-mobile', 'backend-only'] as const, ruleId)
  const source = await readTextFile(filePath, ruleId)
  const ast = parsePhp(source, filePath, ruleId)
  const returnArray = findTopLevelReturnArray(ast, ruleId)
  const magic = new MagicString(source)
  let serviceKeysToRemove: Set<string>

  switch (profile) {
    case 'no-mobile': {
      serviceKeysToRemove = new Set(['apple'])
      break
    }

    case 'backend-only': {
      serviceKeysToRemove = new Set(['google', 'apple'])
      break
    }

    default: {
      assertNever(profile, 'php.config.services profile')
    }
  }

  for (const item of returnArray.items) {
    if (!isRecord(item) || item.kind !== 'entry') {
      continue
    }

    const keyValue = readPhpStringValue(item.key)

    if (!keyValue || !serviceKeysToRemove.has(keyValue)) {
      continue
    }

    const [start, end] = wholeLineRange(source, item, 'services config entry')
    magic.remove(start, end)
  }

  await writeIfChanged(filePath, source, magic.toString())
}

function readPhpStringValue(value: unknown): string | undefined {
  if (!isRecord(value) || value.kind !== 'string' || typeof value.value !== 'string') {
    return undefined
  }

  return value.value
}
