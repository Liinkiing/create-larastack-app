import type { ReplacementContext } from './types.js'

export interface ReplacementEntry {
  from: string
  to: string
}

export function buildReplacementEntries(context: ReplacementContext): ReplacementEntry[] {
  const entries: ReplacementEntry[] = [
    {
      from: 'com.liinkiing.larastack',
      to: context.mobileBundleId,
    },
    {
      from: 'git@github.com:liinkiing/larastack.git',
      to: `git@github.com:${context.githubUser}/${context.repositorySlug}.git`,
    },
    {
      from: 'git@github.com:Liinkiing/larastack.git',
      to: `git@github.com:${context.githubUser}/${context.repositorySlug}.git`,
    },
    {
      from: 'https://github.com/Liinkiing/larastack.git',
      to: `https://github.com/${context.githubUser}/${context.repositorySlug}.git`,
    },
    {
      from: 'https://github.com/liinkiing/larastack.git',
      to: `https://github.com/${context.githubUser}/${context.repositorySlug}.git`,
    },
    {
      from: 'https://github.com/Liinkiing/larastack',
      to: `https://github.com/${context.githubUser}/${context.repositorySlug}`,
    },
    {
      from: 'https://github.com/liinkiing/larastack',
      to: `https://github.com/${context.githubUser}/${context.repositorySlug}`,
    },
    {
      from: '@larastack/',
      to: `@${context.npmScope}/`,
    },
    {
      from: '<project_id>',
      to: context.easProjectId ?? '<project_id>',
    },
    {
      from: 'Larastack',
      to: context.projectDisplayName,
    },
    {
      from: 'larastack',
      to: context.projectSlug,
    },
    {
      from: 'Liinkiing',
      to: context.githubUser,
    },
    {
      from: 'liinkiing',
      to: context.githubUserLower,
    },
  ]

  return entries.sort((left, right) => right.from.length - left.from.length)
}

export function applyReplacements(input: string, replacements: ReplacementEntry[]): string {
  let output = input

  for (const replacement of replacements) {
    output = output.split(replacement.from).join(replacement.to)
  }

  return output
}
