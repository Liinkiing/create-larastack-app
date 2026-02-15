import { access, cp, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parse as parseYaml } from 'yaml'

import { applyConditionalFileRules } from '../src/conditional-rules.js'
import { APP_CHOICES, type AppChoice } from '../src/types.js'

interface SmokeArguments {
  templateDir: string
  apps: AppChoice[]
}

const EXPECTED_COPY_PATHS = [
  '.create-larastack',
  '.github',
  'backend',
  'frontend',
  'mobile',
  'graphql.config.yml',
  'opencode.json',
]

void main()

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2))
  const selectedAppsSet = new Set(args.apps)
  const tempDirectory = await mkdtemp(join(tmpdir(), 'create-larastack-smoke-'))

  for (const relativePath of EXPECTED_COPY_PATHS) {
    await cp(join(args.templateDir, relativePath), join(tempDirectory, relativePath), {
      recursive: true,
      force: true,
      errorOnExist: false,
    })
  }

  await applyConditionalFileRules(tempDirectory, args.apps)

  await assertCondition(
    !(await pathExists(join(tempDirectory, '.create-larastack'))),
    '.create-larastack directory should be removed after rule application.',
  )

  for (const app of APP_CHOICES) {
    const expectedExists = selectedAppsSet.has(app)
    const actualExists = await pathExists(join(tempDirectory, app))

    await assertCondition(
      actualExists === expectedExists,
      `App folder mismatch for ${app}: expected ${expectedExists ? 'present' : 'removed'}.`,
    )
  }

  await assertGraphqlProjects(tempDirectory, selectedAppsSet)
  await assertOpencodeConfig(tempDirectory, selectedAppsSet)

  if (selectedAppsSet.has('backend')) {
    await assertBackendBehavior(tempDirectory, selectedAppsSet)
  }

  console.log(`Smoke test passed for apps: ${args.apps.join(',')}`)
}

function parseArguments(argv: string[]): SmokeArguments {
  const getValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag)

    if (index === -1) {
      return undefined
    }

    return argv[index + 1]
  }

  const templateDir = getValue('--template-dir')
  const appsValue = getValue('--apps')

  if (!templateDir) {
    throw new Error('Missing required argument: --template-dir')
  }

  if (!appsValue) {
    throw new Error('Missing required argument: --apps')
  }

  const apps = appsValue
    .split(',')
    .map(value => value.trim())
    .filter((value): value is AppChoice => APP_CHOICES.includes(value as AppChoice))

  if (apps.length === 0) {
    throw new Error('At least one valid app is required in --apps.')
  }

  return {
    templateDir,
    apps: [...new Set(apps)],
  }
}

async function assertGraphqlProjects(tempDirectory: string, selectedAppsSet: Set<AppChoice>): Promise<void> {
  const graphqlRaw = await readFile(join(tempDirectory, 'graphql.config.yml'), 'utf8')
  const graphqlConfig = parseYaml(graphqlRaw) as Record<string, unknown>
  const projects = readRecordField(graphqlConfig, 'projects')
  const projectKeys = Object.keys(projects).sort()
  const expectedKeys = [...selectedAppsSet].sort()

  await assertCondition(
    JSON.stringify(projectKeys) === JSON.stringify(expectedKeys),
    `graphql.config.yml projects mismatch. Expected ${expectedKeys.join(',')} got ${projectKeys.join(',')}`,
  )
}

async function assertOpencodeConfig(tempDirectory: string, selectedAppsSet: Set<AppChoice>): Promise<void> {
  const opencodeRaw = await readFile(join(tempDirectory, 'opencode.json'), 'utf8')
  const opencodeConfig = JSON.parse(opencodeRaw) as Record<string, unknown>
  const mcp = readRecordField(opencodeConfig, 'mcp')

  const hasArk = Object.hasOwn(mcp, 'ark-ui')
  const hasLaravelBoost = Object.hasOwn(mcp, 'laravel-boost')
  const hasPanda = Object.hasOwn(mcp, 'panda')

  await assertCondition(hasArk, 'opencode.json must always include ark-ui MCP server.')
  await assertCondition(
    hasLaravelBoost === selectedAppsSet.has('backend'),
    `opencode.json laravel-boost mismatch for selected apps ${[...selectedAppsSet].join(',')}`,
  )
  await assertCondition(
    hasPanda === selectedAppsSet.has('frontend'),
    `opencode.json panda mismatch for selected apps ${[...selectedAppsSet].join(',')}`,
  )
}

async function assertBackendBehavior(tempDirectory: string, selectedAppsSet: Set<AppChoice>): Promise<void> {
  const hasMobile = selectedAppsSet.has('mobile')
  const hasFrontend = selectedAppsSet.has('frontend')

  const userModel = await readFile(join(tempDirectory, 'backend/app/Models/User.php'), 'utf8')

  const oauthControllerExists = await pathExists(
    join(tempDirectory, 'backend/app/Http/Controllers/Auth/OAuthController.php'),
  )
  const mobileControllerExists = await pathExists(
    join(tempDirectory, 'backend/app/Http/Controllers/Auth/MobileGoogleAuthController.php'),
  )
  const personalAccessMigrationExists = await pathExists(
    join(tempDirectory, 'backend/database/migrations/0001_01_01_000004_create_personal_access_tokens_table.php'),
  )

  if (!hasMobile) {
    await assertCondition(
      !userModel.includes('HasApiTokens'),
      'User model should not include HasApiTokens without mobile app.',
    )
    await assertCondition(!mobileControllerExists, 'Mobile auth controller should be removed without mobile app.')
    await assertCondition(
      !personalAccessMigrationExists,
      'Personal access token migration should be removed without mobile app.',
    )
  } else {
    await assertCondition(
      userModel.includes('HasApiTokens'),
      'User model should keep HasApiTokens with mobile app selected.',
    )
    await assertCondition(mobileControllerExists, 'Mobile auth controller should exist with mobile app selected.')
    await assertCondition(
      personalAccessMigrationExists,
      'Personal access token migration should exist with mobile app selected.',
    )
  }

  if (!hasFrontend) {
    await assertCondition(!oauthControllerExists, 'OAuth controller should be removed without frontend app.')

    const webRoutes = await readFile(join(tempDirectory, 'backend/routes/web.php'), 'utf8')
    await assertCondition(
      webRoutes.trim() === '<?php',
      'backend/routes/web.php should be minimized without frontend app.',
    )
  } else {
    await assertCondition(oauthControllerExists, 'OAuth controller should exist when frontend app is selected.')
  }

  if (!hasFrontend && !hasMobile) {
    const apiRoutes = await readFile(join(tempDirectory, 'backend/routes/api.php'), 'utf8')
    await assertCondition(
      apiRoutes.trim() === '<?php',
      'backend/routes/api.php should be minimized for backend-only profile.',
    )
    await assertCondition(
      !userModel.includes('google_token') && !userModel.includes('google_refresh_token'),
      'User model should remove Google token fields for backend-only profile.',
    )
  }

  if (hasFrontend && !hasMobile) {
    const apiRoutes = await readFile(join(tempDirectory, 'backend/routes/api.php'), 'utf8')

    await assertCondition(
      !apiRoutes.includes('/auth/apple/mobile') &&
        !apiRoutes.includes('/auth/google/mobile') &&
        !apiRoutes.includes('/auth/mobile/logout'),
      'API routes should remove mobile auth routes when mobile app is not selected.',
    )
    await assertCondition(
      apiRoutes.includes('/user'),
      'API routes should keep /user route for backend+frontend profile.',
    )
    await assertCondition(
      userModel.includes('google_token') && userModel.includes('google_refresh_token'),
      'User model should keep Google token fields for backend+frontend profile.',
    )
  }
}

function readRecordField(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key]

  if (!isRecord(value)) {
    throw new Error(`Expected object at key "${key}".`)
  }

  return value
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

async function assertCondition(condition: boolean, message: string): Promise<void> {
  if (!condition) {
    throw new Error(message)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
