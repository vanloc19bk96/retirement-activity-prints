# Community Cursor Assets

Curated rules and skills synced from open-source community repos.
Re-sync: `pwsh scripts/sync-cursor-community-assets.ps1`

## Priority order

1. **Project rules** (always-on): `clean-code.mdc`, `react-state-performance.mdc`
2. **Community rules** (scoped by `globs`, `alwaysApply: false`): `.cursor/rules/community/`
3. **Skills** (on-demand workflows): `.cursor/skills/*/SKILL.md`

Community assets complement — they do not replace project-specific conventions.

## Rules — `.cursor/rules/community/`

| File | Source | When it applies |
|------|--------|-----------------|
| `react-shadcn.mdc` | [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) | React + TypeScript + shadcn/ui |
| `vite-react-typescript.mdc` | awesome-cursorrules | Vite + React + TypeScript |
| `tailwind-shadcn.mdc` | awesome-cursorrules | Tailwind + shadcn integration |
| `react-components.mdc` | awesome-cursorrules | Creating React components |
| `typescript-axios.mdc` | awesome-cursorrules | Axios API layer |
| `vitest-testing.mdc` | awesome-cursorrules | Vitest unit tests |
| `fastapi-backend.mdc` | awesome-cursorrules | FastAPI best practices |
| `fastapi-architecture.mdc` | awesome-cursorrules | FastAPI production architecture |
| `typescript-quality.mdc` | awesome-cursorrules | TS/JS code quality |
| `security-devsecops.mdc` | awesome-cursorrules | Security, secrets, auth |

## Skills — `.cursor/skills/`

| Skill | Source | Use when |
|-------|--------|----------|
| `reviewing-code` | [spencerpauly/awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills) | Code review |
| `auditing-security` | awesome-cursor-skills | Security audit |
| `auditing-performance` | awesome-cursor-skills | Performance audit |
| `systematic-debugging` | awesome-cursor-skills | Debugging |
| `writing-tests` | awesome-cursor-skills | Writing unit/integration tests |
| `auto-type-checking` | awesome-cursor-skills | Run `tsc` after edits |
| `accessibility-auditing` | awesome-cursor-skills | a11y audit |
| `visual-qa-testing` | awesome-cursor-skills | Browser visual QA |
| `suggesting-cursor-rules` | awesome-cursor-skills | Encode repeated corrections as rules |
| `parallel-code-review` | awesome-cursor-skills | Multi-angle PR review |
| `grinding-until-pass` | awesome-cursor-skills | Fix until tests/lint pass |
| `react-best-practices` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | React performance (40+ rules) |

## More community catalogs

- [PatrickJS/awesome-cursorrules](https://github.com/PatrickJS/awesome-cursorrules) — largest rules collection
- [spencerpauly/awesome-cursor-skills](https://github.com/spencerpauly/awesome-cursor-skills) — skills catalog
- [cursor.directory](https://cursor.directory/) — browse by framework
- [skills.sh](https://skills.sh/) — popular skills leaderboard
