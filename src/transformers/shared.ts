import MagicString from 'magic-string'
import { readFile, writeFile } from 'node:fs/promises'
import { Engine } from 'php-parser'

export { assertNever } from '../assert-never.js'

export type PhpNode = Record<string, unknown> & {
  kind?: string
  loc?: {
    start?: {
      offset?: number
    }
    end?: {
      offset?: number
    }
  }
}

const phpEngine = new Engine({
  ast: {
    withPositions: true,
  },
  parser: {
    php7: true,
  },
})

export async function readTextFile(filePath: string, ruleId: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    throw new Error(`Rule "${ruleId}" transform file does not exist: ${filePath}. ${errorMessage(error)}`)
  }
}

export async function writeIfChanged(filePath: string, before: string, after: string): Promise<void> {
  if (before === after) {
    return
  }

  await writeFile(filePath, after, 'utf8')
}

export function parsePhp(source: string, filePath: string, ruleId: string): PhpNode {
  try {
    return phpEngine.parseCode(source, filePath) as unknown as PhpNode
  } catch (error) {
    throw new Error(`Rule "${ruleId}" could not parse PHP file ${filePath}: ${errorMessage(error)}`)
  }
}

export function readProfileOption<const T extends string>(
  options: Record<string, unknown> | undefined,
  allowedValues: readonly T[],
  ruleId: string,
): T {
  const profile = options?.profile

  if (typeof profile !== 'string' || !allowedValues.some(allowedValue => allowedValue === profile)) {
    throw new Error(
      `Rule "${ruleId}" transform options.profile must be one of ${allowedValues.map(value => `"${value}"`).join(', ')}.`,
    )
  }

  return profile as T
}

export function findClassNode(ast: PhpNode): PhpNode {
  const classNode = findNodes(ast, node => node.kind === 'class')[0]

  if (!classNode) {
    throw new Error('Could not find class declaration in PHP file.')
  }

  return classNode
}

export function findUsersSchemaCreateClosureStatements(ast: PhpNode, ruleId: string): PhpNode[] {
  const callNodes = findNodes(ast, node => node.kind === 'call')

  for (const callNode of callNodes) {
    if (!isRecord(callNode.what) || callNode.what.kind !== 'staticlookup') {
      continue
    }

    const staticLookup = callNode.what

    if (!isRecord(staticLookup.what) || staticLookup.what.kind !== 'name' || staticLookup.what.name !== 'Schema') {
      continue
    }

    const methodName = readIdentifierName(staticLookup.offset)

    if (methodName !== 'create') {
      continue
    }

    if (!Array.isArray(callNode.arguments) || callNode.arguments.length < 2) {
      continue
    }

    const [tableArg, closureArg] = callNode.arguments

    if (!isRecord(tableArg) || tableArg.kind !== 'string' || tableArg.value !== 'users') {
      continue
    }

    if (!isRecord(closureArg) || closureArg.kind !== 'closure' || !isRecord(closureArg.body)) {
      continue
    }

    const bodyChildren = closureArg.body.children

    if (!Array.isArray(bodyChildren)) {
      continue
    }

    return bodyChildren.filter(isRecord)
  }

  throw new Error(`Rule "${ruleId}" could not find Schema::create('users', ...) closure.`)
}

export function findTopLevelReturnArray(ast: PhpNode, ruleId: string): { items: unknown[] } {
  const returnNodes = findNodes(ast, node => node.kind === 'return')

  for (const returnNode of returnNodes) {
    if (!isRecord(returnNode.expr) || returnNode.expr.kind !== 'array' || !Array.isArray(returnNode.expr.items)) {
      continue
    }

    return { items: returnNode.expr.items }
  }

  throw new Error(`Rule "${ruleId}" could not find top-level return array.`)
}

export function removeUseImports(source: string, magic: MagicString, ast: PhpNode, importNames: string[]): void {
  const importsToRemove = new Set(importNames)
  const useGroups = findNodes(ast, node => node.kind === 'usegroup')

  for (const useGroup of useGroups) {
    if (!Array.isArray(useGroup.items)) {
      continue
    }

    const matches = useGroup.items.some(item => {
      if (!isRecord(item) || typeof item.name !== 'string') {
        return false
      }

      return importsToRemove.has(item.name)
    })

    if (!matches) {
      continue
    }

    const [start, end] = wholeLineRange(source, useGroup, 'remove-use-import')
    magic.remove(start, end)
  }
}

export function removeTraitUsage(source: string, magic: MagicString, classNode: PhpNode, traitName: string): void {
  const classBody = Array.isArray(classNode.body) ? classNode.body.filter(isRecord) : []

  for (const classChild of classBody) {
    if (classChild.kind !== 'traituse' || !Array.isArray(classChild.traits)) {
      continue
    }

    const traitNames = classChild.traits
      .filter(isRecord)
      .map(traitNode => readPhpNameValue(traitNode))
      .filter((value): value is string => Boolean(value))

    if (!traitNames.includes(traitName)) {
      continue
    }

    const nextTraits = traitNames.filter(name => name !== traitName)
    const [start, end] = nodeRange(classChild, 'trait use')

    if (nextTraits.length === 0) {
      const [lineStart, lineEnd] = wholeLineRange(source, classChild, 'trait use')
      magic.remove(lineStart, lineEnd)
      continue
    }

    const indentation = lineIndentationAt(source, start)
    magic.overwrite(start, end, `${indentation}use ${nextTraits.join(', ')};`)
  }
}

export function removeArrayEntriesFromUserProperty(
  source: string,
  magic: MagicString,
  classNode: PhpNode,
  propertyName: string,
  valuesToRemove: string[],
): void {
  const classBody = Array.isArray(classNode.body) ? classNode.body.filter(isRecord) : []
  const targets = new Set(valuesToRemove)

  for (const classChild of classBody) {
    if (classChild.kind !== 'propertystatement' || !Array.isArray(classChild.properties)) {
      continue
    }

    for (const property of classChild.properties) {
      if (
        !isRecord(property) ||
        !isRecord(property.name) ||
        property.name.name !== propertyName ||
        !isRecord(property.value)
      ) {
        continue
      }

      if (property.value.kind !== 'array' || !Array.isArray(property.value.items)) {
        continue
      }

      for (const entry of property.value.items) {
        if (!isRecord(entry) || entry.kind !== 'entry') {
          continue
        }

        const value = readPhpStringValue(entry.value)

        if (!value || !targets.has(value)) {
          continue
        }

        const [start, end] = wholeLineRange(source, entry, 'array entry')
        magic.remove(start, end)
      }
    }
  }
}

export function removeArrayEntriesFromUserCasts(
  source: string,
  magic: MagicString,
  classNode: PhpNode,
  keysToRemove: string[],
): void {
  const classBody = Array.isArray(classNode.body) ? classNode.body.filter(isRecord) : []
  const targets = new Set(keysToRemove)

  for (const classChild of classBody) {
    if (
      classChild.kind !== 'method' ||
      !isRecord(classChild.name) ||
      classChild.name.name !== 'casts' ||
      !isRecord(classChild.body)
    ) {
      continue
    }

    const bodyChildren = Array.isArray(classChild.body.children) ? classChild.body.children.filter(isRecord) : []
    const returnStatement = bodyChildren.find(child => child.kind === 'return')

    if (!returnStatement || !isRecord(returnStatement.expr) || returnStatement.expr.kind !== 'array') {
      continue
    }

    const items = Array.isArray(returnStatement.expr.items) ? returnStatement.expr.items : []

    for (const item of items) {
      if (!isRecord(item) || item.kind !== 'entry') {
        continue
      }

      const key = readPhpStringValue(item.key)

      if (!key || !targets.has(key)) {
        continue
      }

      const [start, end] = wholeLineRange(source, item, 'casts entry')
      magic.remove(start, end)
    }
  }
}

export function removeRouteStatements(source: string, magic: MagicString, ast: PhpNode, routePaths: string[]): void {
  const targetPaths = new Set(routePaths)
  const statements = findNodes(ast, node => node.kind === 'expressionstatement')

  for (const statement of statements) {
    const routePath = extractRoutePath(statement)

    if (!routePath || !targetPaths.has(routePath)) {
      continue
    }

    const [start, end] = wholeLineRange(source, statement, 'route statement')
    magic.remove(start, end)
  }
}

export function readTableColumnName(statement: PhpNode): string | undefined {
  if (!isRecord(statement.expression) || statement.expression.kind !== 'call') {
    return undefined
  }

  const callNode = statement.expression

  if (!isRecord(callNode.what) || callNode.what.kind !== 'propertylookup') {
    return undefined
  }

  const methodName = readIdentifierName(callNode.what.offset)

  if (!methodName || !Array.isArray(callNode.arguments) || callNode.arguments.length === 0) {
    return undefined
  }

  const firstArgument = callNode.arguments[0]

  if (!isRecord(firstArgument) || firstArgument.kind !== 'string' || typeof firstArgument.value !== 'string') {
    return undefined
  }

  if (!['string', 'text'].includes(methodName)) {
    return undefined
  }

  return firstArgument.value
}

export function extractEnvKey(line: string): string | undefined {
  if (!line || line.startsWith('#')) {
    return undefined
  }

  const separatorIndex = line.indexOf('=')

  if (separatorIndex === -1) {
    return undefined
  }

  const key = line.slice(0, separatorIndex).trim()

  if (!key) {
    return undefined
  }

  return key
}

export function findNodes(root: unknown, predicate: (node: PhpNode) => boolean): PhpNode[] {
  const matches: PhpNode[] = []

  walkPhpNodes(root, node => {
    if (predicate(node)) {
      matches.push(node)
    }
  })

  return matches
}

function walkPhpNodes(value: unknown, visit: (node: PhpNode) => void): void {
  if (!isRecord(value)) {
    return
  }

  if (typeof value.kind === 'string') {
    visit(value as PhpNode)
  }

  for (const childValue of Object.values(value)) {
    if (Array.isArray(childValue)) {
      for (const item of childValue) {
        walkPhpNodes(item, visit)
      }

      continue
    }

    walkPhpNodes(childValue, visit)
  }
}

function extractRoutePath(statement: PhpNode): string | undefined {
  if (!isRecord(statement.expression)) {
    return undefined
  }

  return extractRoutePathFromCall(statement.expression)
}

function extractRoutePathFromCall(node: PhpNode): string | undefined {
  if (node.kind !== 'call' || !isRecord(node.what)) {
    return undefined
  }

  if (node.what.kind === 'staticlookup') {
    if (!isRecord(node.what.what) || node.what.what.kind !== 'name' || node.what.what.name !== 'Route') {
      return undefined
    }

    if (!Array.isArray(node.arguments) || node.arguments.length === 0) {
      return undefined
    }

    const firstArgument = node.arguments[0]

    if (!isRecord(firstArgument) || firstArgument.kind !== 'string') {
      return undefined
    }

    return typeof firstArgument.value === 'string' ? firstArgument.value : undefined
  }

  if (node.what.kind === 'propertylookup' && isRecord(node.what.what)) {
    return extractRoutePathFromCall(node.what.what)
  }

  return undefined
}

function nodeRange(node: PhpNode, context: string): [number, number] {
  if (!node.loc?.start || !node.loc?.end) {
    throw new Error(`Missing location information for ${context}.`)
  }

  const start = node.loc.start.offset
  const end = node.loc.end.offset

  if (typeof start !== 'number' || typeof end !== 'number') {
    throw new Error(`Missing location offsets for ${context}.`)
  }

  return [start, end]
}

export function wholeLineRange(source: string, node: PhpNode, context: string): [number, number] {
  const [start, end] = nodeRange(node, context)
  const lineStart = source.lastIndexOf('\n', start - 1) + 1
  const newlineIndex = source.indexOf('\n', end)

  if (newlineIndex === -1) {
    return [lineStart, source.length]
  }

  return [lineStart, newlineIndex + 1]
}

function lineIndentationAt(source: string, offset: number): string {
  const lineStart = source.lastIndexOf('\n', offset - 1) + 1
  const linePrefix = source.slice(lineStart, offset)
  const match = linePrefix.match(/^\s*/)

  return match?.[0] ?? ''
}

function readIdentifierName(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  return typeof value.name === 'string' ? value.name : undefined
}

function readPhpStringValue(value: unknown): string | undefined {
  if (!isRecord(value) || value.kind !== 'string' || typeof value.value !== 'string') {
    return undefined
  }

  return value.value
}

function readPhpNameValue(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined
  }

  if (value.kind === 'name' && typeof value.name === 'string') {
    return value.name
  }

  return undefined
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
