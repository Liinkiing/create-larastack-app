import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { applyConditionalFileRules, pruneCiWorkflows } from '../src/conditional-rules.js'
import { copyBackendEnvExampleToEnv } from '../src/generate.js'

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

describe('pruneCiWorkflows', () => {
  it('removes CI workflows for unselected apps only', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-'))

    try {
      const workflowsDirectory = join(tempDirectory, '.github', 'workflows')
      await mkdir(workflowsDirectory, { recursive: true })

      const frontendWorkflowPath = join(workflowsDirectory, 'frontend-ci.yaml')
      const backendWorkflowPath = join(workflowsDirectory, 'backend-ci.yaml')
      const mobileWorkflowPath = join(workflowsDirectory, 'mobile-ci.yaml')

      await Promise.all([
        writeFile(frontendWorkflowPath, 'frontend', 'utf8'),
        writeFile(backendWorkflowPath, 'backend', 'utf8'),
        writeFile(mobileWorkflowPath, 'mobile', 'utf8'),
      ])

      await pruneCiWorkflows(tempDirectory, ['frontend'])

      await expect(fileExists(frontendWorkflowPath)).resolves.toBe(true)
      await expect(fileExists(backendWorkflowPath)).resolves.toBe(false)
      await expect(fileExists(mobileWorkflowPath)).resolves.toBe(false)
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })
})

describe('applyConditionalFileRules', () => {
  it('removes backend personal access token migration when mobile is not selected', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-'))

    try {
      const migrationDirectory = join(tempDirectory, 'backend', 'database', 'migrations')
      await mkdir(migrationDirectory, { recursive: true })
      await mkdir(join(tempDirectory, '.create-larastack'), { recursive: true })

      const migrationPath = join(migrationDirectory, '2026_01_01_000000_create_personal_access_tokens_table.php')
      await writeFile(migrationPath, 'migration', 'utf8')

      await writeFile(
        join(tempDirectory, '.create-larastack', 'rules.json'),
        JSON.stringify(
          {
            version: 1,
            rules: [
              {
                id: 'remove-backend-personal-access-token-migration',
                when: {
                  allOf: [{ appNotSelected: 'mobile' }],
                },
                operations: [
                  {
                    type: 'remove',
                    paths: ['backend/database/migrations/*personal_access_tokens*'],
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
        'utf8',
      )

      await applyConditionalFileRules(tempDirectory, ['backend'])

      await expect(fileExists(migrationPath)).resolves.toBe(false)
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  it('keeps backend personal access token migration when mobile is selected', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-'))

    try {
      const migrationDirectory = join(tempDirectory, 'backend', 'database', 'migrations')
      await mkdir(migrationDirectory, { recursive: true })
      await mkdir(join(tempDirectory, '.create-larastack'), { recursive: true })

      const migrationPath = join(migrationDirectory, '2026_01_01_000000_create_personal_access_tokens_table.php')
      await writeFile(migrationPath, 'migration', 'utf8')

      await writeFile(
        join(tempDirectory, '.create-larastack', 'rules.json'),
        JSON.stringify(
          {
            version: 1,
            rules: [
              {
                id: 'remove-backend-personal-access-token-migration',
                when: {
                  allOf: [{ appNotSelected: 'mobile' }],
                },
                operations: [
                  {
                    type: 'remove',
                    paths: ['backend/database/migrations/*personal_access_tokens*'],
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
        'utf8',
      )

      await applyConditionalFileRules(tempDirectory, ['backend', 'mobile'])

      await expect(fileExists(migrationPath)).resolves.toBe(true)
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  it('applies transform operations for PHP user profile updates', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-'))

    try {
      await mkdir(join(tempDirectory, '.create-larastack'), { recursive: true })
      await mkdir(join(tempDirectory, 'backend', 'app', 'Models'), { recursive: true })

      const userModelPath = join(tempDirectory, 'backend', 'app', 'Models', 'User.php')

      await writeFile(
        userModelPath,
        `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Notifications\\Notifiable;
use Laravel\\Sanctum\\HasApiTokens;

class User
{
    use HasApiTokens, HasFactory, Notifiable;
}
`,
        'utf8',
      )

      await writeFile(
        join(tempDirectory, '.create-larastack', 'rules.json'),
        JSON.stringify(
          {
            version: 1,
            rules: [
              {
                id: 'transform-user-model',
                when: {
                  allOf: [{ appSelected: 'backend' }, { appNotSelected: 'mobile' }],
                },
                operations: [
                  {
                    type: 'transform',
                    path: 'backend/app/Models/User.php',
                    transform: 'php.user.applyProfile',
                    options: {
                      profile: 'no-mobile',
                    },
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
        'utf8',
      )

      await applyConditionalFileRules(tempDirectory, ['backend'])

      const output = await readFile(userModelPath, 'utf8')

      expect(output).not.toContain('Laravel\\Sanctum\\HasApiTokens')
      expect(output).not.toContain('use HasApiTokens,')
      expect(output).toContain('use HasFactory, Notifiable;')
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  it('applies graphql transform based on selected apps', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-'))

    try {
      await mkdir(join(tempDirectory, '.create-larastack'), { recursive: true })

      const graphqlConfigPath = join(tempDirectory, 'graphql.config.yml')

      await writeFile(
        graphqlConfigPath,
        `projects:
  frontend:
    schema:
      - './frontend/client.schema.graphql'
      - './frontend/schema.graphql'
    documents: './frontend/**/*.graphql'
  backend:
    include:
      - './backend/schema-directives.graphql'
      - './backend/programmatic-types.graphql'
      - './backend/graphql/**/*.graphql'
    schema: './backend/graphql/schema.graphql'
`,
        'utf8',
      )

      await writeFile(
        join(tempDirectory, '.create-larastack', 'rules.json'),
        JSON.stringify(
          {
            version: 1,
            rules: [
              {
                id: 'sync-graphql-config',
                operations: [
                  {
                    type: 'transform',
                    path: 'graphql.config.yml',
                    transform: 'yaml.graphql.syncProjects',
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
        'utf8',
      )

      await applyConditionalFileRules(tempDirectory, ['mobile'])

      const output = await readFile(graphqlConfigPath, 'utf8')

      expect(output).toContain('mobile:')
      expect(output).not.toContain('frontend:')
      expect(output).not.toContain('backend:')
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  it('fails in strict mode for unknown transform ids', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-'))

    try {
      await mkdir(join(tempDirectory, '.create-larastack'), { recursive: true })
      await writeFile(join(tempDirectory, 'example.txt'), 'hello', 'utf8')

      await writeFile(
        join(tempDirectory, '.create-larastack', 'rules.json'),
        JSON.stringify(
          {
            version: 1,
            rules: [
              {
                id: 'strict-unknown-transform',
                operations: [
                  {
                    type: 'transform',
                    path: 'example.txt',
                    transform: 'unknown.transform',
                  },
                ],
              },
            ],
          },
          null,
          2,
        ),
        'utf8',
      )

      await expect(applyConditionalFileRules(tempDirectory, ['frontend'])).rejects.toThrow('transform must be one of')
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })
})

describe('copyBackendEnvExampleToEnv', () => {
  it('copies backend env example to env file', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-'))

    try {
      const backendDirectory = join(tempDirectory, 'backend')
      const envExamplePath = join(backendDirectory, '.env.example')
      const envPath = join(backendDirectory, '.env')

      await mkdir(backendDirectory, { recursive: true })
      await writeFile(envExamplePath, 'APP_NAME=Larastack\n', 'utf8')

      await copyBackendEnvExampleToEnv(tempDirectory)

      await expect(readFile(envPath, 'utf8')).resolves.toBe('APP_NAME=Larastack\n')
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })

  it('does nothing when env example is missing', async () => {
    const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-'))

    try {
      const backendDirectory = join(tempDirectory, 'backend')
      const envPath = join(backendDirectory, '.env')

      await mkdir(backendDirectory, { recursive: true })
      await expect(copyBackendEnvExampleToEnv(tempDirectory)).resolves.toBeUndefined()
      await expect(fileExists(envPath)).resolves.toBe(false)
    } finally {
      await rm(tempDirectory, { recursive: true, force: true })
    }
  })
})
