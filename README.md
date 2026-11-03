# claude-user-config

User-scope configuration for Claude Code, identical on every machine and in every repository.

Claude Code reads its user-scope config from `~/.claude/`. That folder is not under version control,
so this repo holds the shared parts and `install.ps1` links them into `~/.claude/`. Once installed,
the config applies in every workspace automatically — no per-repo setup.

## Contents

| Path | Linked to | Purpose |
|---|---|---|
| `CLAUDE.md` | `~/.claude/CLAUDE.md` | Global working rules (planning, model choice, review) |
| `output-styles/` | `~/.claude/output-styles/` | Custom output styles; `Marius` is the active one |
| `mods/<name>/` | `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` | Claude Code mods, loaded by every new session; `realesos-cockpit` = Review → Komprimieren buttons above the prompt |
| — | `"outputStyle": "Marius"` in `~/.claude/settings.json` | Set by `install.ps1` via `set-user-settings.cjs` (needs Node); only these two keys change |

Check a mod after editing: `claude plugin validate mods/<name>` and `claude plugin test mods/<name>`.

The style `Marius` defines **how** Claude answers; `CLAUDE.md` defines **when** a hint (model, compact, review) appears.
It was chosen on the selection page claude.ai/artifact/HT297XCCqrRVF6rmUcbPrY (2026-11-03).

## Setup on a new machine

```powershell
cd $env:USERPROFILE\Documents\GitHub
gh repo clone mariusmaydev/claude-user-config
cd claude-user-config
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
