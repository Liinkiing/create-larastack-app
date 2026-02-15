# AGENTS.md

Guidance for coding agents working in `create-larastack-app`.

## 1) Purpose and Scope

- This repository contains a Node.js CLI that scaffolds Larastack projects.
- Language is TypeScript (`moduleResolution: NodeNext`, strict mode enabled).
- Build output is emitted to `dist/` and published as `create-larastack-app`.
- Main entrypoint: `src/cli.ts`.
- Generation flow centers around `src/create.ts` and `src/generate.ts`.

## 2) Repo Layout (high signal files)

- `src/cli.ts`: CLI options and argument parsing.
- `src/create.ts`: interactive/non-interactive prompt orchestration.
- `src/generate.ts`: template download, token replacement, structured updates.
- `src/conditional-rules.ts`: conditional remove/copy rules engine.
- `src/replacements.ts`: placeholder mapping and replacement helpers.
- `src/types.ts`: shared app and config types.
- `test/generate.test.ts`: workflow pruning and conditional rule tests.
- `.github/workflows/release.yml`: canonical release path (OIDC trusted publishing).
- `.release-it.json`: release-it config used by CI workflow.

## 3) Install and Setup

- Node: `>=22`.
- Package manager: `pnpm` (see `packageManager` in `package.json`).
- Install deps: `pnpm install`.

## 4) Build / Lint / Test Commands

- `pnpm run dev`
  - Runs CLI locally via `tsx src/cli.ts`.
- `pnpm run build`
  - Compiles TypeScript using `tsconfig.build.json`.
- `pnpm run clean`
  - Removes `dist/`.
- `pnpm run typecheck`
  - Runs `tsc --noEmit` against full project.
- `pnpm run lint`
  - Runs `oxlint`.
- `pnpm run lint:fix`
  - Runs `oxlint` with auto-fixes.
- `pnpm run format`
  - Runs `oxfmt` write mode.
- `pnpm run format:check`
  - Runs formatting check only.
- `pnpm run test`
  - Runs full Vitest suite once.
- `pnpm run test:watch`
  - Runs Vitest watch mode.

## 5) Single-Test Execution (important)

- Single file:
  - `pnpm exec vitest run test/generate.test.ts`
- Single test by name:
  - `pnpm exec vitest run test/generate.test.ts -t "removes backend personal access token migration"`
- Alternative via package script forwarding:
  - `pnpm run test -- test/generate.test.ts -t "<test name>"`

## 6) Fast Validation Order for PRs

- Preferred quick loop for normal code changes:
  1. `pnpm run lint`
  2. `pnpm run typecheck`
  3. `pnpm run test`
  4. `pnpm run build`
- If Markdown/JSON changed, also run `pnpm run format:check`.

## 7) Commit and Hook Expectations

- Pre-commit hook runs `pnpm lint-staged`.
- Commit-msg hook runs `pnpm commitlint --edit`.
- Commit messages must follow Conventional Commits (`commitlint.config.cjs`).
- Common release bump semantics:
  - `fix:` => patch
  - `feat:` => minor
  - `BREAKING CHANGE` / `!` => major

## 8) Release Process (critical)

- ALWAYS release via GitHub Actions workflow, not local CLI release.
- Reason: npm trusted publishing is configured with OIDC in CI.
- Canonical workflow: `.github/workflows/release.yml`.
- Trigger command:
  - `gh workflow run release.yml --repo Liinkiing/create-larastack-app --ref master -f bump=auto -f prerelease=none -f dry-run=false`
- Monitor run:
  - `gh run list --repo Liinkiing/create-larastack-app --workflow release.yml --limit 1`
  - `gh run view <run-id> --repo Liinkiing/create-larastack-app`
- Do NOT use local `pnpm run release` / `pnpm run release:ci` for real releases.
- Local dry-runs are okay for debugging only.

## 9) TypeScript and Code Style

- Use strict, explicit typing; avoid `any` unless unavoidable.
- Prefer `unknown` + narrowing helpers (e.g., `isRecord`) for untyped input.
- Keep exported function signatures explicit.
- Use `type` imports where possible:
  - `import { APP_CHOICES, type AppChoice } from './types.js'`
- Local imports must include `.js` extension in source files (NodeNext runtime compatibility).
- Prefer small pure helpers for validation/transforms.
- Keep side effects localized in orchestration functions.

## 10) Imports and Module Conventions

- Order imports by category:
  1. external packages
  2. `node:*` built-ins
  3. local modules
- Separate type imports when it improves clarity.
- Avoid deep re-export chains; import from concrete local modules.

## 11) Naming Conventions

- Functions: `camelCase` verbs (`generateProject`, `updateJsonFile`).
- Constants: `UPPER_SNAKE_CASE` for immutable shared constants (`APP_CHOICES`).
- Types/interfaces: `PascalCase` (`GenerationConfig`, `ReplacementContext`).
- Prefer descriptive names over abbreviations in core pipeline code.

## 12) Error Handling Guidelines

- Throw `Error` with actionable messages for user-facing failures.
- Use fail-fast validation for CLI options and manifest parsing.
- For optional files in template transformations, tolerate missing files when appropriate.
- In file reads/writes, use targeted `try/catch` and continue when operation is intentionally best-effort.
- Never swallow errors silently unless behavior is explicitly optional and documented.

## 13) File and Data Mutation Rules

- Preserve JSON formatting with trailing newline when rewriting files.
- For YAML/JSON updates, parse -> mutate -> stringify; do not regex-edit structured documents.
- Keep path operations constrained to target directory; validate against traversal (`..`) for template rules.
- Keep generated template cleanup deterministic (`.git`, `.create-larastack`, lockfiles as needed).

## 14) Testing Guidelines

- Add tests for behavior changes in generation and conditional rules.
- Prefer focused tests with temp directories (`mkdtemp`) and real file ops for scaffold behavior.
- Assert both positive and negative paths (e.g., file removed vs retained).
- Keep test names explicit and scenario-driven.

## 15) Docs and Schema Expectations

- If rule manifest behavior changes, update:
  - `README.md` conditional rules section
  - `schemas/rules.schema.json`
  - related tests in `test/`
- Keep examples aligned with actual engine capabilities.

## 16) Cursor/Copilot Rule Sources

- Checked for repository-level agent rules:
  - `.cursor/rules/` -> not present
  - `.cursorrules` -> not present
  - `.github/copilot-instructions.md` -> not present
- If these files are added later, merge their guidance into this document.

## 17) Agent Execution Expectations

- Make minimal, targeted edits consistent with existing patterns.
- Do not introduce unrelated refactors during feature work.
- Run relevant validation commands before handing off changes.
- For release requests, trigger the GitHub Actions workflow instead of local release commands.
