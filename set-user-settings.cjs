// Sets the repo's keys in a Claude Code user settings.json without touching anything else:
//   - "outputStyle": <style>
//   - "language": the system language (e.g. "german"), only when the key is missing: an existing
//     value is never overwritten, and English or an unknown locale sets nothing. Claude Code then
//     answers in that language, and the may-kit panel follows it.
//   - env.CLAUDE_CODE_PLUGIN_DIRS gains <plugin dir> (each mod folder, separated by ";" on
//     Windows, ":" elsewhere), so every new session loads the repo's mods.
//   - hooks.Stop loses the entry for hooks/model-line.mjs an earlier install added (removed 2026-11-08).
// Called by install.ps1:
//   node set-user-settings.cjs <settings.json> <backup stamp> <style> <plugin dir> [<plugin dir> …]
// The system language comes from MAY_KIT_LOCALE (install.ps1 passes the Windows display language),
// else LC_ALL, LC_MESSAGES, LANG, else the JavaScript runtime's locale.
// A backup <settings.json>.bak-<stamp> is written only when the file actually changes.
const fs = require("fs");
const path = require("path");

const [file, stamp, style, ...dirs] = process.argv.slice(2);
if (!file || !stamp || !style) {
  console.error("usage: node set-user-settings.cjs <settings.json> <stamp> <style> [<plugin dir> …]");
  process.exit(2);
}
const exists = fs.existsSync(file);
const before = exists ? fs.readFileSync(file, "utf8") : "";
const cfg = exists ? JSON.parse(before) : {};

/** The English name of the system language ("czech"), or null for English, C/POSIX or an unknown code. */
function systemLanguage() {
  const raw =
    [process.env.MAY_KIT_LOCALE, process.env.LC_ALL, process.env.LC_MESSAGES, process.env.LANG].find((v) => v && v.trim()) ||
    Intl.DateTimeFormat().resolvedOptions().locale;
  // "de_DE.UTF-8", "cs-CZ", "fr_FR@euro" -> primary language subtag "de", "cs", "fr"
  const code = String(raw).trim().split(/[.@]/)[0].replace(/_/g, "-").split("-")[0].toLowerCase();
  if (!code || code === "c" || code === "posix" || code === "en") return null;
  try {
    const name = new Intl.DisplayNames(["en"], { type: "language" }).of(code);
    return !name || name.toLowerCase() === code ? null : name.toLowerCase();
  } catch {
    return null; // Node built without ICU, or a code that is no language
  }
}

const report = [];
if (cfg.outputStyle !== style) { cfg.outputStyle = style; report.push(`set       outputStyle = ${style}`); }
else report.push(`ok        outputStyle (${style})`);

if (cfg.language !== undefined) report.push(`ok        language (${cfg.language}, kept)`);
else {
  const lang = systemLanguage();
  if (lang) { cfg.language = lang; report.push(`set       language = ${lang}`); }
  else report.push("skipped   language (English or unknown system language)");
}

const sep = process.platform === "win32" ? ";" : ":";
const norm = (p) => path.resolve(p).toLowerCase();
cfg.env = cfg.env || {};
let current = (cfg.env.CLAUDE_CODE_PLUGIN_DIRS || "").split(sep).filter(Boolean);
// A mod renamed or removed in the repo leaves a stale entry, and so does the repo itself when
// renamed (2026-11-03: claude-user-config -> may-kit): drop missing entries in the repo's mods
// folder or in any other folder named "mods". Existing entries elsewhere stay untouched.
const modParents = new Set(dirs.map((d) => norm(path.dirname(path.resolve(d)))));
current = current.filter((c) => {
  const parent = path.dirname(c);
  const stale = (modParents.has(norm(parent)) || path.basename(parent).toLowerCase() === "mods") && !fs.existsSync(c);
  if (stale) report.push(`removed   mod ${path.basename(c)} (no longer exists)`);
  return !stale;
});
for (const dir of dirs) {
  const abs = path.resolve(dir);
  if (current.some((c) => norm(c) === norm(abs))) report.push(`ok        mod ${path.basename(abs)}`);
  else { current.push(abs); report.push(`added     mod ${path.basename(abs)}`); }
}
if (current.length) cfg.env.CLAUDE_CODE_PLUGIN_DIRS = current.join(sep);
else delete cfg.env.CLAUDE_CODE_PLUGIN_DIRS;

// The Stop hook hooks/model-line.mjs (2026-11-08, same day removed): it blocked a turn without the
// model line and cost a whole extra request each time. An entry an earlier install left is taken
// out; other Stop hooks stay untouched, an emptied Stop list goes.
const isOurs = (h) => /[\\/]hooks[\\/]model-line\.mjs\b/.test(String(h?.command || ""));
const ownsOne = (g) => Array.isArray(g?.hooks) && g.hooks.some(isOurs);
const stop = cfg.hooks?.Stop;
if (Array.isArray(stop) && stop.some(ownsOne)) {
  // Only a group that held our entry and is empty without it goes; every other group stays as it was.
  const rest = stop.flatMap((g) => {
    if (!ownsOne(g)) return [g];
    const others = g.hooks.filter((h) => !isOurs(h));
    return others.length ? [{ ...g, hooks: others }] : [];
  });
  if (rest.length) cfg.hooks.Stop = rest;
  else delete cfg.hooks.Stop;
  if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
  report.push("removed   hook Stop model-line");
}

// Compare content, not formatting: an unchanged file is never rewritten.
if (JSON.stringify(JSON.parse(before || "{}")) !== JSON.stringify(cfg)) {
  if (exists) fs.copyFileSync(file, `${file}.bak-${stamp}`);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
}
console.log(report.join("\n"));
