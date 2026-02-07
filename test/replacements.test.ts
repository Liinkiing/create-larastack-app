import { describe, expect, it } from 'vitest'

import { applyReplacements, buildReplacementEntries } from '../src/replacements.js'

describe('replacement entries', () => {
  it('replaces core Larastack placeholders', () => {
    const entries = buildReplacementEntries({
      projectDisplayName: 'Acme Stack',
      projectSlug: 'acme-stack',
      npmScope: 'acme-stack',
      githubUser: 'AcmeOrg',
      githubUserLower: 'acmeorg',
      repositorySlug: 'acme-stack',
      mobileBundleId: 'com.acmeorg.acmestack',
    })

    const input = 'Larastack :: larastack :: Liinkiing :: liinkiing :: com.liinkiing.larastack'
    const output = applyReplacements(input, entries)

    expect(output).toContain('Acme Stack')
    expect(output).toContain('acme-stack')
    expect(output).toContain('AcmeOrg')
    expect(output).toContain('acmeorg')
    expect(output).toContain('com.acmeorg.acmestack')
  })
})
