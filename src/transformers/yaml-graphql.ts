import { readFile } from 'node:fs/promises'
import { parse, stringify } from 'yaml'

import type { Transformer } from './types.js'

import { writeIfChanged } from './shared.js'

export const transformYamlGraphql: Transformer = async ({ filePath, selectedApps }) => {
  const source = await readFile(filePath, 'utf8')
  const parsed = (parse(source) ?? {}) as Record<string, unknown>
  const projects: Record<string, unknown> = {}

  if (selectedApps.has('frontend')) {
    projects.frontend = {
      schema: ['./frontend/client.schema.graphql', './frontend/schema.graphql'],
      documents: './frontend/**/*.graphql',
    }
  }

  if (selectedApps.has('backend')) {
    projects.backend = {
      include: [
        './backend/schema-directives.graphql',
        './backend/programmatic-types.graphql',
        './backend/graphql/**/*.graphql',
      ],
      schema: './backend/graphql/schema.graphql',
    }
  }

  if (selectedApps.has('mobile')) {
    projects.mobile = {
      schema: ['./mobile/client.schema.graphql', './mobile/schema.graphql'],
      documents: ['./mobile/src/**/*.ts', './mobile/src/**/*.tsx', './mobile/src/**/*.graphql'],
    }
  }

  parsed.projects = projects

  await writeIfChanged(filePath, source, stringify(parsed))
}
