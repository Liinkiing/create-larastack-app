export const APP_CHOICES = ['frontend', 'backend', 'mobile'] as const

export type AppChoice = (typeof APP_CHOICES)[number]

export interface CliRunOptions {
  directory?: string
  name?: string
  apps?: AppChoice[]
  appIdentifier?: string
  githubUser?: string
  author?: string
  easProjectId?: string
  templateSource: string
  templateRef: string
  git: boolean
}

export interface GenerationConfig {
  targetDirectory: string
  projectDisplayName: string
  projectSlug: string
  selectedApps: AppChoice[]
  mobileAppIdentifier?: string
  githubUser: string
  githubUserLower: string
  author: string
  easProjectId?: string
  templateSource: string
  templateRef: string
  initializeGit: boolean
}

export interface ReplacementContext {
  projectDisplayName: string
  projectSlug: string
  npmScope: string
  githubUser: string
  githubUserLower: string
  repositorySlug: string
  mobileBundleId: string
}
