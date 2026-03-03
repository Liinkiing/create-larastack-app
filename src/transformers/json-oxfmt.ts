import { readFile } from 'node:fs/promises'

import type { Transformer } from './types.js'

import { isRecord, writeIfChanged } from './shared.js'

export const transformJsonOxfmt: Transformer = async ({ filePath, selectedApps }) => {
  const source = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(source) as Record<string, unknown>

  const nextOverrides: Record<string, unknown>[] = []
  const existingOverrides = Array.isArray(parsed.overrides) ? parsed.overrides : []

  for (const override of existingOverrides) {
    if (!isRecord(override)) {
      continue
    }

    const files = Array.isArray(override.files) ? override.files.filter(item => typeof item === 'string') : []
    const isMobileOverride = files.includes('mobile/**/*')
    const isBackendOverride = files.includes('backend/**/*')

    if (isMobileOverride || isBackendOverride) {
      continue
    }

    nextOverrides.push(override)
  }

  if (selectedApps.has('mobile')) {
    nextOverrides.push({
      files: ['mobile/**/*'],
      options: {
        sortTailwindcss: {
          stylesheet: './mobile/src/global.css',
          functions: ['clsx', 'cn', 'cva', 'tv'],
          preserveWhitespace: true,
        },
      },
    })
  }

  if (selectedApps.has('backend')) {
    nextOverrides.push({
      files: ['backend/**/*'],
      options: {
        sortTailwindcss: {
          config: './backend/tailwind.config.js',
          preserveWhitespace: true,
        },
      },
    })
  }

  parsed.overrides = nextOverrides

  await writeIfChanged(filePath, source, `${JSON.stringify(parsed, null, 2)}\n`)
}
