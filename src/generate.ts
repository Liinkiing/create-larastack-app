import { downloadTemplate } from 'giget'
import { spawnSync } from 'node:child_process'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'

import type { AppChoice, GenerationConfig, ReplacementContext } from './types.js'

import { isBinaryBuffer, walkFiles } from './files.js'
import { toIdentifierSegment } from './naming.js'
import { applyReplacements, buildReplacementEntries } from './replacements.js'

interface GenerationResult {
  warnings: string[]
}

export async function generateProject(config: GenerationConfig): Promise<GenerationResult> {
  const templateSource = config.templateSource.includes('#')
    ? config.templateSource
    : `${config.templateSource}#${config.templateRef}`

  await downloadTemplate(templateSource, {
    dir: config.targetDirectory,
    force: true,
  })

  await rm(join(config.targetDirectory, '.git'), {
    recursive: true,
    force: true,
  })

  await pruneApplications(config.targetDirectory, config.selectedApps)
  await updateWorkspacePackages(config.targetDirectory, config.selectedApps)

  const replacementContext = buildReplacementContext(config)
  const replacements = buildReplacementEntries(replacementContext)

  await replaceTemplateTokens(config.targetDirectory, replacements)
  await applyStructuredUpdates(config, replacementContext)

  await rm(join(config.targetDirectory, 'pnpm-lock.yaml'), { force: true })

  const warnings: string[] = []
  if (config.initializeGit) {
    const gitReady = initializeGitRepository(config.targetDirectory)
    if (!gitReady) {
      warnings.push('Could not run `git init` automatically. Run it manually if needed.')
    }
  }

  return { warnings }
}

async function pruneApplications(targetDirectory: string, selectedApps: AppChoice[]): Promise<void> {
  const selected = new Set(selectedApps)
  const appFolders: AppChoice[] = ['frontend', 'backend', 'mobile']

  for (const appFolder of appFolders) {
    if (selected.has(appFolder)) {
      continue
    }

    await rm(join(targetDirectory, appFolder), {
      recursive: true,
      force: true,
    })
  }
}

async function updateWorkspacePackages(targetDirectory: string, selectedApps: AppChoice[]): Promise<void> {
  const workspacePath = join(targetDirectory, 'pnpm-workspace.yaml')

  try {
    const workspaceRaw = await readFile(workspacePath, 'utf8')
    const parsed = (parse(workspaceRaw) ?? {}) as { packages?: string[] }
    parsed.packages = selectedApps
    const updated = stringify(parsed)
    await writeFile(workspacePath, updated, 'utf8')
  } catch {
    // Keep going if file does not exist or cannot be parsed.
  }
}

async function replaceTemplateTokens(
  targetDirectory: string,
  replacements: ReturnType<typeof buildReplacementEntries>,
): Promise<void> {
  const files = await walkFiles(targetDirectory)

  for (const filePath of files) {
    let buffer: Buffer

    try {
      buffer = await readFile(filePath)
    } catch {
      continue
    }

    if (isBinaryBuffer(buffer)) {
      continue
    }

    const input = buffer.toString('utf8')
    const output = applyReplacements(input, replacements)

    if (input !== output) {
      await writeFile(filePath, output, 'utf8')
    }
  }
}

async function applyStructuredUpdates(config: GenerationConfig, replacementContext: ReplacementContext): Promise<void> {
  await updateRootPackageJson(config.targetDirectory, replacementContext, config.author)
  await updateWorkspacePackagesJson(config.targetDirectory, replacementContext, config.selectedApps)

  if (config.selectedApps.includes('backend')) {
    await updateBackendEnvExample(config.targetDirectory, config.projectDisplayName)
  }

  if (config.selectedApps.includes('mobile')) {
    await updateMobileAppJson(config.targetDirectory, config, replacementContext)
  }
}

async function updateRootPackageJson(
  targetDirectory: string,
  replacementContext: ReplacementContext,
  author: string,
): Promise<void> {
  const packagePath = join(targetDirectory, 'package.json')

  await updateJsonFile(packagePath, data => {
    data.name = `@${replacementContext.npmScope}/workspace`
    data.author = author
    data.repository = `git@github.com:${replacementContext.githubUser}/${replacementContext.repositorySlug}.git`
  })
}

async function updateWorkspacePackagesJson(
  targetDirectory: string,
  replacementContext: ReplacementContext,
  selectedApps: AppChoice[],
): Promise<void> {
  const nameMap: Record<AppChoice, string> = {
    frontend: `@${replacementContext.npmScope}/frontend`,
    backend: `@${replacementContext.npmScope}/backend`,
    mobile: `@${replacementContext.npmScope}/mobile`,
  }

  for (const app of selectedApps) {
    const packagePath = join(targetDirectory, app, 'package.json')

    await updateJsonFile(packagePath, data => {
      data.name = nameMap[app]
    })
  }
}

async function updateMobileAppJson(
  targetDirectory: string,
  config: GenerationConfig,
  replacementContext: ReplacementContext,
): Promise<void> {
  const appJsonPath = join(targetDirectory, 'mobile', 'app.json')

  await updateJsonFile(appJsonPath, data => {
    const expo = (data.expo ??= {})

    expo.name = config.projectDisplayName
    expo.slug = config.projectSlug
    expo.scheme = config.projectSlug
    expo.owner = config.githubUserLower

    expo.ios ??= {}
    expo.ios.bundleIdentifier = replacementContext.mobileBundleId

    expo.android ??= {}
    expo.android.package = replacementContext.mobileBundleId

    if (config.easProjectId) {
      expo.extra ??= {}
      expo.extra.eas ??= {}
      expo.extra.eas.projectId = config.easProjectId

      expo.updates ??= {}
      expo.updates.url = `https://u.expo.dev/${config.easProjectId}`
    }
  })
}

async function updateBackendEnvExample(targetDirectory: string, projectDisplayName: string): Promise<void> {
  const envPath = join(targetDirectory, 'backend', '.env.example')

  let content: string

  try {
    content = await readFile(envPath, 'utf8')
  } catch {
    return
  }

  const appNameValue = formatEnvValue(projectDisplayName)
  const updated = content.replace(/^APP_NAME=.*$/m, `APP_NAME=${appNameValue}`)

  if (updated !== content) {
    await writeFile(envPath, updated, 'utf8')
  }
}

function formatEnvValue(value: string): string {
  if (!/[\s"'$`]/.test(value)) {
    return value
  }

  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

async function updateJsonFile(filePath: string, updater: (data: Record<string, any>) => void): Promise<void> {
  let parsed: Record<string, any>

  try {
    const raw = await readFile(filePath, 'utf8')
    parsed = JSON.parse(raw) as Record<string, any>
  } catch {
    return
  }

  updater(parsed)
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
}

function buildReplacementContext(config: GenerationConfig): ReplacementContext {
  const ownerSegment = toIdentifierSegment(config.githubUserLower, 'user')
  const appSegment = toIdentifierSegment(config.projectSlug, 'app')

  return {
    projectDisplayName: config.projectDisplayName,
    projectSlug: config.projectSlug,
    npmScope: config.projectSlug,
    githubUser: config.githubUser,
    githubUserLower: config.githubUserLower,
    repositorySlug: config.projectSlug,
    mobileBundleId: `com.${ownerSegment}.${appSegment}`,
  }
}

function initializeGitRepository(targetDirectory: string): boolean {
  const result = spawnSync('git', ['init'], {
    cwd: targetDirectory,
    stdio: 'ignore',
  })

  return result.status === 0
}
