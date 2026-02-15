#!/usr/bin/env node

import { Command, InvalidArgumentError } from 'commander'
import { createRequire } from 'node:module'

import { runCreateApp } from './create.js'
import { APP_CHOICES, type AppChoice } from './types.js'

const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

function parseAppsOption(value: string): AppChoice[] {
  const parsed = value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)

  if (parsed.length === 0) {
    throw new InvalidArgumentError('At least one app must be provided.')
  }

  const unique = new Set<AppChoice>()

  for (const item of parsed) {
    if (!APP_CHOICES.includes(item as AppChoice)) {
      throw new InvalidArgumentError(`Invalid app "${item}". Allowed values: ${APP_CHOICES.join(', ')}.`)
    }

    unique.add(item as AppChoice)
  }

  return [...unique]
}

const program = new Command()

program
  .name('create-larastack-app')
  .version(version, '-v, --version', 'Display CLI version')
  .description('Scaffold a Larastack-based monorepo with selectable applications.')
  .addHelpText('beforeAll', `create-larastack-app v${version}\n\n`)
  .argument('[directory]', 'Directory to create the project in')
  .option('-n, --name <name>', 'Application display name')
  .option('-a, --apps <apps>', 'Comma-separated app list (frontend,backend,mobile)', parseAppsOption)
  .option('--app-identifier <id>', 'Mobile app identifier (required when mobile is selected)')
  .option('--github-user <username>', 'GitHub username used for owner placeholders')
  .option('--author <author>', 'Author for package.json (John Doe <john@email.com>)')
  .option('--eas-project-id <id>', 'Expo EAS project ID (optional)')
  .option('--template-source <source>', 'Template source override', 'github:Liinkiing/larastack')
  .option('--template-ref <ref>', 'Template git ref', 'master')
  .option('--no-git', 'Skip git repository initialization')
  .showHelpAfterError('(add --help for additional information)')
  .action(async (directory, options) => {
    await runCreateApp({
      directory,
      name: options.name,
      apps: options.apps,
      appIdentifier: options.appIdentifier,
      githubUser: options.githubUser,
      author: options.author,
      easProjectId: options.easProjectId,
      templateSource: options.templateSource,
      templateRef: options.templateRef,
      git: options.git,
    })
  })

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`\nError: ${message}`)
  process.exit(1)
})
