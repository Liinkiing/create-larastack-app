import type { Transformer } from './types.js'

import { readTextFile, writeIfChanged } from './shared.js'

const MANAGED_SERVER_NAMES = new Set(['laravel-boost', 'ark-ui', 'panda', 'uniwind'])

export const transformTomlCodex: Transformer = async ({ filePath, ruleId, selectedApps }) => {
  const source = await readTextFile(filePath, ruleId)
  const sections = splitSections(source)

  const preservedSections = sections.filter(section => {
    const serverName = readManagedServerName(section)

    return serverName === undefined || !MANAGED_SERVER_NAMES.has(serverName)
  })

  const managedSections = buildManagedSections(selectedApps)
  const nextSections = [...preservedSections, ...managedSections]
  const nextSource = nextSections.join('\n\n').trim()
  const normalizedNextSource = nextSource ? `${nextSource}\n` : ''

  await writeIfChanged(filePath, source, normalizedNextSource)
}

function splitSections(source: string): string[] {
  const trimmedSource = source.trim()

  if (!trimmedSource) {
    return []
  }

  return trimmedSource
    .split(/\n{2,}/)
    .map(section => section.trim())
    .filter(Boolean)
}

function readManagedServerName(section: string): string | undefined {
  const firstLine = section.split('\n', 1)[0]?.trim()
  const match = firstLine?.match(/^\[mcp_servers\.(.+)]$/)

  return match?.[1]
}

function buildManagedSections(selectedApps: Set<string>): string[] {
  const sections: string[] = []

  if (selectedApps.has('backend')) {
    sections.push(
      [
        '[mcp_servers.laravel-boost]',
        'command = "docker"',
        'args = ["exec", "-i", "larastack-app-1", "php", "/var/www/html/artisan", "boost:mcp"]',
      ].join('\n'),
    )
  }

  if (selectedApps.has('frontend')) {
    sections.push(['[mcp_servers.ark-ui]', 'command = "npx"', 'args = ["-y", "@ark-ui/mcp"]'].join('\n'))
    sections.push(
      ['[mcp_servers.panda]', 'command = "pnpm"', 'args = ["--filter", "frontend", "exec", "panda", "mcp"]'].join('\n'),
    )
  }

  if (selectedApps.has('mobile')) {
    sections.push(['[mcp_servers.uniwind]', 'url = "https://docs.uniwind.dev/mcp"'].join('\n'))
  }

  return sections
}
