# Links the user-scope Claude Code configuration from this repo into ~/.claude.
# Run once per machine after cloning; afterwards `git pull` is enough.
#
#   powershell -ExecutionPolicy Bypass -File .\install.ps1
#
# Existing files/folders in ~/.claude are moved to <name>.bak-<timestamp> before linking,
# never deleted. Re-running is safe: entries that already point here are left alone.
# Symlinks need Windows Developer Mode (or an elevated shell); folders fall back to a junction.

$ErrorActionPreference = 'Stop'
$repo   = $PSScriptRoot
$target = Join-Path $env:USERPROFILE '.claude'
$stamp  = Get-Date -Format 'yyyy-MM-dd-HHmmss'

# Repo entry -> name in ~/.claude. Extend this list when more config moves into the repo.
$links = @(
    @{ Source = 'CLAUDE.md';     Kind = 'File' },
    @{ Source = 'output-styles'; Kind = 'Directory' }
)

if (-not (Test-Path $target)) { New-Item -ItemType Directory -Path $target | Out-Null }

foreach ($l in $links) {
    $src  = Join-Path $repo $l.Source
    $dest = Join-Path $target $l.Source
    if (-not (Test-Path $src)) { throw "Fehlt im Repo: $src" }

    $existing = Get-Item $dest -Force -ErrorAction SilentlyContinue
    $backup = $null
    if ($existing) {
        if ($existing.LinkType -and ($existing.Target | Select-Object -First 1) -eq $src) {
            Write-Host "ok        $($l.Source) (zeigt schon hierher)"
            continue
        }
        $backup = "$dest.bak-$stamp"
        Move-Item $dest $backup
        Write-Host "gesichert $($l.Source) -> $(Split-Path $backup -Leaf)"
    }

    # mklink honours Developer Mode; New-Item -ItemType SymbolicLink in PowerShell 5.1 does not.
    $flag = if ($l.Kind -eq 'Directory') { '/D' } else { '' }
    cmd /c "mklink $flag `"$dest`" `"$src`"" | Out-Null
    if (-not (Test-Path $dest) -and $l.Kind -eq 'Directory') {
        cmd /c "mklink /J `"$dest`" `"$src`"" | Out-Null
    }

    if (Test-Path $dest) {
        Write-Host "verlinkt  $($l.Source)"
    } else {
        # Never leave ~/.claude without the file: put the backup back before failing.
        if ($backup) { Move-Item $backup $dest; Write-Host "zurück    $($l.Source) (Sicherung wiederhergestellt)" }
        throw "Link für $($l.Source) nicht möglich — Windows-Entwicklermodus einschalten oder als Admin ausführen."
    }
}

# Activate the output style and the mods in ~/.claude/settings.json. Node rewrites the JSON, because
# PowerShell 5.1's ConvertTo-Json truncates nesting and escapes umlauts. A backup is kept.
$outputStyle = 'Marius'
$settings = Join-Path $target 'settings.json'
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "übersprungen outputStyle: node fehlt — von Hand \"outputStyle\": \"$outputStyle\" setzen"
} else {
    # Every folder under mods/ is loaded by every new session via env.CLAUDE_CODE_PLUGIN_DIRS.
    $mods = @(Get-ChildItem (Join-Path $repo 'mods') -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.FullName })
    # The JS lives in its own file: PowerShell 5.1 strips quotes from inline `node -e` arguments.
    node (Join-Path $repo 'set-user-settings.cjs') $settings $stamp $outputStyle @mods
    if ($LASTEXITCODE -ne 0) { throw "settings.json konnte nicht gelesen werden — Sicherung liegt daneben." }
}

Write-Host ''
Write-Host 'Fertig. Wirkt ab der nächsten Claude-Code-Session.'
