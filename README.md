# create-larastack-app

Scaffold a Larastack-based monorepo from [`Liinkiing/larastack`](https://github.com/Liinkiing/larastack) with selectable applications:

- `frontend` (Next.js)
- `backend` (Laravel)
- `mobile` (Expo)

The CLI asks for:

- project folder
- application name
- included app folders (checkbox multiselect)
- GitHub username (auto-detected when possible)
- author (`John Doe <john@email.com>`, auto-filled from git config when possible)
- Expo EAS project ID (when `mobile` is selected)

It then customizes placeholders like `Larastack`, `larastack`, and `liinkiing`, updates mobile identifiers, removes unselected app folders, and can initialize a fresh git repository.

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
- `--github-user <username>`: GitHub username for owner/repository placeholders
- `--author <author>`: Author for package.json (`John Doe <john@email.com>`)
- `--eas-project-id <id>`: Expo EAS project ID (required when `mobile` is included)
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

## Publish

```bash
pnpm run build
npm publish --access public
```

Because the package name is `create-larastack-app`, users can run the short create commands:

- `pnpm create larastack-app`
- `bun create larastack-app`
