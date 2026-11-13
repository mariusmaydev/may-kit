// node --test mods/may-kit-sperren/tests
// Which command takes which lock: the classification decides who waits, so a false match blocks
// a session for nothing (2026-11-13: "git pull" inside a grep pattern) and a missed one lets two
// sessions collide.
import { test } from "node:test";
import assert from "node:assert/strict";
import { klassifizieren, bereinigen, functionsNamen, cliAufruf, gueltigerBereich } from "../hooks/sperren.mjs";

const bash = (command) => klassifizieren({ tool_name: "Bash", tool_input: { command } });

test("git: only commands that write the index lock, and only at command position", () => {
  assert.deepEqual(bash('git commit --only a.ts -m "fix: git pull geht nicht"').bereiche, ["git"]);
  assert.deepEqual(bash('cd "C:/x/y" && git add a.ts').bereiche, ["git"]);
  assert.deepEqual(bash("git -C ../other commit -m x").bereiche, ["git"]);
  assert.deepEqual(bash("Set-Location x; if ($?) { git commit -m x }").bereiche, ["git"]);
  // free: push, fetch, reading commands, merge scripts in their own worktree
  assert.deepEqual(bash("git push origin MariusMay").bereiche, []);
  assert.deepEqual(bash("git fetch origin --quiet").bereiche, []);
  assert.deepEqual(bash("git merge-base --is-ancestor a b").bereiche, []);
  assert.deepEqual(bash("git log --oneline -5; git status -sb").bereiche, []);
  assert.deepEqual(bash(".\\scripts\\merge.ps1").bereiche, []);
  // data, not commands
  assert.deepEqual(bash('grep -n -E "sperren|git pull|fetch" hooks/register.tsx').bereiche, []);
  assert.deepEqual(bash("echo git commit is fine").bereiche, []);
});

test("heredoc and here-string bodies are data", () => {
  const bashMsg = "git commit -m \"$(cat <<'EOF'\nfix: no more git stash here\n\ngit checkout main\nEOF\n)\"";
  const r = bash(bashMsg);
  assert.deepEqual(r.bereiche, ["git"]);
  assert.equal(r.baum, false);
  const ps = "git commit -m @'\nTitel\ngit reset --hard\n'@";
  assert.equal(bash(ps).baum, false);
});

test("baum: commands that rewrite other sessions' files", () => {
  for (const c of ["git stash", "git stash push -m x", "git checkout main", "git checkout -- a.ts", "git switch x", "git pull", "git clean -fd", "git reset --hard HEAD", "git restore a.ts", "git restore --staged --worktree a.ts"]) {
    assert.equal(bash(c).baum, true, c);
  }
  for (const c of ["git stash list", "git stash show -p", "git reset HEAD a.ts", "git restore --staged a.ts", "git worktree add x origin/main", "git commit -m x"]) {
    assert.equal(bash(c).baum, false, c);
  }
});

test("database: remote writes and the local stack are separate areas; reading is free", () => {
  assert.deepEqual(bash("npx supabase db push").bereiche, ["datenbank"]);
  assert.deepEqual(bash("npx supabase migration repair --status applied 2026").bereiche, ["datenbank"]);
  assert.deepEqual(bash("npm run db:push -- --project-ref x --dry-run").bereiche, ["datenbank"]);
  assert.deepEqual(bash("npm run db:test -- --frisch").bereiche, ["dbtest"]);
  assert.deepEqual(bash("npx supabase start").bereiche, ["dbtest"]);
  assert.deepEqual(bash("npx supabase db diff -f x").bereiche, ["dbtest"]);
  assert.deepEqual(bash("npx supabase migration list --linked").bereiche, []);
  assert.deepEqual(bash("npx supabase migration new add_x").bereiche, []);
  assert.deepEqual(bash("npx supabase gen types typescript --linked > types.ts").bereiche, []);
});

test("functions: one lock per function, a deploy without a name locks all", () => {
  assert.deepEqual(bash("npx supabase functions deploy send-expose").bereiche, ["functions-send-expose"]);
  assert.deepEqual(bash("npx supabase functions deploy expose-ki expose-anfrage --project-ref hmb").bereiche, ["functions-expose-ki", "functions-expose-anfrage"]);
  assert.deepEqual(bash("npx supabase functions deploy --project-ref hmb x").bereiche, ["functions-x"]);
  assert.deepEqual(bash("npx supabase functions deploy --no-verify-jwt").bereiche, ["functions"]);
  assert.deepEqual(functionsNamen(bereinigen("supabase functions deploy a --import-map m.json")), ["a"]);
  const mcp = klassifizieren({ tool_name: "mcp__supabase__deploy_edge_function", tool_input: { name: "send-expose" } });
  assert.deepEqual(mcp.bereiche, ["functions-send-expose"]);
  assert.deepEqual(bash("npx supabase functions list").bereiche, []);
});

test("release, packages, heavy load", () => {
  assert.deepEqual(bash(".\\scripts\\merge.ps1 -Production").bereiche, ["release"]);
  assert.deepEqual(bash('& "C:/repo/scripts/merge.ps1" -Production -Pruefen').bereiche, ["release"]);
  assert.deepEqual(bash("npm install").bereiche, ["pakete"]);
  assert.deepEqual(bash("npm run typecheck").bereiche, ["schwerlast"]);
  assert.deepEqual(bash("npm run test:changed").bereiche, []);
});

test("the lock CLI is never locked by its own arguments", () => {
  const t = 'node .claude/hooks/sperren.mjs nehmen datenbank "Migration x: db push, gen types"';
  assert.deepEqual(bash(t).bereiche, []);
  assert.deepEqual(cliAufruf(t), { aktion: "nehmen", bereich: "datenbank", grund: "Migration x: db push, gen types" });
  assert.deepEqual(cliAufruf('node "C:/kit/hooks/sperren.mjs" freigeben functions-x'), { aktion: "freigeben", bereich: "functions-x", grund: "" });
  assert.equal(gueltigerBereich("functions-send-expose"), true);
  assert.equal(gueltigerBereich("dbtest"), true);
  assert.equal(gueltigerBereich("irgendwas"), false);
});
