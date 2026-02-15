import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { applyConditionalFileRules, pruneCiWorkflows } from '../src/conditional-rules.js'

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
})
