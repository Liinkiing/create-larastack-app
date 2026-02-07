import { describe, expect, it } from 'vitest'

import { toDisplayName, toIdentifierSegment, toSlug } from '../src/naming.js'

describe('naming helpers', () => {
  it('creates slugs from user input', () => {
    expect(toSlug('My Awesome App')).toBe('my-awesome-app')
    expect(toSlug('  app___name  ')).toBe('app-name')
  })

  it('creates a display name from file-like names', () => {
    expect(toDisplayName('my-awesome_app')).toBe('My Awesome App')
    expect(toDisplayName('myCoolApp')).toBe('My Cool App')
  })

  it('creates identifier-safe segments for mobile package ids', () => {
    expect(toIdentifierSegment('liinkiing-dev', 'user')).toBe('liinkiingdev')
    expect(toIdentifierSegment('123-app', 'app')).toBe('app123app')
  })
})
