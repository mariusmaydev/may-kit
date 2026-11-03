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
    if ($existing) {
        if ($existing.LinkType -and ($existing.Target | Select-Object -First 1) -eq $src) {
            Write-Host "ok      $($l.Source) (zeigt schon hierher)"
            continue
        }
        $backup = "$dest.bak-$stamp"
        Move-Item $dest $backup
        Write-Host "gesichert $($l.Source) -> $(Split-Path $backup -Leaf)"
    }

    try {
        New-Item -ItemType SymbolicLink -Path $dest -Target $src | Out-Null
        Write-Host "verlinkt $($l.Source) (Symlink)"
    } catch {
        if ($l.Kind -eq 'Directory') {
            New-Item -ItemType Junction -Path $dest -Target $src | Out-Null
            Write-Host "verlinkt $($l.Source) (Junction)"
        } else {
            throw "Symlink für $($l.Source) nicht möglich — Entwicklermodus einschalten oder als Admin ausführen."
        }
    }
}

Write-Host ''
Write-Host 'Fertig. Wirkt ab der nächsten Claude-Code-Session.'
