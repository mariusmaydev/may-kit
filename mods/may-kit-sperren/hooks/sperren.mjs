#!/usr/bin/env node
/**
 * Locks between parallel Claude sessions on the same working tree (may-kit-sperren).
 *
 * Several sessions share one working tree, one git index and one dev database. Only work that
 * really collides waits, and each area is cut as narrow as possible (2026-11-13: an hour-long
 * release lock blocked every other session):
 *
 *   git         commands that write the index (add, commit, merge, rebase …) — seconds.
 *               push, fetch and merge scripts that work in their own worktree are free.
 *   datenbank   writes to the shared remote dev database (db push, migration repair).
 *   dbtest      the local database stack (start/stop, db reset/diff, npm run db:test).
 *               Read-only and file-only commands (migration list/new, gen types) are free.
 *   functions-<name>  one lock per edge function; a deploy without a name locks all ("functions").
 *   release     the release command itself (merge.ps1 -Production), never a whole chain.
 *   pakete      npm install and friends (node_modules).
 *   schwerlast  type check and full test suite (memory only; usually off on big machines).
 *   baum        no lock: blocks commands that rewrite other sessions' uncommitted files
 *               (git stash, checkout, switch, restore, reset --hard, pull, clean) while another
 *               session is active.
 *
 * An explicit lock ("nehmen") lapses 15 minutes after the last command in its area; every
 * command there renews it. An automatic lock lives for one command.
 *
 * SWITCH: <repo>/.claude/sperren — first word "an" or "aus". "aus" (or a missing file) turns every
 * handler into a no-op, so the plugin is inert in repos that never opted in. A line
 * "ohne: schwerlast, pakete" disables single areas. Optional .claude/sperren.local (untracked, per
 * machine) can only switch off more: first word "aus", or its own "ohne:" line.
 *
 * MODES (argv[2])
 *   pre     PreToolUse  Bash|PowerShell|mcp__supabase__deploy_edge_function — takes the locks or blocks (exit 2)
 *   post    PostToolUse/PostToolUseFailure, same matcher — releases the automatic locks of that call,
 *           renews the explicit ones, warns when a deploy bundled foreign uncommitted code
 *   datei   PostToolUse Edit|Write|NotebookEdit — records the edited file, warns about foreign changes in it
 *   prompt  UserPromptSubmit — heartbeat, task label, lists other active sessions
 *   stop    Stop — releases the automatic locks left over in this turn
 *   ende    SessionEnd — releases all locks of the session
 *   CLI     status | warten <bereich> [sekunden] | alle-aufheben (user only)
 *           nehmen <bereich> "<grund>" | freigeben [bereich]  (executed by the pre hook, which knows
 *           the session id; the CLI itself only prints)
 *
 * Fail-open on purpose: a broken lock hook must never stop work.
 */
import { existsSync, mkdirSync, openSync, closeSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync, renameSync } from "node:fs";
import { join, relative, isAbsolute, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SELBST = fileURLToPath(import.meta.url);
const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const dir = join(root, ".claude", "state", "sperren");
const MIN = 60 * 1000;
const TTL_AUTO = 30 * MIN; // a single command; long runs (db:test --frisch, verify) fit
const TTL_EXPLIZIT = 15 * MIN; // idle time: renewed by every command of the same area
const AKTIV = 30 * MIN; // a session without activity for longer counts as idle
const AUFRAEUMEN = 24 * 60 * MIN;

// ---------- classification (pure, exported for the tests) ----------

// A command word stands at the start or after a separator: ; & | ( ) { } newline, or a shell keyword.
const VOR = String.raw`(?:^|[;&|(){}\n]|\bthen\b|\bdo\b|\belse\b)\s*(?:&\s*)?`;
// git's own options before the subcommand: -C <dir>, -c <key=value>, --no-pager, --git-dir=…
const GIT_OPT = String.raw`(?:\s+(?:-C\s+\S+|-c\s+\S+|--[\w-]+(?:=\S+)?))*`;
const git = (befehle, rest = "") => new RegExp(`${VOR}git(?:\\.exe)?${GIT_OPT}\\s+(?:${befehle})(?![\\w-])${rest}`, "i");

export const BEREICHE = {
  git: [git("add|commit|merge|rebase|cherry-pick|revert|am|apply|mv|rm|stash|reset|restore|checkout|switch|pull")],
  datenbank: [/\bsupabase\s+(?:db\s+push|migration\s+repair)\b/, /\bnpm\s+run\s+db:push\b/],
  dbtest: [
    /\bsupabase\s+(?:start|stop|test\s+db|db\s+(?:reset|diff|pull|start)|migration\s+(?:up|down|squash))\b/,
    /\bnpm\s+run\s+db:(?:test|stop|reset)\b/,
  ],
  release: [/\bmerge\.ps1\b[^\n;&|]*-Production\b/i],
  pakete: [/\bnpm\s+(?:install|i|ci|uninstall|un|update|add)\b/, /\bnpm\s+run\s+icons:generate\b/],
  schwerlast: [/\bnpm\s+run\s+(?:verify|verify:release|typecheck|test)(?![\w:-])/],
};

/** Commands that rewrite files of other sessions; blocked while another session is active (area "baum"). */
export const BAUM = [
  git("stash", String.raw`(?!\s+(?:list|show)\b)`),
  git("reset", String.raw`(?=[^\n;&|]*--(?:hard|merge|keep)\b)`),
  git("checkout|switch|pull|clean"),
  git("restore", String.raw`(?![^\n;&|]*--staged\b(?![^\n;&|]*--worktree))`),
];

/** Options of `supabase functions deploy` that take a value: the value is no function name. */
const WERT_OPTIONEN = new Set(["--project-ref", "--import-map", "--jobs", "-j", "--workdir", "--env-file", "--profile", "--network-id", "-o", "--output"]);

/**
 * The command text with everything removed that is data, not a command: quoted strings that contain
 * whitespace (commit messages, grep patterns, script bodies), heredoc and here-string bodies, and the
 * lock CLI's own arguments. A quoted string without whitespace (a path) stays, unquoted.
 */
export function bereinigen(text) {
  let t = String(text || "");
  t = t.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2(?=\s|$)/g, "<<H"); // bash heredoc
  t = t.replace(/@(['"])\r?\n[\s\S]*?\r?\n\1@/g, '""'); // PowerShell here-string
  t = t.replace(/'([^'\n]*)'|"((?:[^"\\\n]|\\.)*)"/g, (m, a, b) => {
    const inhalt = a ?? b;
    return /\s/.test(inhalt) ? '""' : inhalt;
  });
  return t.replace(/node\s+\S*sperren\.mjs[^\n;&|]*/g, " ");
}

/** Function names a `supabase functions deploy` deploys; "*" for a deploy without a name (all). */
export function functionsNamen(bereinigt) {
  const namen = [];
  for (const m of bereinigt.matchAll(/\bsupabase\s+functions\s+deploy\b([^\n;&|]*)/g)) {
    const teile = m[1].trim().split(/\s+/).filter(Boolean);
    const eigene = [];
    for (let i = 0; i < teile.length; i++) {
      const t = teile[i];
      if (t.startsWith("-")) {
        if (!t.includes("=") && WERT_OPTIONEN.has(t)) i++;
        continue;
      }
      if (/^[\w-]+$/.test(t)) eigene.push(t);
    }
    namen.push(...(eigene.length ? eigene : ["*"]));
  }
  return namen;
}

const functionsBereich = (name) => (name === "*" ? "functions" : `functions-${name}`);
const familie = (b) => (b === "functions" || b.startsWith("functions-") ? "functions" : b);

/** Areas a tool call needs, and whether it rewrites other sessions' files. */
export function klassifizieren(event) {
  if (event.tool_name === "mcp__supabase__deploy_edge_function") {
    const name = String(event.tool_input?.name || "");
    return { text: `deploy_edge_function ${name}`, bereiche: [functionsBereich(/^[\w-]+$/.test(name) ? name : "*")], baum: false, functions: [] };
  }
  const text = String(event.tool_input?.command || "");
  const rein = bereinigen(text);
  const bereiche = Object.keys(BEREICHE).filter((b) => BEREICHE[b].some((re) => re.test(rein)));
  const functions = functionsNamen(rein);
  for (const n of functions) bereiche.push(functionsBereich(n));
  return { text, bereiche: [...new Set(bereiche)], baum: BAUM.some((re) => re.test(rein)), functions };
}

export function gueltigerBereich(b) {
  return Boolean(b) && (b in BEREICHE || b === "functions" || /^functions-[\w-]+$/.test(b));
}

// ---------- switch ----------

function schalter() {
  let an = false;
  const ohne = new Set();
  const lokal = { aus: false, ohne: [] };
  // `[ \t]` instead of `\s`: an empty "ohne:" must not swallow the next line
  const liste = (text) => ((text.match(/^[ \t]*ohne:[ \t]*(.*)$/im) || [])[1] || "").split(/[\s,]+/).filter(Boolean);
  try {
    const text = readFileSync(join(root, ".claude", "sperren"), "utf8");
    an = /^\s*an\b/i.test(text);
    for (const b of liste(text)) ohne.add(b);
  } catch {
    return { an: false, ohne, lokal };
  }
  // Per-machine override (gitignored via *.local): only switches off more, never on.
  try {
    const text = readFileSync(join(root, ".claude", "sperren.local"), "utf8");
    if (/^\s*aus\b/i.test(text)) {
      an = false;
      lokal.aus = true;
    }
    lokal.ohne = liste(text);
    for (const b of lokal.ohne) ohne.add(b);
  } catch {
    /* no local override */
  }
  return { an, ohne, lokal };
}

const aus = (cfg, b) => cfg.ohne.has(b) || cfg.ohne.has(familie(b));

// ---------- state ----------

function lesen(datei) {
  try {
    return JSON.parse(readFileSync(join(dir, datei), "utf8"));
  } catch {
    return null;
  }
}

function verzeichnis() {
  if (existsSync(dir)) return;
  mkdirSync(dir, { recursive: true });
  // the state never belongs in git, whatever the repo's .gitignore says
  try {
    writeFileSync(join(dir, ".gitignore"), "*\n");
  } catch {
    // ignore
  }
}

function schreiben(datei, wert) {
  verzeichnis();
  // "tmp-" prefix: directory scans filter by "sitzung-"/"bereich-"/"dateien-" and must not see half-written files
  const tmp = join(dir, `tmp-${process.pid}-${datei}`);
  writeFileSync(tmp, JSON.stringify(wert));
  try {
    renameSync(tmp, join(dir, datei));
  } catch {
    // Windows refuses the rename while another hook reads the target (EPERM); write in place instead
    try {
      unlinkSync(tmp);
    } catch {
      // ignore
    }
    writeFileSync(join(dir, datei), JSON.stringify(wert));
  }
}

function loeschen(datei) {
  try {
    unlinkSync(join(dir, datei));
  } catch {
    // already gone
  }
}

const kurz = (id) => String(id || "ohne-id").slice(0, 8);
const sitzungsDatei = (id) => `sitzung-${id}.json`;
const sperrDatei = (b) => `bereich-${b}.json`;
const dateienDatei = (id) => `dateien-${id}.json`;
const vor = (t) => `${Math.max(0, Math.round((Date.now() - t) / MIN))} min`;

function sitzung(id) {
  return lesen(sitzungsDatei(id)) || { id, aufgabe: "", zuletzt: 0 };
}

function lebenszeichen(id, aufgabe) {
  const s = sitzung(id);
  s.zuletzt = Date.now();
  // keep the first meaningful prompt as label; "ja mach" says nothing about the task,
  // "<task-notification>" and similar system messages are not written by the user
  if (!s.aufgabe && aufgabe && aufgabe.trim().length >= 25 && !aufgabe.trim().startsWith("<")) s.aufgabe = aufgabe.trim().replace(/\s+/g, " ").slice(0, 80);
  // A repo may keep a fallback hook that forwards here (for machines without may-kit). It stays
  // silent for a session the plugin itself serves; this flag tells it so.
  if (!process.env.MAY_KIT_SPERREN_RUECKFALL) s.plugin = true;
  delete s.beendet;
  schreiben(sitzungsDatei(id), s);
}

function beschreibung(id) {
  const s = sitzung(id);
  return `Session ${kurz(id)}${s.aufgabe ? ` („${s.aufgabe}“)` : ""}`;
}

function andereAktive(id) {
  return (existsSync(dir) ? readdirSync(dir) : [])
    .filter((f) => f.startsWith("sitzung-") && f !== sitzungsDatei(id))
    .map((f) => lesen(f))
    .filter((s) => s && !s.beendet && Date.now() - s.zuletzt < AKTIV);
}

function sperreLesen(b) {
  const s = lesen(sperrDatei(b));
  if (!s) return null;
  if (s.bis < Date.now()) {
    loeschen(sperrDatei(b));
    return null;
  }
  return s;
}

function alleSperren() {
  return (existsSync(dir) ? readdirSync(dir) : [])
    .filter((f) => f.startsWith("bereich-"))
    .map((f) => sperreLesen(f.slice(8, -5)))
    .filter(Boolean);
}

/** A foreign lock that collides with area b: the same area, or "functions" (all) against any single function. */
function fremdeImWeg(b, id) {
  if (familie(b) !== "functions") return null;
  return alleSperren().find((s) => s.sitzung !== id && s.bereich !== b && familie(s.bereich) === "functions" && (b === "functions" || s.bereich === "functions")) || null;
}

/** Returns null on success, or the foreign lock that blocks. */
function nehmen(b, id, grund, werkzeug, explizit) {
  verzeichnis();
  const jetzt = Date.now();
  const sperre = { bereich: b, sitzung: id, grund, werkzeug, explizit, seit: jetzt, bis: jetzt + (explizit ? TTL_EXPLIZIT : TTL_AUTO) };
  const quer = fremdeImWeg(b, id);
  if (quer) return quer;
  for (let versuch = 0; versuch < 2; versuch++) {
    const vorhanden = sperreLesen(b);
    if (vorhanden && vorhanden.sitzung !== id) return vorhanden;
    if (vorhanden) {
      // own lock: renew, never downgrade an explicit lock to an automatic one
      vorhanden.bis = Math.max(vorhanden.bis, sperre.bis);
      if (explizit) Object.assign(vorhanden, { explizit: true, grund });
      schreiben(sperrDatei(b), vorhanden);
      return null;
    }
    try {
      closeSync(openSync(join(dir, sperrDatei(b)), "wx"));
      schreiben(sperrDatei(b), sperre);
      return null;
    } catch {
      // another session created it in between — read again
    }
  }
  return sperreLesen(b);
}

function freigeben(id, filter) {
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    if (!f.startsWith("bereich-")) continue;
    const s = lesen(f);
    if (s && s.sitzung === id && filter(s)) loeschen(f);
  }
}

function aufraeumen() {
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    try {
      const alter = Date.now() - statSync(join(dir, f)).mtimeMs;
      if (f !== ".gitignore" && (alter > AUFRAEUMEN || ((f.startsWith("tmp-") || f.endsWith(".tmp")) && alter > MIN))) loeschen(f);
    } catch {
      // ignore
    }
  }
}

// ---------- uncommitted files ----------

const schluessel = (p) => {
  const rel = isAbsolute(p) ? relative(root, p) : p;
  const norm = (rel.startsWith("..") ? p : rel).replace(/\\/g, "/");
  return process.platform === "win32" ? norm.toLowerCase() : norm;
};

function ungesichert() {
  try {
    const out = execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8", timeout: 5000 });
    return new Set(out.split("\n").filter(Boolean).map((l) => schluessel(l.slice(3).replace(/^.* -> /, "").replace(/^"|"$/g, ""))));
  } catch {
    return null;
  }
}

/** Files other sessions edited and have not committed yet, as { sitzung, pfad, t }. */
function fremdeOffene(id) {
  const offen = ungesichert();
  const result = [];
  for (const f of existsSync(dir) ? readdirSync(dir) : []) {
    if (!f.startsWith("dateien-") || f === dateienDatei(id)) continue;
    const andere = f.slice(8, -5);
    for (const [pfad, t] of Object.entries(lesen(f) || {})) if (!offen || offen.has(pfad)) result.push({ sitzung: andere, pfad, t });
  }
  return result;
}

/** All files a function bundles: its own folder and every relative import, followed transitively. */
function functionDateien(name) {
  const basis = join(root, "supabase", "functions");
  const ordner = name === "*" ? readdirSync(basis, { withFileTypes: true }).filter((d) => d.isDirectory() && !d.name.startsWith("_")).map((d) => d.name) : [name];
  const gesehen = new Set();
  const offen = [];
  const sammeln = (p) => {
    for (const e of readdirSync(p, { withFileTypes: true })) {
      const voll = join(p, e.name);
      if (e.isDirectory()) sammeln(voll);
      else if (/\.(m?[jt]sx?|json)$/.test(e.name)) offen.push(voll);
    }
  };
  for (const o of ordner) if (existsSync(join(basis, o))) sammeln(join(basis, o));
  while (offen.length) {
    const datei = offen.pop();
    const k = schluessel(datei);
    if (gesehen.has(k)) continue;
    gesehen.add(k);
    let text = "";
    try {
      text = readFileSync(datei, "utf8");
    } catch {
      continue;
    }
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']+)["']/g)) offen.push(resolve(dirname(datei), m[1]));
  }
  return gesehen;
}

// ---------- handlers ----------

function blockieren(b, fremd, text) {
  process.stderr.write(
    `\nGESPERRT von may-kit-sperren — eine parallele Session arbeitet im Bereich „${b}“.\n` +
      `Sperre hält ${beschreibung(fremd.sitzung)} (Bereich „${fremd.bereich}“) seit ${vor(fremd.seit)}` +
      `${fremd.grund ? ` (${fremd.grund.slice(0, 100)})` : ""}; läuft spätestens in ${Math.ceil((fremd.bis - Date.now()) / MIN)} min ab.\n` +
      `Dein Befehl lief NICHT: ${text.slice(0, 160)}\n\n` +
      "Nicht umgehen, nicht umformulieren, keine Sperrdatei löschen. Stattdessen:\n" +
      `- \`node "${SELBST}" warten ${fremd.bereich}\` mit run_in_background starten (endet, sobald frei, höchstens 15 min),\n` +
      "  dann den Befehl erneut ausführen; bis dahin an etwas anderem arbeiten.\n" +
      "- Dauert es zu lange oder hängt die fremde Session: dem User melden, er entscheidet.\n" +
      "Abschalten nur auf Wort des Users („Sperren aus“ → .claude/sperren).\n",
  );
  process.exit(2);
}

function baumBlockieren(text, andere) {
  process.stderr.write(
    "\nGESPERRT von may-kit-sperren — dieser Git-Befehl schreibt Dateien im gemeinsamen Arbeitsbaum um " +
      "(stash, checkout, switch, restore, reset --hard, pull, clean) und träfe die ungesicherte Arbeit anderer Sessions:\n" +
      andere.map((s) => `- ${beschreibung(s.id)}, aktiv vor ${vor(s.zuletzt)}`).join("\n") +
      `\nDein Befehl lief NICHT: ${text.slice(0, 160)}\n\n` +
      "Stattdessen: eigene Änderungen gezielt mit Edit zurücknehmen, nur eigene Pfade committen (`git commit --only <pfade>`), " +
      "fremde Stände per `git show <ref>:<pfad>` lesen statt auschecken. Braucht es den Befehl wirklich, entscheidet der User.\n",
  );
  process.exit(2);
}

function pre(event, cfg) {
  const id = event.session_id;
  lebenszeichen(id);
  const { text, bereiche, baum } = klassifizieren(event);

  const cli = cliAufruf(text);
  if (cli?.aktion === "nehmen" && gueltigerBereich(cli.bereich) && !aus(cfg, cli.bereich)) {
    const fremd = nehmen(cli.bereich, id, cli.grund || "ausdrücklich genommen", null, true);
    if (fremd) blockieren(cli.bereich, fremd, text);
  }
  if (cli?.aktion === "freigeben") freigeben(id, (s) => !cli.bereich || cli.bereich === "alle" || s.bereich === cli.bereich);

  if (baum && !aus(cfg, "baum")) {
    const andere = andereAktive(id);
    if (andere.length) baumBlockieren(text, andere);
  }

  const genommen = [];
  for (const b of bereiche.filter((x) => !aus(cfg, x))) {
    const fremd = nehmen(b, id, text.replace(/\s+/g, " ").slice(0, 120), event.tool_use_id || null, false);
    if (fremd) {
      // all or nothing: give back what this call already took
      freigeben(id, (s) => !s.explizit && genommen.includes(s.bereich));
      blockieren(b, fremd, text);
    }
    genommen.push(b);
  }
}

function post(event) {
  const id = event.session_id;
  freigeben(id, (s) => !s.explizit && (!event.tool_use_id || !s.werkzeug || s.werkzeug === event.tool_use_id));
  const { bereiche, functions } = klassifizieren(event);
  // an explicit lock counts its 15 idle minutes from the end of the last command in its area
  for (const b of bereiche) {
    const s = sperreLesen(b);
    if (s && s.sitzung === id && s.explizit) {
      s.bis = Math.max(s.bis, Date.now() + TTL_EXPLIZIT);
      schreiben(sperrDatei(b), s);
    }
  }
  if (functions.length && event.tool_name !== "mcp__supabase__deploy_edge_function") deployWarnung(id, functions);
}

/** A deploy bundles the working tree: say so when that included another session's uncommitted code. */
function deployWarnung(id, functions) {
  const fremd = fremdeOffene(id);
  if (!fremd.length) return;
  const gebuendelt = new Set();
  for (const n of functions) for (const k of functionDateien(n)) gebuendelt.add(k);
  const treffer = fremd.filter((d) => gebuendelt.has(d.pfad));
  if (!treffer.length) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          "may-kit-sperren: Der Deploy hat ungesicherte Änderungen anderer Sessions mitgebündelt: " +
          treffer.map((d) => `${d.pfad} (${beschreibung(d.sitzung)})`).join("; ") +
          ". Prüfen, ob diese Fassung so ausgeliefert sein darf; sonst nach deren Commit erneut deployen.",
      },
    }),
  );
}

function datei(event) {
  const id = event.session_id;
  const pfad = event.tool_input?.file_path || event.tool_input?.notebook_path;
  if (!pfad) return;
  const k = schluessel(pfad);
  const eigene = lesen(dateienDatei(id)) || {};
  eigene[k] = Date.now();
  schreiben(dateienDatei(id), eigene);
  lebenszeichen(id);

  const fremd = fremdeOffene(id).filter((d) => d.pfad === k);
  if (fremd.length === 0) return;
  const wer = fremd.map((d) => `${beschreibung(d.sitzung)}${sitzung(d.sitzung).beendet ? " [beendet]" : ""} vor ${vor(d.t)}`).join("; ");
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PostToolUse",
        additionalContext:
          `Parallele Session (may-kit-sperren): ${k} hat auch ${wer} geändert, nicht committet. ` +
          "Vor dem Commit `git diff -- <datei>` lesen und nur eigene Hunks committen.",
      },
    }),
  );
}

function prompt(event) {
  const id = event.session_id;
  aufraeumen();
  lebenszeichen(id, event.prompt);

  const andere = andereAktive(id);
  if (andere.length === 0) return;

  const sperren = alleSperren();
  const offen = ungesichert();
  const zeilen = andere.map((s) => {
    const haelt = sperren.filter((x) => x.sitzung === s.id).map((x) => `${x.bereich} seit ${vor(x.seit)}`);
    const dateien = Object.keys(lesen(dateienDatei(s.id)) || {}).filter((p) => !offen || offen.has(p));
    return (
      `- ${beschreibung(s.id)}, aktiv vor ${vor(s.zuletzt)}` +
      (haelt.length ? `; hält: ${haelt.join(", ")}` : "") +
      (dateien.length ? `; ungesicherte Dateien: ${dateien.slice(0, 6).join(", ")}${dateien.length > 6 ? ` (+${dateien.length - 6})` : ""}` : "")
    );
  });
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext:
          `Parallele Sessions im selben Arbeitsbaum (may-kit-sperren):\n${zeilen.join("\n")}\n` +
          "Deren Dateien nicht mitcommitten; gesperrte Bereiche blockt der Hook, dann warten statt umgehen.",
      },
    }),
  );
}

// End of a turn: no foreground tool of this session is running any more. Catches automatic locks
// whose post hook never came (call denied, interrupted). Explicit locks stay until "freigeben",
// SessionEnd or 15 idle minutes.
function stop(event) {
  freigeben(event.session_id, (s) => !s.explizit);
}

function ende(event) {
  const id = event.session_id;
  freigeben(id, () => true);
  // a session that never reached a hook leaves no trace instead of an empty "beendet" entry
  if (!lesen(sitzungsDatei(id))) return;
  const s = sitzung(id);
  s.beendet = true;
  schreiben(sitzungsDatei(id), s);
}

// ---------- CLI ----------

export function cliAufruf(text) {
  const m = String(text || "").match(/sperren\.mjs["']?\s+(nehmen|freigeben)\b\s*([\w-]*)\s*(?:["']([^"']*)["'])?/);
  return m ? { aktion: m[1], bereich: m[2], grund: m[3] || "" } : null;
}

function cli(args) {
  const [aktion, bereich, arg] = args;
  if (aktion === "warten") {
    const bis = Date.now() + (Number(arg) || 900) * 1000;
    const pruefen = () => {
      const s = sperreLesen(bereich) || fremdeImWeg(bereich, null);
      if (!s) {
        console.log(`Bereich „${bereich}“ ist frei.`);
        process.exit(0);
      }
      if (Date.now() > bis) {
        console.log(`Bereich „${bereich}“ hält weiter ${beschreibung(s.sitzung)} — dem User melden.`);
        process.exit(1);
      }
      setTimeout(pruefen, 5000);
    };
    return pruefen();
  }
  if (aktion === "alle-aufheben") {
    // emergency exit for the user, e.g. after a crashed session; sessions themselves never call it
    const sperren = alleSperren();
    for (const s of sperren) loeschen(sperrDatei(s.bereich));
    console.log(sperren.length ? `Aufgehoben: ${sperren.map((s) => `${s.bereich} (${beschreibung(s.sitzung)})`).join(", ")}` : "Keine Sperren.");
    return;
  }
  const cfg = schalter();
  if (!cfg.an) console.log(`Sperren sind aus (${cfg.lokal.aus ? ".claude/sperren.local" : ".claude/sperren"}).`);
  // the untracked per-machine file is invisible in git, so say when it is in effect
  if (!cfg.lokal.aus && cfg.lokal.ohne.length) console.log(`Lokal abgeschaltet (.claude/sperren.local): ${cfg.lokal.ohne.join(", ")}.`);
  if (aktion === "nehmen" || aktion === "freigeben") {
    if (aktion === "nehmen" && !gueltigerBereich(bereich)) {
      console.log(`Unbekannter Bereich „${bereich}“. Gültig: ${Object.keys(BEREICHE).join(", ")}, functions, functions-<name>.`);
      process.exit(1);
    }
    // the actual work happened in the pre hook; report the result
    const s = bereich && bereich !== "alle" ? sperreLesen(bereich) : null;
    console.log(s ? `Bereich „${bereich}“ hält ${beschreibung(s.sitzung)} bis ${new Date(s.bis).toLocaleTimeString("de-DE")} (verlängert sich mit jedem Befehl im Bereich).` : `Bereich „${bereich || "alle"}“: keine Sperre.`);
    return;
  }
  const sperren = alleSperren();
  console.log(sperren.length ? sperren.map((s) => `${s.bereich}: ${beschreibung(s.sitzung)} seit ${vor(s.seit)}${s.explizit ? " (ausdrücklich)" : ""} — ${s.grund}`).join("\n") : "Keine Sperren.");
}

// ---------- entry ----------

const direkt = (() => {
  try {
    const a = resolve(process.argv[1] || "");
    return process.platform === "win32" ? a.toLowerCase() === SELBST.toLowerCase() : a === SELBST;
  } catch {
    return false;
  }
})();

if (direkt) {
  const modus = process.argv[2];
  if (!["pre", "post", "datei", "prompt", "stop", "ende"].includes(modus)) {
    cli(process.argv.slice(2));
  } else {
    let input = "";
    process.stdin.on("data", (d) => (input += d));
    process.stdin.on("end", () => {
      try {
        const cfg = schalter();
        const event = JSON.parse(input);
        if (cfg.an && event.session_id) ({ pre, post, datei, prompt, stop, ende })[modus](event, cfg);
      } catch {
        // fail-open: a broken lock must never stop work
      }
      process.exit(0);
    });
  }
}
