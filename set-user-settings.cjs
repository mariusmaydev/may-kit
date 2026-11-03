// Sets the repo's keys in a Claude Code user settings.json without touching anything else:
//   - "outputStyle": <style>
//   - env.CLAUDE_CODE_PLUGIN_DIRS gains <plugin dir> (each mod folder, separated by ";" on
//     Windows, ":" elsewhere), so every new session loads the repo's mods.
// Called by install.ps1:
//   node set-user-settings.cjs <settings.json> <backup stamp> <style> <plugin dir> [<plugin dir> …]
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

const report = [];
if (cfg.outputStyle !== style) { cfg.outputStyle = style; report.push(`gesetzt   outputStyle = ${style}`); }
else report.push(`ok        outputStyle (${style})`);

const sep = process.platform === "win32" ? ";" : ":";
const norm = (p) => path.resolve(p).toLowerCase();
cfg.env = cfg.env || {};
let current = (cfg.env.CLAUDE_CODE_PLUGIN_DIRS || "").split(sep).filter(Boolean);
// A mod renamed or removed in the repo leaves a stale entry: drop entries in the repo's
// mods folder that no longer exist. Entries elsewhere stay untouched.
const modParents = new Set(dirs.map((d) => norm(path.dirname(path.resolve(d)))));
current = current.filter((c) => {
  const stale = modParents.has(norm(path.dirname(c))) && !fs.existsSync(c);
  if (stale) report.push(`entfernt  Mod ${path.basename(c)} (gibt es nicht mehr)`);
  return !stale;
});
for (const dir of dirs) {
  const abs = path.resolve(dir);
  if (current.some((c) => norm(c) === norm(abs))) report.push(`ok        Mod ${path.basename(abs)}`);
  else { current.push(abs); report.push(`eingetragen Mod ${path.basename(abs)}`); }
}
if (current.length) cfg.env.CLAUDE_CODE_PLUGIN_DIRS = current.join(sep);
else delete cfg.env.CLAUDE_CODE_PLUGIN_DIRS;

// Compare content, not formatting: an unchanged file is never rewritten.
if (JSON.stringify(JSON.parse(before || "{}")) !== JSON.stringify(cfg)) {
  if (exists) fs.copyFileSync(file, `${file}.bak-${stamp}`);
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
}
console.log(report.join("\n"));
