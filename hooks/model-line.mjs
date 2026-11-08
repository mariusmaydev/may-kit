#!/usr/bin/env node
// Placeholder (2026-11-08). The Stop hook that lived here was removed the same day: each block cost a
// whole extra request. An install from before still names this file under hooks.Stop in
// ~/.claude/settings.json until install.ps1 runs again (the may-kit panel does that at the next
// session start). Without the file every turn would report MODULE_NOT_FOUND, so it ends at once.
// Delete once every machine has run the installer.
process.exit(0)
