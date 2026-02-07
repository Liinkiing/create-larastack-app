import { execFileSync } from 'node:child_process'

function runAndRead(command: string, args: string[]): string | undefined {
  try {
    const output = execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()

    return output || undefined
  } catch {
    return undefined
  }
}

export async function detectGitHubUsername(): Promise<string | undefined> {
  const envHints = [
    process.env.GITHUB_USER,
    process.env.GITHUB_USERNAME,
    process.env.GH_USER,
  ]

  for (const value of envHints) {
    const candidate = value?.trim()
    if (candidate) {
      return candidate
    }
  }

  const ghLogin = runAndRead('gh', ['api', 'user', '--jq', '.login'])
  if (ghLogin) {
    return ghLogin
  }

  const gitHubConfig = runAndRead('git', ['config', '--get', 'github.user'])
  if (gitHubConfig) {
    return gitHubConfig
  }

  return undefined
}

export async function detectGitAuthor(): Promise<string | undefined> {
  const gitName = runAndRead('git', ['config', '--get', 'user.name'])
  const gitEmail = runAndRead('git', ['config', '--get', 'user.email'])

  if (!gitName || !gitEmail) {
    return undefined
  }

  return `${gitName} <${gitEmail}>`
}
