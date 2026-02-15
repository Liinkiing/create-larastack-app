import type { Transformer } from './types.js'

import { assertNever, readProfileOption, readTextFile, writeIfChanged } from './shared.js'

export const transformPhpRoutesWeb: Transformer = async ({ filePath, options, ruleId }) => {
  const profile = readProfileOption(options, ['no-frontend'] as const, ruleId)

  const source = await readTextFile(filePath, ruleId)

  switch (profile) {
    case 'no-frontend': {
      if (source.trim() !== '<?php') {
        await writeIfChanged(filePath, source, '<?php\n')
      }
      break
    }

    default: {
      assertNever(profile, 'php.routes.web profile')
    }
  }
}
