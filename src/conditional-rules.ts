import { access, cp, glob, readFile, rm } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'

import { assertNever } from './assert-never.js'
import { AVAILABLE_TRANSFORMERS, isTransformerId, type TransformerId } from './transformers/ids.js'
import { executeNamedTransform } from './transformers/index.js'
import { APP_CHOICES, type AppChoice } from './types.js'

export const CONDITIONAL_RULES_MANIFEST_PATH = '.create-larastack/rules.json'

const WORKFLOW_FILES_BY_APP: Record<AppChoice, string[]> = {
  frontend: ['frontend-ci.yaml', 'frontend-ci.yml'],
  backend: ['backend-ci.yaml', 'backend-ci.yml'],
  mobile: ['mobile-ci.yaml', 'mobile-ci.yml'],
}

const GLOB_PATTERN = /[*?{}[\]]/

type ConditionClause =
  | {
      appSelected: AppChoice
    }
  | {
      appNotSelected: AppChoice
    }

interface RuleCondition {
  allOf?: ConditionClause[]
  anyOf?: ConditionClause[]
  noneOf?: ConditionClause[]
}

type RuleOperation =
  | {
      type: 'remove'
      paths: string[]
    }
  | {
      type: 'copy'
      from: string
      to: string
    }
  | {
      type: 'transform'
      path: string
      transform: TransformerId
      options?: Record<string, unknown>
    }

interface ConditionalRule {
  id: string
  when?: RuleCondition
  operations: RuleOperation[]
}

interface ConditionalRulesManifest {
  version: 1
  rules: ConditionalRule[]
}

export async function applyConditionalFileRules(targetDirectory: string, selectedApps: AppChoice[]): Promise<void> {
  const templateRules = await loadTemplateConditionalRules(targetDirectory)
  const rules = [...buildDefaultSelectionRules(), ...templateRules]

  await runConditionalRules(targetDirectory, selectedApps, rules)
  await rm(join(targetDirectory, '.create-larastack'), {
    recursive: true,
    force: true,
  })
}

export async function pruneCiWorkflows(targetDirectory: string, selectedApps: AppChoice[]): Promise<void> {
  await runConditionalRules(targetDirectory, selectedApps, buildWorkflowSelectionRules())
}

function buildDefaultSelectionRules(): ConditionalRule[] {
  const rules: ConditionalRule[] = []

  for (const app of APP_CHOICES) {
    const workflowPaths = WORKFLOW_FILES_BY_APP[app].map(workflowFile => `.github/workflows/${workflowFile}`)

    rules.push({
      id: `remove-${app}-files-when-not-selected`,
      when: {
        allOf: [{ appNotSelected: app }],
      },
      operations: [
        {
          type: 'remove',
          paths: [app, ...workflowPaths],
        },
      ],
    })
  }

  return rules
}

function buildWorkflowSelectionRules(): ConditionalRule[] {
  const rules: ConditionalRule[] = []

  for (const app of APP_CHOICES) {
    const workflowPaths = WORKFLOW_FILES_BY_APP[app].map(workflowFile => `.github/workflows/${workflowFile}`)

    rules.push({
      id: `remove-${app}-workflows-when-not-selected`,
      when: {
        allOf: [{ appNotSelected: app }],
      },
      operations: [
        {
          type: 'remove',
          paths: workflowPaths,
        },
      ],
    })
  }

  return rules
}

async function loadTemplateConditionalRules(targetDirectory: string): Promise<ConditionalRule[]> {
  const manifestPath = join(targetDirectory, CONDITIONAL_RULES_MANIFEST_PATH)

  let rawManifest: string

  try {
    rawManifest = await readFile(manifestPath, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) {
      return []
    }

    throw error
  }

  let parsedManifest: unknown

  try {
    parsedManifest = JSON.parse(rawManifest) as unknown
  } catch {
    throw new Error(`Invalid JSON in ${CONDITIONAL_RULES_MANIFEST_PATH}.`)
  }

  const manifest = validateManifest(parsedManifest)
  return manifest.rules
}

function validateManifest(value: unknown): ConditionalRulesManifest {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: expected an object.`)
  }

  if (value.version !== 1) {
    throw new Error(`Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: version must be 1.`)
  }

  if (!Array.isArray(value.rules)) {
    throw new Error(`Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules must be an array.`)
  }

  const seenRuleIds = new Set<string>()
  const rules = value.rules.map((rule, index) => validateRule(rule, index, seenRuleIds))

  return {
    version: 1,
    rules,
  }
}

function validateRule(value: unknown, index: number, seenRuleIds: Set<string>): ConditionalRule {
  if (!isRecord(value)) {
    throw new Error(`Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${index}] must be an object.`)
  }

  const id = typeof value.id === 'string' ? value.id.trim() : ''

  if (!id) {
    throw new Error(`Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${index}].id is required.`)
  }

  if (seenRuleIds.has(id)) {
    throw new Error(`Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: duplicate rule id "${id}".`)
  }

  seenRuleIds.add(id)

  const when = validateRuleCondition(value.when, index)
  const operations = validateOperations(value.operations, index)

  return {
    id,
    when,
    operations,
  }
}

function validateRuleCondition(value: unknown, ruleIndex: number): RuleCondition | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!isRecord(value)) {
    throw new Error(`Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].when must be an object.`)
  }

  return {
    allOf: validateConditionClauseList(value.allOf, ruleIndex, 'allOf'),
    anyOf: validateConditionClauseList(value.anyOf, ruleIndex, 'anyOf'),
    noneOf: validateConditionClauseList(value.noneOf, ruleIndex, 'noneOf'),
  }
}

function validateConditionClauseList(
  value: unknown,
  ruleIndex: number,
  fieldName: 'allOf' | 'anyOf' | 'noneOf',
): ConditionClause[] | undefined {
  if (value === undefined) {
    return undefined
  }

  if (!Array.isArray(value)) {
    throw new Error(
      `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].when.${fieldName} must be an array.`,
    )
  }

  return value.map((clause, clauseIndex) => validateConditionClause(clause, ruleIndex, fieldName, clauseIndex))
}

function validateConditionClause(
  value: unknown,
  ruleIndex: number,
  fieldName: 'allOf' | 'anyOf' | 'noneOf',
  clauseIndex: number,
): ConditionClause {
  if (!isRecord(value)) {
    throw new Error(
      `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].when.${fieldName}[${clauseIndex}] must be an object.`,
    )
  }

  if (typeof value.appSelected === 'string') {
    const app = value.appSelected as AppChoice
    ensureValidAppChoice(app, `rules[${ruleIndex}].when.${fieldName}[${clauseIndex}].appSelected`)
    return { appSelected: app }
  }

  if (typeof value.appNotSelected === 'string') {
    const app = value.appNotSelected as AppChoice
    ensureValidAppChoice(app, `rules[${ruleIndex}].when.${fieldName}[${clauseIndex}].appNotSelected`)
    return { appNotSelected: app }
  }

  throw new Error(
    `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].when.${fieldName}[${clauseIndex}] must define appSelected or appNotSelected.`,
  )
}

function ensureValidAppChoice(app: AppChoice, fieldPath: string): void {
  if (!APP_CHOICES.includes(app)) {
    throw new Error(
      `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: ${fieldPath} must be one of ${APP_CHOICES.join(', ')}.`,
    )
  }
}

function validateOperations(value: unknown, ruleIndex: number): RuleOperation[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(
      `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations must be a non-empty array.`,
    )
  }

  return value.map((operation, operationIndex) => validateOperation(operation, ruleIndex, operationIndex))
}

function validateOperation(value: unknown, ruleIndex: number, operationIndex: number): RuleOperation {
  if (!isRecord(value)) {
    throw new Error(
      `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}] must be an object.`,
    )
  }

  const operationType = value.type

  switch (operationType) {
    case 'remove': {
      if (
        !Array.isArray(value.paths) ||
        value.paths.length === 0 ||
        value.paths.some(pathValue => typeof pathValue !== 'string')
      ) {
        throw new Error(
          `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}].paths must be a non-empty string array.`,
        )
      }

      const normalizedPaths = value.paths.map(pathValue => pathValue.trim())

      if (normalizedPaths.some(pathValue => pathValue.length === 0 || pathValue === '.')) {
        throw new Error(
          `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}].paths cannot contain empty values or ".".`,
        )
      }

      return {
        type: 'remove',
        paths: normalizedPaths,
      }
    }

    case 'copy': {
      if (typeof value.from !== 'string' || typeof value.to !== 'string') {
        throw new Error(
          `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}] copy operation requires from and to strings.`,
        )
      }

      const from = value.from.trim()
      const to = value.to.trim()

      if (!from || !to || from === '.' || to === '.') {
        throw new Error(
          `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}] copy operation from/to cannot be empty or ".".`,
        )
      }

      return {
        type: 'copy',
        from,
        to,
      }
    }

    case 'transform': {
      if (typeof value.path !== 'string' || typeof value.transform !== 'string') {
        throw new Error(
          `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}] transform operation requires path and transform strings.`,
        )
      }

      const path = value.path.trim()
      const transform = value.transform.trim()

      if (!path || path === '.' || !transform) {
        throw new Error(
          `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}] transform operation path/transform cannot be empty.`,
        )
      }

      if (!isTransformerId(transform)) {
        throw new Error(
          `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}] transform must be one of ${AVAILABLE_TRANSFORMERS.join(', ')}.`,
        )
      }

      if (value.options !== undefined && !isRecord(value.options)) {
        throw new Error(
          `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}].options must be an object when provided.`,
        )
      }

      return {
        type: 'transform',
        path,
        transform,
        options: value.options,
      }
    }

    default: {
      throw new Error(
        `Invalid ${CONDITIONAL_RULES_MANIFEST_PATH}: rules[${ruleIndex}].operations[${operationIndex}].type must be "remove", "copy", or "transform".`,
      )
    }
  }
}

async function runConditionalRules(
  targetDirectory: string,
  selectedApps: AppChoice[],
  rules: ConditionalRule[],
): Promise<void> {
  const selectedAppsSet = new Set(selectedApps)

  for (const rule of rules) {
    if (!matchesRuleCondition(rule.when, selectedAppsSet)) {
      continue
    }

    for (const operation of rule.operations) {
      await executeRuleOperation(operation, targetDirectory, selectedApps, rule.id)
    }
  }
}

function matchesRuleCondition(condition: RuleCondition | undefined, selectedApps: Set<AppChoice>): boolean {
  if (!condition) {
    return true
  }

  if (condition.allOf && condition.allOf.some(clause => !matchesClause(clause, selectedApps))) {
    return false
  }

  if (
    condition.anyOf &&
    condition.anyOf.length > 0 &&
    condition.anyOf.every(clause => !matchesClause(clause, selectedApps))
  ) {
    return false
  }

  if (condition.noneOf && condition.noneOf.some(clause => matchesClause(clause, selectedApps))) {
    return false
  }

  return true
}

function matchesClause(clause: ConditionClause, selectedApps: Set<AppChoice>): boolean {
  if ('appSelected' in clause) {
    return selectedApps.has(clause.appSelected)
  }

  return !selectedApps.has(clause.appNotSelected)
}

async function executeRuleOperation(
  operation: RuleOperation,
  targetDirectory: string,
  selectedApps: AppChoice[],
  ruleId: string,
): Promise<void> {
  switch (operation.type) {
    case 'remove': {
      for (const pathPattern of operation.paths) {
        await removePathPattern(targetDirectory, pathPattern, ruleId)
      }

      break
    }

    case 'copy': {
      await copyPath(targetDirectory, operation.from, operation.to, ruleId)
      break
    }

    case 'transform': {
      const absolutePath = resolvePathWithinTarget(targetDirectory, operation.path, ruleId)
      const safePath = relative(targetDirectory, absolutePath)

      await executeNamedTransform({
        targetDirectory,
        selectedApps,
        ruleId,
        operation: {
          ...operation,
          path: safePath,
        },
      })

      break
    }

    default: {
      assertNever(operation, 'executeRuleOperation')
    }
  }
}

async function removePathPattern(targetDirectory: string, pathPattern: string, ruleId: string): Promise<void> {
  if (GLOB_PATTERN.test(pathPattern)) {
    for await (const matchedPath of glob(pathPattern, { cwd: targetDirectory })) {
      const absolutePath = resolvePathWithinTarget(targetDirectory, matchedPath, ruleId)

      await rm(absolutePath, {
        recursive: true,
        force: true,
      })
    }

    return
  }

  const absolutePath = resolvePathWithinTarget(targetDirectory, pathPattern, ruleId)

  await rm(absolutePath, {
    recursive: true,
    force: true,
  })
}

async function copyPath(targetDirectory: string, from: string, to: string, ruleId: string): Promise<void> {
  const fromPath = resolvePathWithinTarget(targetDirectory, from, ruleId)
  const toPath = resolvePathWithinTarget(targetDirectory, to, ruleId)

  try {
    await access(fromPath)
  } catch {
    throw new Error(`Rule "${ruleId}" copy source does not exist: ${from}`)
  }

  await cp(fromPath, toPath, {
    recursive: true,
    force: true,
    errorOnExist: false,
  })
}

function resolvePathWithinTarget(targetDirectory: string, value: string, ruleId: string): string {
  const resolvedPath = resolve(targetDirectory, value)
  const relativePath = relative(targetDirectory, resolvedPath)

  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error(`Rule "${ruleId}" points outside target directory: ${value}`)
  }

  return resolvedPath
}

function isMissingFileError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
