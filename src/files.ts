import { access, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const SKIP_DIRECTORIES = new Set(['.git', 'node_modules'])

export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function ensureEmptyDirectory(path: string): Promise<void> {
  const exists = await pathExists(path)

  if (!exists) {
    await mkdir(path, { recursive: true })
    return
  }

  const pathStat = await stat(path)
  if (!pathStat.isDirectory()) {
    throw new Error(`Target path "${path}" exists and is not a directory.`)
  }

  const entries = await readdir(path)
  if (entries.length > 0) {
    throw new Error(`Target directory "${path}" is not empty.`)
  }
}

export async function walkFiles(rootDirectory: string): Promise<string[]> {
  const collected: string[] = []

  async function walk(currentDirectory: string): Promise<void> {
    const entries = await readdir(currentDirectory, { withFileTypes: true })

    for (const entry of entries) {
      const entryPath = join(currentDirectory, entry.name)

      if (entry.isDirectory()) {
        if (SKIP_DIRECTORIES.has(entry.name)) {
          continue
        }

        await walk(entryPath)
        continue
      }

      if (entry.isFile()) {
        collected.push(entryPath)
      }
    }
  }

  await walk(rootDirectory)

  return collected
}

export function isBinaryBuffer(buffer: Buffer): boolean {
  const maxRead = Math.min(buffer.length, 8_000)

  for (let index = 0; index < maxRead; index += 1) {
    if (buffer[index] === 0) {
      return true
    }
  }

  return false
}
