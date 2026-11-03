// Sets "outputStyle" in a Claude Code settings.json without touching anything else.
// Called by install.ps1: node set-output-style.cjs <settings.json> <style name> <backup stamp>
// A backup <settings.json>.bak-<stamp> is written only when the file actually changes.
const fs = require("fs");
const [file, style, stamp] = process.argv.slice(2);
if (!file || !style || !stamp) { console.error("usage: node set-output-style.cjs <settings.json> <style> <stamp>"); process.exit(2); }
const exists = fs.existsSync(file);
const cfg = exists ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
if (cfg.outputStyle === style) { console.log(`ok        outputStyle (${style})`); process.exit(0); }
if (exists) fs.copyFileSync(file, `${file}.bak-${stamp}`);
cfg.outputStyle = style;
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + "\n");
console.log(`gesetzt   outputStyle = ${style}`);
