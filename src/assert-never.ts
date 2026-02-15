export function assertNever(value: never, context: string): never {
  throw new Error(`Unreachable case (${context}): ${String(value)}`)
}
