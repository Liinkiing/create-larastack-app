# create-larastack-app

Scaffold a Larastack-based monorepo from [`Liinkiing/larastack`](https://github.com/Liinkiing/larastack) with selectable applications:

- `frontend` (Next.js)
- `backend` (Laravel)
- `mobile` (Expo)

The CLI asks for:

- project folder
- application name
- included app folders (checkbox multiselect)
- mobile app identifier (required, when `mobile` is selected)
- GitHub username (auto-detected when possible)
- author (`John Doe <john@email.com>`, auto-filled from git config when possible)
- Expo EAS project ID (optional, when `mobile` is selected)

It then customizes placeholders like `Larastack`, `larastack`, and `liinkiing`, updates mobile identifiers, removes unselected app folders, and can initialize a fresh git repository.

## Template conditional file rules

The scaffold supports conditional file operations from a template manifest at:

- `.create-larastack/rules.json`

Manifest format:

```json
{
  "$schema": "https://raw.githubusercontent.com/Liinkiing/create-larastack-app/master/schemas/rules.schema.json",
  "version": 1,
  "rules": [
    {
      "id": "remove-backend-personal-access-token-migration",
      "when": {
        "allOf": [{ "appNotSelected": "mobile" }]
      },
      "operations": [
        {
          "type": "remove",
          "paths": ["backend/database/migrations/*personal_access_tokens*"]
        }
      ]
    }
  ]
}
```

Schema file in this repo:

- `schemas/rules.schema.json`

Supported operations:

- `remove`: remove files or directories by relative path or glob
- `copy`: copy file/directory from one relative path to another

Supported conditions:

- `appSelected`: run when an app is selected
- `appNotSelected`: run when an app is not selected

The `.create-larastack` folder is removed from generated projects after rules are applied.

## Requirements

- Node.js `>=22`
- Corepack enabled
- pnpm `>=10`

```bash
corepack enable
corepack use pnpm@10.8.0
```

## Usage

```bash
npx create-larastack-app@latest
```

```bash
pnpm create larastack-app
```

```bash
bun create larastack-app
```

You can also pass flags for non-interactive runs:

```bash
npx create-larastack-app@latest my-app \
  --name "My App" \
  --apps frontend,backend \
  --author "John Doe <john@email.com>" \
  --github-user mygithub
```

## CLI options

- `--name <name>`: Application display name
- `--apps <apps>`: Comma-separated list of `frontend,backend,mobile`
- `--app-identifier <id>`: Mobile app identifier (required when `mobile` is selected)
- `--github-user <username>`: GitHub username for owner/repository placeholders
- `--author <author>`: Author for package.json (`John Doe <john@email.com>`)
- `--eas-project-id <id>`: Expo EAS project ID (optional)
- `--template-source <source>`: Override template source (`github:Liinkiing/larastack` by default)
- `--template-ref <ref>`: Git reference for the template (`master` by default)
- `--no-git`: Skip `git init`

## Local development

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm run format:check
pnpm run test
pnpm run build
```

Run locally:

```bash
node dist/cli.js
```

## Release

Releases are manual and run from GitHub Actions with `release-it` + Conventional Commits.

1. Open Actions and run the `release` workflow.
2. Choose inputs:
   - `bump`: `auto` (recommended), or force `patch`, `minor`, `major`
   - `prerelease`: `none`, `alpha`, `beta`, `rc`
   - `dry-run`: `true` to preview, `false` to publish
3. Run it on `master`.

The workflow lints, typechecks, format-checks, tests, builds, updates `CHANGELOG.md`, creates the release commit/tag, publishes to npm, and creates a GitHub release.

Local equivalents:

```bash
pnpm run release:dry
pnpm run release
```

Conventional Commit bump rules:

- `fix:` -> patch
- `feat:` -> minor
- `BREAKING CHANGE:` (or `!`) -> major

If commits are only non-releasable types (`chore:`, `docs:`, `test:`...), use the workflow `bump` input to force a release.

For npm auth, this project uses npm Trusted Publishing (OIDC) in `.github/workflows/release.yml`.

Because the package name is `create-larastack-app`, users can run the short create commands:

- `pnpm create larastack-app`
- `bun create larastack-app`
