import { readFile } from 'node:fs/promises'

import type { Transformer } from './types.js'

import { writeIfChanged } from './shared.js'

export const transformJsonOpencode: Transformer = async ({ filePath, selectedApps }) => {
  const source = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(source) as Record<string, unknown>

  const nextMcp: Record<string, unknown> = {
    'ark-ui': {
      type: 'local',
      command: ['npx', '-y', '@ark-ui/mcp'],
      enabled: true,
    },
  }

  if (selectedApps.has('backend')) {
    nextMcp['laravel-boost'] = {
      type: 'local',
      command: ['docker', 'exec', '-i', 'larastack-app-1', 'php', '/var/www/html/artisan', 'boost:mcp'],
      enabled: true,
    }
  }

  if (selectedApps.has('frontend')) {
    nextMcp.panda = {
      type: 'local',
      command: ['pnpm', '--filter', 'frontend', 'exec', 'panda', 'mcp'],
      enabled: true,
    }
  }

  parsed.mcp = nextMcp

  await writeIfChanged(filePath, source, `${JSON.stringify(parsed, null, 2)}\n`)
}
