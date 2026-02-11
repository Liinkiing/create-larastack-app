import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { pruneCiWorkflows } from '../src/generate.js'

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
