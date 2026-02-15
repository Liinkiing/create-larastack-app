import type { Transformer } from './types.js'

import { assertNever, extractEnvKey, readProfileOption, readTextFile, writeIfChanged } from './shared.js'

export const transformEnvBackend: Transformer = async ({ filePath, options, ruleId }) => {
  const profile = readProfileOption(options, ['no-mobile', 'backend-only'] as const, ruleId)
  const source = await readTextFile(filePath, ruleId)
  const lines = source.split('\n')

  let removeKeys: Set<string>
  let setValues: Map<string, string>

  switch (profile) {
    case 'no-mobile': {
      removeKeys = new Set(['GOOGLE_CLIENT_IOS_ID', 'APPLE_CLIENT_ID', 'APPLE_ALLOWED_CLIENT_IDS'])
      setValues = new Map([['GOOGLE_ALLOWED_CLIENT_IDS', '"${GOOGLE_CLIENT_ID}"']])
      break
    }

    case 'backend-only': {
      removeKeys = new Set([
        'FRONTEND_URL',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_IOS_ID',
        'GOOGLE_CLIENT_SECRET',
        'GOOGLE_REDIRECT_URI',
        'GOOGLE_ALLOWED_CLIENT_IDS',
        'APPLE_CLIENT_ID',
        'APPLE_ALLOWED_CLIENT_IDS',
      ])
      setValues = new Map<string, string>()
      break
    }

    default: {
      assertNever(profile, 'env.backend profile')
    }
  }

  const updatedLines = lines
    .filter(line => {
      const key = extractEnvKey(line)
      return !key || !removeKeys.has(key)
    })
    .map(line => {
      const key = extractEnvKey(line)

      if (!key) {
        return line
      }

      const nextValue = setValues.get(key)

      if (nextValue === undefined) {
        return line
      }

      return `${key}=${nextValue}`
    })

  const output = `${updatedLines.join('\n').replace(/\n{3,}/g, '\n\n')}\n`
  await writeIfChanged(filePath, source, output)
}
