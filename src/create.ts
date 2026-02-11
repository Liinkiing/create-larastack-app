import { cancel, intro, isCancel, multiselect, note, outro, spinner, text } from '@clack/prompts'
import { basename, relative, resolve } from 'node:path'

import { detectGitAuthor, detectGitHubUsername } from './detect.js'
import { ensureEmptyDirectory } from './files.js'
import { generateProject } from './generate.js'
import { toDisplayName, toSlug } from './naming.js'
import { APP_CHOICES, type AppChoice, type CliRunOptions, type GenerationConfig } from './types.js'

const AUTHOR_FORMAT = /^([^<>]+)\s<([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)>$/
const APP_IDENTIFIER_FORMAT = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/

export async function runCreateApp(options: CliRunOptions): Promise<void> {
  intro('create-larastack-app')

  const targetInput =
    options.directory ??
    resolvePrompt(
      await text({
        message: 'Where should the project be created?',
        placeholder: 'my-larastack-app',
      }),
    )

  const targetDirectory = resolve(process.cwd(), targetInput)
  await ensureEmptyDirectory(targetDirectory)

  const defaultDisplayName = options.name ?? toDisplayName(basename(targetDirectory))

  const projectDisplayName =
    options.name ??
    resolvePrompt(
      await text({
        message: 'Application name?',
        initialValue: defaultDisplayName,
        validate: value => {
          if (!value.trim()) {
            return 'Application name is required.'
          }

          return undefined
        },
      }),
    )

  const selectedApps =
    options.apps ??
    resolvePrompt(
      await multiselect<AppChoice>({
        message: 'Which applications should be included?',
        options: [
          { label: 'Frontend (Next.js)', value: 'frontend' },
          { label: 'Backend (Laravel)', value: 'backend' },
          { label: 'Mobile (Expo)', value: 'mobile' },
        ],
        initialValues: [...APP_CHOICES],
        required: true,
      }),
    )

  if (selectedApps.length === 0) {
    throw new Error('Select at least one application (frontend, backend, or mobile).')
  }

  const needsMobileConfig = selectedApps.includes('mobile')

  const appIdentifier =
    options.appIdentifier ??
    (needsMobileConfig
      ? resolvePrompt(
          await text({
            message: 'Mobile app identifier?',
            placeholder: 'com.yourcompany.name',
            validate: value => validateAppIdentifier(value),
          }),
        )
      : undefined)

  const normalizedAppIdentifier = appIdentifier?.trim() || undefined

  if (needsMobileConfig && !normalizedAppIdentifier) {
    throw new Error('Mobile app identifier is required when mobile is selected.')
  }

  const easProjectId =
    options.easProjectId ??
    (needsMobileConfig
      ? resolvePrompt(
          await text({
            message: 'Expo EAS project ID? (optional)',
            placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
          }),
        )
      : undefined)

  const normalizedEasProjectId = easProjectId?.trim() || undefined

  const detectedGithubUser = await detectGitHubUsername()
  const detectedAuthor = await detectGitAuthor()

  const githubUser =
    options.githubUser ??
    resolvePrompt(
      await text({
        message: 'GitHub username for repository references?',
        initialValue: detectedGithubUser,
        validate: value => {
          if (!value.trim()) {
            return 'GitHub username is required.'
          }

          return undefined
        },
      }),
    )

  const authorInput =
    options.author ??
    resolvePrompt(
      await text({
        message: 'Author name for package.json? (John Doe <john@email.com>)',
        initialValue: detectedAuthor,
        validate: value => validateAuthor(value),
      }),
    )

  const authorValidationError = validateAuthor(authorInput)
  if (authorValidationError) {
    throw new Error(authorValidationError)
  }

  const projectSlug = toSlug(projectDisplayName)

  const config: GenerationConfig = {
    targetDirectory,
    projectDisplayName: projectDisplayName.trim(),
    projectSlug,
    selectedApps,
    mobileAppIdentifier: normalizedAppIdentifier,
    githubUser: githubUser.trim(),
    githubUserLower: githubUser.trim().toLowerCase(),
    author: authorInput.trim(),
    easProjectId: normalizedEasProjectId,
    templateSource: options.templateSource,
    templateRef: options.templateRef,
    initializeGit: options.git,
  }

  const progress = spinner()
  progress.start('Generating project files...')
  const result = await generateProject(config)
  progress.stop('Project generated')

  const relativeTarget = relative(process.cwd(), targetDirectory) || '.'

  const appSummary = selectedApps.join(', ')
  note(`Included apps: ${appSummary}`, 'Configuration')

  if (result.warnings.length > 0) {
    note(result.warnings.join('\n'), 'Warnings')
  }

  const nextSteps = [`cd ${relativeTarget}`, 'pnpm install']

  if (selectedApps.includes('backend')) {
    nextSteps.push('pnpm --filter ./backend dev')
  }

  if (selectedApps.includes('frontend')) {
    nextSteps.push('pnpm --filter ./frontend dev')
  }

  if (selectedApps.includes('mobile')) {
    nextSteps.push('pnpm --filter ./mobile start')
  }

  outro(`Done!\n\nNext steps:\n  ${nextSteps.join('\n  ')}`)
}

function validateAuthor(value: string): string | undefined {
  if (!value.trim()) {
    return 'Author is required.'
  }

  if (!AUTHOR_FORMAT.test(value.trim())) {
    return 'Use format: John Doe <john@email.com>'
  }

  return undefined
}

function validateAppIdentifier(value: string): string | undefined {
  const trimmed = value.trim()

  if (!trimmed) {
    return 'Mobile app identifier is required.'
  }

  if (!APP_IDENTIFIER_FORMAT.test(trimmed)) {
    return 'Use format like com.yourcompany.name'
  }

  return undefined
}

function resolvePrompt<T>(value: T | symbol): T {
  if (isCancel(value)) {
    cancel('Operation cancelled.')
    process.exit(0)
  }

  return value
}
