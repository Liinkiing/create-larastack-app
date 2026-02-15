import MagicString from 'magic-string'

import type { Transformer } from './types.js'

import {
  assertNever,
  findUsersSchemaCreateClosureStatements,
  parsePhp,
  readProfileOption,
  readTableColumnName,
  readTextFile,
  wholeLineRange,
  writeIfChanged,
} from './shared.js'

export const transformPhpMigrationUsers: Transformer = async ({ filePath, options, ruleId }) => {
  const profile = readProfileOption(options, ['no-mobile', 'backend-only'] as const, ruleId)
  const source = await readTextFile(filePath, ruleId)
  const ast = parsePhp(source, filePath, ruleId)
  let targetColumns: Set<string>

  switch (profile) {
    case 'no-mobile': {
      targetColumns = new Set(['apple_id'])
      break
    }

    case 'backend-only': {
      targetColumns = new Set(['google_id', 'google_token', 'google_refresh_token', 'apple_id'])
      break
    }

    default: {
      assertNever(profile, 'php.migration.users profile')
    }
  }

  const closureStatements = findUsersSchemaCreateClosureStatements(ast, ruleId)
  const magic = new MagicString(source)

  for (const statement of closureStatements) {
    if (statement.kind !== 'expressionstatement') {
      continue
    }

    const columnName = readTableColumnName(statement)

    if (!columnName || !targetColumns.has(columnName)) {
      continue
    }

    const [start, end] = wholeLineRange(source, statement, 'users migration column statement')
    magic.remove(start, end)
  }

  await writeIfChanged(filePath, source, magic.toString())
}
