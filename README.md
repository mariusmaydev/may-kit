# may-kit

User-scope configuration for Claude Code, identical on every machine and in every repository.

Claude Code reads its user-scope config from `~/.claude/`. That folder is not under version control,
so this repo holds the shared parts and `install.ps1` links them into `~/.claude/`. Once installed,
the config applies in every workspace automatically — no per-repo setup.

## Contents

| Path | Linked to | Purpose |
|---|---|---|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | Global working rules (planning, model choice, review) |
| `output-styles/` | `~/.claude/output-styles/` | Custom output styles; `Marius` is the active one |
| `mods/<name>/` | `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` | Claude Code mods, loaded by every new session; `may-kit-panel` = buttons above the prompt: ⚡ (the repo's `.claude/arbeitsmodus`: dim careful, highlighted fast), Modell + Effort (follows a `**Weiter:**` hint: /compact, /model, /effort, then the order to carry out the task), ↺ (back to the model and effort from before the first switch), Review → Komprimieren, Live (release to production, where the repo has `scripts/merge.ps1`) |
| — | `"outputStyle": "Marius"` in `~/.claude/settings.json` | Set by `install.ps1` via `set-user-settings.cjs` (needs Node); only these two keys change |

New workspace or machine: give Claude [INSTALL.md](INSTALL.md); it installs everything and adapts the project.

Check a mod after editing: `claude plugin validate mods/<name>` and `claude plugin test mods/<name>`.

The style `Marius` defines **how** Claude answers; `CLAUDE.md` defines **when** a hint (model, compact, review) appears.
It was chosen on the selection page claude.ai/artifact/HT297XCCqrRVF6rmUcbPrY (2026-11-03).

## Setup on a new machine

```powershell
cd $env:USERPROFILE\Documents\GitHub
gh repo clone mariusmaydev/may-kit
cd may-kit
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Existing files in `~/.claude/` are moved to `*.bak-<timestamp>` first. If the machine had its own
`CLAUDE.md`, compare the backup with the repo version and merge differences here.

## Daily use

- Edit files **in this repo** (the links make `~/.claude/` see the change immediately), commit, push.
- On the other machine: `git pull`. Changes apply from the next Claude Code session.

## Rules

- Never commit credentials, tokens or token prefixes.
- Machine-specific things (paths, SSH hosts, logins, `settings.json`) stay out of this repo.
- Project rules belong in the project's own `CLAUDE.md`; this repo only holds what applies everywhere.

## Candidates for later

`~/.claude/skills/`, `~/.claude/hooks/`, `~/.claude/tools/` — move them only after checking they
contain nothing machine-specific.
