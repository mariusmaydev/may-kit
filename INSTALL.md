# Set up may-kit — prompt for Claude

In a new or existing workspace, give Claude this sentence:

> Set up may-kit following https://github.com/mariusmaydev/may-kit/blob/main/INSTALL.md

or copy the part below the line straight into the chat.

---

You are setting up **may-kit**, an opinionated Claude Code configuration: global working rules (`CLAUDE.md`), the output style `Marius` and the mod `may-kit-panel` (buttons above the prompt: Model + Effort, ↺, Review, Compact, Live, ⚡, ?). Work through the steps in order, report a table `Step | Result` at the end, and ask only where it says "ask" below.

## 1. Machine (once per machine)

1. **Get the repo.** If `may-kit` already sits beside the other repos (Windows: `%USERPROFILE%\Documents\GitHub\may-kit`), run `git pull` there. Otherwise clone it there: `gh repo clone mariusmaydev/may-kit`. An old folder `claude-user-config` is the same state under an old name: rename it to `may-kit`, don't clone twice. Afterwards the panel keeps the clone up to date by itself, once a day (README, "Updates").
2. **Install.** Windows: `powershell -ExecutionPolicy Bypass -File install.ps1` in the repo. The script links `CLAUDE.md` and `output-styles/` into `~/.claude/`, backs up existing files as `.bak-<date>` and sets three keys in `~/.claude/settings.json`: `outputStyle`, `env.CLAUDE_CODE_PLUGIN_DIRS` (all folders under `mods/`) and `language`, taken from the Windows display language, only if it isn't set yet; a `hooks.Stop` entry for `hooks/model-line.mjs` from an earlier version is removed. It needs Node. Without Windows: create the same two links with `ln -s`, then run `node set-user-settings.cjs ~/.claude/settings.json "$(date +%Y%m%d%H%M%S)" Marius <repo>/mods/may-kit-panel`, which also reads `LC_ALL` / `LC_MESSAGES` / `LANG` for `language`; ask first.
3. **Check**, every line with evidence:
   - `~/.claude/CLAUDE.md` and `~/.claude/output-styles` point into the repo.
   - `~/.claude/settings.json`: `"outputStyle": "Marius"`, `CLAUDE_CODE_PLUGIN_DIRS` names `…/may-kit/mods/may-kit-panel`, and no `hooks.Stop` entry names `model-line.mjs`.
   - `~/.claude/settings.json`: `"language"` holds the system language (e.g. `german`, `czech`), or is absent on an English system. Never overwrite a value the user set; to switch languages, only the user edits it.
   - `claude plugin validate <repo>/mods/may-kit-panel` and `claude plugin test <repo>/mods/may-kit-panel` are green.
4. **Note to the user:** The mod and the style take effect only in a **new** chat. Claude's answers and the panel follow the `language` setting: English by default, German buttons and orders for `german`.

## 2. Project (per workspace)

First read the project's `CLAUDE.md`, if there is one. It takes precedence over everything here; overwrite nothing in it, only add.

The buttons depend on the project:

| Button | Appears when | What it triggers |
|---|---|---|
| Model + Effort | always; highlighted after a `**Next:**` hint | runs `/compact` (if named), `/model` and `/effort` and sends the order to implement (§3) |
| ↺ | after a switch | restores the model and effort from before the first switch |
| Review | always | sends "Start review" with the commits of the last REVIEW RECOMMENDATION (global `CLAUDE.md` §5) |
| Compact | always | compacts with the instruction of the last `/compact` hint (§3a); right after such a hint it then sends the order to continue |
| Live | `scripts/merge.ps1` exists | sends "Release to production"; the project's `CLAUDE.md` has to describe what that means |
| ⚡ | `.claude/working-mode` exists | sends "Mode fast" / "Mode careful"; grey = careful, yellow = fast |
| ? | always | opens the explanations |

(With `language: german` the panel shows German labels and sends the German orders "Review starten", "Release nach production", "Modus schnell" / "Modus sorgfältig". A project that still has `.claude/arbeitsmodus` with `schnell` / `sorgfaeltig` keeps working.)

Set up what is missing, **after asking** (one question with all points, your proposal for each):

1. **Working mode.** Create the file `.claude/working-mode` with the word `careful` and add a section "Working mode — fast or careful" to the project's `CLAUDE.md`: what `fast` allows (commit a finished change without checking and ship it to production; the check duties from specs and from the review procedure lapse too, except database tests for migrations; the review recommendation itself stays) and what holds in both modes (no data loss, production never implicit, schema before code, commit only your own files). Switching: "Mode fast" / "Mode careful" → Claude writes the word and commits only this file.
2. **Release.** Only if the project has a way to production: a script `scripts/merge.ps1` (or wire the existing release command there) and, in the project's `CLAUDE.md`, a section on what "Release to production" triggers, step by step. Without a release path create nothing; the Live button then stays away.
3. **Review rule.** If the project's `CLAUDE.md` says nothing about reviews, add one line: reviews run on request, per global `CLAUDE.md` §5 (a subagent checks exactly the commits of the recommendation, the session fixes). If parallel sessions run in the workspace, add: no `/code-review`.

Afterwards commit only your own files (`git commit --only <paths>`), never other changes in the working tree.

## 3. Limits

- No plaintext credentials in files or `settings.json`.
- Change `~/.claude/settings.json` only through `install.ps1` or `set-user-settings.cjs`, no further keys.
- Change nothing in the `may-kit` repo itself unless the user says so; adjustments belong in the project.
