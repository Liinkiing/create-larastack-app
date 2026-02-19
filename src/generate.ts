import { downloadTemplate } from 'giget'
import { spawnSync } from 'node:child_process'
import { copyFile, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, stringify } from 'yaml'

import type { AppChoice, GenerationConfig, ReplacementContext } from './types.js'

import { applyConditionalFileRules } from './conditional-rules.js'
import { isBinaryBuffer, walkFiles } from './files.js'
import { toIdentifierSegment } from './naming.js'
import { applyReplacements, buildReplacementEntries } from './replacements.js'

interface GenerationResult {
  warnings: string[]
}

type JsonObject = Record<string, unknown>

type MobileAppJsonConfig = Pick<
  GenerationConfig,
  'projectDisplayName' | 'projectSlug' | 'githubUserLower' | 'easProjectId'
>
type MobileAppJsonContext = Pick<ReplacementContext, 'mobileBundleId'>

export async function generateProject(config: GenerationConfig): Promise<GenerationResult> {
  if (config.selectedApps.includes('mobile') && !config.mobileAppIdentifier) {
    throw new Error('Mobile app identifier is required when mobile app is selected.')
  }

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

  await applyConditionalFileRules(config.targetDirectory, config.selectedApps)
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
    await copyBackendEnvExampleToEnv(config.targetDirectory)
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
    applyMobileAppJsonUpdates(data, config, replacementContext)
  })
}

export function applyMobileAppJsonUpdates(
  data: JsonObject,
  config: MobileAppJsonConfig,
  replacementContext: MobileAppJsonContext,
): void {
  data.name = config.projectDisplayName
  data.slug = config.projectSlug
  data.scheme = config.projectSlug
  data.owner = config.githubUserLower

  const ios = ensureObject(data, 'ios')
  ios.bundleIdentifier = replacementContext.mobileBundleId

  const android = ensureObject(data, 'android')
  android.package = replacementContext.mobileBundleId

  if (config.easProjectId) {
    const extra = ensureObject(data, 'extra')
    const eas = ensureObject(extra, 'eas')
    eas.projectId = config.easProjectId

    const updates = ensureObject(data, 'updates')
    updates.url = `https://u.expo.dev/${config.easProjectId}`
  }
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

export async function copyBackendEnvExampleToEnv(targetDirectory: string): Promise<void> {
  const envExamplePath = join(targetDirectory, 'backend', '.env.example')
  const envPath = join(targetDirectory, 'backend', '.env')

  try {
    await copyFile(envExamplePath, envPath)
  } catch {
    return
  }
}

function formatEnvValue(value: string): string {
  if (!/[\s"'$`]/.test(value)) {
    return value
  }

  const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  return `"${escaped}"`
}

async function updateJsonFile(filePath: string, updater: (data: JsonObject) => void): Promise<void> {
  let parsed: JsonObject

  try {
    const raw = await readFile(filePath, 'utf8')
    parsed = JSON.parse(raw) as JsonObject
  } catch {
    return
  }

  updater(parsed)
  await writeFile(filePath, `${JSON.stringify(parsed, null, 2)}\n`, 'utf8')
}

function ensureObject(data: JsonObject, key: string): JsonObject {
  const value = data[key]

  if (isJsonObject(value)) {
    return value
  }

  const next: JsonObject = {}
  data[key] = next
  return next
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    mobileBundleId: config.mobileAppIdentifier ?? `com.${ownerSegment}.${appSegment}`,
  }
}

function initializeGitRepository(targetDirectory: string): boolean {
  const result = spawnSync('git', ['init'], {
    cwd: targetDirectory,
    stdio: 'ignore',
  })

  return result.status === 0
}
