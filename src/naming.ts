const FALLBACK_SLUG = 'larastack-app'

export function toSlug(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')

  return normalized || FALLBACK_SLUG
}

export function toDisplayName(input: string): string {
  const cleaned = input
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  if (!cleaned) {
    return 'Larastack'
  }

  return cleaned
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

export function toIdentifierSegment(input: string, fallback: string): string {
  const fallbackSegment = fallback
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^[^a-z]+/g, '') || 'app'

  const cleaned = input.toLowerCase().replace(/[^a-z0-9]/g, '')
  const withFallback = cleaned || fallbackSegment

  if (/^[a-z]/.test(withFallback)) {
    return withFallback
  }

  return `${fallbackSegment}${withFallback}`
}
