# CLAUDE.md — Global working rules (user scope)

**Scope:** all projects, all repositories, all sessions. **Precedence:** A project's `CLAUDE.md` beats this file; where a project has its own rules for autonomy, risk classes, answer format or gates, those rules apply and this file fills the gaps. Order on conflict: project `CLAUDE.md` > this file > skills > plugins > default behavior.

**Purpose:** the stronger model where architectural understanding and error analysis count — the faster one where a good plan only has to be carried out. The goal is the best ratio of quality, reliability, speed and model use, not maximum process.

---

## 0. Answer style — always applies

**How** to answer is governed by the output style `Marius` (`output-styles/marius.md` in the `may-kit` repo, active through `"outputStyle": "Marius"` in `~/.claude/settings.json`). This file governs **when** something is said.

**Answer language:** the `language` setting if there is one (the installer sets it from the system language), otherwise the language the user writes in; English by default. The fixed markers of §3, §3a, §4 and §5 (`**Model:**`, `**Next:**`, `**Compact now:**`, `REVIEW RECOMMENDATION` and its field names, `Plan:`, `OPUS ESCALATION RECOMMENDED`, the `| Finding | Result |` table, the `/model` → … command form) are written **verbatim in every language**: the `may-kit-panel` mod reads exactly them. Everything around them is translated.

If the style is missing (foreign environment, codespace), the floor is: result first, short whole sentences, no narration of tool use, no closing summary; file:line, error messages, numbers and warnings stay complete; detailed only for compliance, auth, migrations and destructive operations.

The hints from §3a and §5 appear only in the "Yes" case — they are a decision template, not a summary. The model line from §3 comes before every implementation, even if the model stays.

---

## 1. When to plan

A planning phase is **mandatory** as soon as one of these points applies — an OR list, no discretion:

- the change touches **≥ 3 files** or several components
- **Database:** migration, schema change, RLS policy, trigger
- **Auth, permissions, security** in any form
- **Foundation code:** design-system primitives, shared hooks, central utilities — anything with many callers
- **Concurrency, async behavior, state management** across component boundaries
- **Money, billing or other critical business logic**
- the **cause of an error is not understood** (symptom known, cause not)
- a **new pattern** emerges: first migration of a kind, new kind of test, new interface to the outside

**No planning phase** for: single-file change with a clear goal, text correction, rename, formatting, carrying out an approved plan, a pure research question.

**Escape:** If the user says "just do it", "implement directly" or the like, the phase is dropped — even when a trigger is met. Exception: migration, auth and security stay subject to planning; the plan is cut to the bare minimum there.

This list **beats self-assessment**: A model that hasn't understood a cause typically considers the case clear.

---

## 2. Planning phase

The tool is the built-in **plan mode** (write the plan, output it, wait for approval) — no separate mechanism beside it. Read first, then plan: affected code, architecture, conventions, dependencies. All essential architecture and design decisions are made **here**, not during implementation.

The plan contains: affected files and components · planned changes · interfaces · data flows · dependencies · invariants and constraints · edge cases · risks and side effects · required tests · verification steps · possible regressions. The yardstick: **another model must be able to implement it without redesigning the architecture.**

The **last line of the plan** is the model line from §3 — so it already stands in the approval dialog.

**Plan file:** If §3 recommends a switch ("**Next:**") or a compaction hint is due (§3a), the plan is additionally written as a file — `docs/plans/<YYYY-MM-DD>-<slug>.md`, otherwise to the scratchpad — and its path is named. The context survives neither compaction nor the end of the session; the plan has to.

---

## 3. Model recommendation

**When:** in **every turn that changes files** — before the first change to code, configuration or docs, regardless of whether a planning phase ran (§1) and however small the change is. Excepted are only turns without a change (research, questions) and edits to memory, plan or scratchpad files. Even "just do it" does not lift it; it costs a line, not a round.

**The model stays** — exactly one line, then keep working:

```
**Model:** Opus xhigh fits, because <criterion from the list below>.
```

**A switch is worthwhile** — the answer ends with the hint, nothing is implemented; the user switches and sends the order (or presses the "Model + Effort" button of the `may-kit-panel` mod, which runs `/compact`, `/model` and `/effort` and sends the order; "↺" then restores the model and effort from before the first switch):

````
**Next:** [first `/compact`, then] `/model` → [Opus | Sonnet], Effort [medium | high | xhigh]. [Reason, one sentence.]
Plan: <path> [· then Opus review]

```
/compact …   ← only if a cut point per §3a is reached at the same time
```
````

Required content: model, effort, reason; plan file as soon as one has been written (§2); "then Opus review" if §5 already points to "Yes". The spelling `/model` → <model>, Effort <level> is fixed: the mod reads exactly it.

**Compare before you recommend:** Check the recommended model against what is running — named in the system prompt and in the line `may-kit: running <model> <effort>` the panel puts beside each prompt. Same model is the "stays" case, even when only the effort differs: write the `**Model:**` line and carry on in the same turn — no `**Next:**`, no waiting for the user. If the effort you would pick differs from the running one, the line says so with the command, so the user can raise it for the next turn: `**Model:** Opus fits (xhigh would be better: /effort xhigh), because …`. `**Next:**` only when the model differs.

**Plan mode:** The plan ends with the model line (§2). If it says "**Next:**", approval does **not** start the implementation: write the plan file, output the hint, end the answer. If it says "**Model:**" because the recommended model is already running, approval starts the implementation directly.

**Don't omit it:** The line is never silently missing. A missing hint looks like a forgotten one; that is why "fits" is also stated explicitly. The current model counts as right only with a named criterion — "I'm already here" is none.

**Mechanics:** The user triggers the model switch (`/model`, or the "Model + Effort" button). Effort is set with `/effort <level>` (persisted as `effortLevel`): `low | medium | high | xhigh | max | auto`; only `medium | high | xhigh` are recommended. Subagents without a `model:` of their own run on Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL` in `~/.claude/settings.json`, if set) — whoever needs a subagent for heavy analysis passes the model explicitly.

**Criteria:**
- **Sonnet medium** — mechanical, fully defined work: repetitive changes, boilerplate, renames, simple tests, migration to a fixed interface, small refactorings without an architecture decision.
- **Sonnet high** — **preferred executor** for well-planned implementation: architecture is settled, plan detailed, components known, target behavior and verification unambiguous, no fundamental decisions left to expect.
- **Opus xhigh** — as soon as one applies: open architecture decision · unclear requirement or unclear system behavior · cause not understood · deep analysis only possible during implementation · complex interactions between systems · concurrency and race conditions · risky migration · security · complex state management · distributed or agent systems · an error would be systemic and hard to notice.

**Coupling to the project model:** If the project has its own autonomy or risk model (levels 1–3, risk classes S/M/L or similar), **its vocabulary prevails**:

| Project rating | Consequence |
|---|---|
| highest level (stop-and-wait / class L) | Opus xhigh, **no** delegating to Sonnet |
| middle level (autonomous run with final check / class M) | plan + Sonnet high |
| lowest level (fully autonomous / class S) | no planning phase, model line, work directly |

Without such a model, only the trigger list from §1 applies.

---

## 3a. Compacting at section boundaries

Compaction happens at a **section boundary**, not at a token count. Goal: the next section starts with everything it needs — and without the ballast of the previous one.

**Cut points** — then give the hint:
- Plan approved, implementation begins. The exploration has served its purpose; the implementation needs only the plan.
- Stage or task done: verified, committed, state documented.
- Bug hunt finished: cause and fix are settled, nobody needs the traces of the search any more.
- Change of topic: the new task has nothing to do with the previous one → `/clear` instead of `/compact`.

**Not a cut point** as long as: own changes are unsaved · a question or approval is open · a background run is working · a review is pending that refers to code just read · the next step builds directly on what was just read and re-reading costs more than it saves.

**Secure first** — what is still needed belongs in files, not in the summary: plan → plan file (§2) · state → spec or docs · decisions → decision log or spec · environment pitfalls → error catalog or project memory.

**What goes along:** goal of the next section · paths to plan and spec (with §) · decisions and instructions from the conversation that stand nowhere yet · pitfalls found · open points.
**What doesn't go along:** file contents, tool output, logs · discarded drafts · exploration paths (only their result: "X checked, ruled out, because …").

**Form** — at the end of the answer, after the result:

````
**Compact now:** <section> done, state in <file>.

```
/compact <goal of the next section>; basis <path §>; open: …; pitfalls: …
```
````

The command always stands in a code block of its own, so it can be copied, and stays short (at most about ten lines); anything longer belongs in a file. If compaction and a model switch (§3) coincide, they become **one** "Next:" hint per §3: **first `/compact`, then `/model`** — so the stronger model still writes the summary.

---

## 4. Implementation by another model

The plan is **binding**. Small technical adjustments are allowed as long as the architecture is untouched; don't redesign the architecture on your own.

Stop and escalate as soon as: a central assumption of the plan is wrong · an important edge case was missed · the architecture would have to be fundamentally different · larger unplanned dependencies turn up · a significant design decision is due · the solution cannot be implemented safely or robustly. Bring the work into a nameable state first (committed or precisely described):

```
OPUS ESCALATION RECOMMENDED
- Problem:
- Why the plan is not enough:
- Which decision has to be made anew:
- State of the implementation: [what is done, which files were touched, whether committed and runnable]
```

---

## 5. Review after implementation

Only after tests and verification have passed. **Working mode `fast`** (project file `.claude/working-mode`; older projects keep `.claude/arbeitsmodus` with the word `schnell`): there the check duties of this section and those from specs lapse (tests, verification, also in step 3 of the review procedure), except database tests for migrations; results then read "not checked". **The review recommendation stays in mode `fast`:** same criteria and timing, it just comes after the stage's commit instead of after green checks. **Evidence before claims:** actually run the check commands and read the output before "done", "fixed" or "green" is said.

**Timing:** A recommendation comes only when no open question and no missing part can change the stage's code any more. What may stay open without postponing the review: device test, browser test, runtime measurement, points of a later stage. If a question is pending whose answer can change the code, the question comes first, the review recommendation only after the answer has been implemented.

**Bundling:** Small sub-steps of the same stage (4b, 4c …) are checked together, not one by one. The recommendation comes after the last sub-step and names the scope (commit range or sub-steps). Exception: a sub-step with auth, RLS or security logic on which the next one builds is checked at once.

Output **only in the "Yes" case**:

```
REVIEW RECOMMENDATION
- Opus review recommended: Yes
- Model / Effort: [Opus | Sonnet] / [medium | high | xhigh]
- Reasoning:
- Check in particular:
- Commits: <sha> [<sha> …]
```

`Commits:` names only the stage's own commits as short SHAs. A range `a..b` is not enough, because other sessions commit to the same branch in between.

**Procedure when the user says "Start review"** (or presses the review button of the `may-kit-panel` mod):
1. **The session has a fresh subagent do the checking** (Agent tool, `model` and `effort` as in the block). It gets the SHAs from the `Commits:` block of the last REVIEW RECOMMENDATION (if the block is missing, for instance after `/compact`, the session names its candidates and asks, instead of guessing with `git log`: commits of parallel sessions carry the same author), the "Check in particular" list and the task to check exactly `git show <sha>` per commit, nothing else. It reads the surrounding code, changes nothing and returns findings with file:line by the yardstick below.
2. **The session fixes them itself:** every finding that concerns its own files, with the cause evidenced (§6). Findings in other sessions' files or without a real defect are named, not touched.
3. Then tests (none in mode `fast`, see above), commit (`git commit --only`), report: per finding fixed, discarded (with reason) or foreign.

**No `/code-review` while parallel sessions run in the same working tree, not even with a target.** The skill knows only PR, branch or path as a target. Without a target it takes the diff against upstream including all unsaved files in the working tree, i.e. those of the other sessions too; a branch target brings their commits along, a path target their changes in the same file. It ignores commit SHAs as an argument (found 2026-11-03: 81 foreign files instead of two own commits). Without parallel sessions `/code-review` stays allowed.

**Yes for:** system-wide or architectural changes · larger refactorings · new core components · complex data flows · agent, memory or orchestration systems · concurrency and async logic · database migrations · security components · critical business logic (trading, finance, billing) · complex state management · many indirect dependencies · rare errors with large impact · **any deviation from the original plan**. **No** for simple, clearly verifiable implementations — no review theater.

**Task of the Opus review:** **look for errors**, don't confirm. Checked: requirements complete · implementation matches the concept · unnecessary complexity · violated architecture principles · hidden side effects · missing edge cases · error handling · race conditions and state problems · new technical debt · do the tests cover the relevant failure cases · regressions · unintentionally changed functions · a much simpler or more robust solution. Findings graded **Critical / High / Medium / Low**, separated into actual problem · risk · optional improvement suggestion. The result of a review is reported as a table `| Finding | Result |` with "fixed", "discarded: <reason>" or "foreign: <session>".

---

## 6. Relation to skills, debugging

- **The Superpowers plugin is deliberately disabled** (2026-09-03, `false` in both scopes). Its process scaffolding is carried by this file (§2–§5). Don't re-enable it unasked, don't build an equivalent skill scaffolding as a substitute.
- **Debugging:** For a bug, a failing test or unexpected behavior, first evidence the cause — reproduce, formulate a hypothesis, check against code or logs — only then propose a fix. No repairing on suspicion.

---

## 7. Browser: shared Chrome (example from the author's machine — drop or replace)

The MCP server `chrome-devtools` (user scope, `~/.claude.json`) hangs on **one** Chrome that all sessions and projects share (`~/.claude/tools/chrome-geteilt.mjs`, port 9333 (9222 is taken by the normal Chrome), profile `~/.cache/chrome-devtools-mcp/chrome-profile`, logged in there; set up 2026-10-23). This section is specific to that setup; delete it or describe your own.

- Always open a **tab of your own** with `new_page` and work only in it. Never select, operate or close foreign tabs (other sessions, the user) — `list_pages` shows them all.
- Close your own tab at the end with `close_page`.
- Don't log out or switch accounts; the login belongs to all sessions.
- If Chrome doesn't answer, usually another Chrome with the same profile but without a debug port is still running (old plugin) — ask the user to close it, don't kill it yourself.

---

*Created 2026-09-03, tightened 2026-11-02, §3a compaction 2026-11-03, §3 model line before every implementation 2026-11-03, English with language-neutral markers 2026-11-03, §3 same model stays, effort from the panel's prompt line, Stop hook removed 2026-11-08.*
