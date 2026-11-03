# may-kit einrichten — Prompt für Claude

Gib Claude in einem neuen oder bestehenden Workspace diesen Satz:

> Richte may-kit ein, nach https://github.com/mariusmaydev/may-kit/blob/main/INSTALL.md

oder kopiere den Teil unter der Linie direkt in den Chat.

---

Du richtest **may-kit** ein, die Claude-Code-Konfiguration von Marius May: globale Arbeitsregeln (`CLAUDE.md`), den Output-Style `Marius` und die Mod `may-kit-panel` (Knöpfe über dem Prompt: Review, Komprimieren, Live, ⚡, ?). Arbeite die Schritte der Reihe nach ab, melde am Ende in einer Tabelle `Schritt | Ergebnis`, und frag nur, wo unten „fragen“ steht.

## 1. Rechner (einmal je Rechner)

1. **Repo holen.** Liegt `may-kit` schon neben den anderen Repos (Windows: `%USERPROFILE%\Documents\GitHub\may-kit`), dort `git pull`. Sonst dorthin klonen: `gh repo clone mariusmaydev/may-kit`. Ein alter Ordner `claude-user-config` ist derselbe Stand unter altem Namen: umbenennen in `may-kit`, nicht doppelt klonen.
2. **Installieren.** Windows: `powershell -ExecutionPolicy Bypass -File install.ps1` im Repo. Das Skript verlinkt `CLAUDE.md` und `output-styles/` nach `~/.claude/`, sichert vorhandene Dateien als `.bak-<Datum>` und setzt in `~/.claude/settings.json` genau zwei Schlüssel: `outputStyle` und `env.CLAUDE_CODE_PLUGIN_DIRS` (alle Ordner unter `mods/`). Es braucht Node. Ohne Windows: dieselben zwei Links mit `ln -s` anlegen und die zwei Schlüssel von Hand setzen; vorher fragen.
3. **Prüfen**, jede Zeile mit Beleg:
   - `~/.claude/CLAUDE.md` und `~/.claude/output-styles` zeigen ins Repo.
   - `~/.claude/settings.json`: `"outputStyle": "Marius"`, und `CLAUDE_CODE_PLUGIN_DIRS` nennt `…/may-kit/mods/may-kit-panel`.
   - `claude plugin validate <repo>/mods/may-kit-panel` und `claude plugin test <repo>/mods/may-kit-panel` grün.
4. **Hinweis an Marius:** Die Mod und der Style greifen erst in einem **neuen** Chat.

## 2. Projekt (je Workspace)

Lies zuerst die Projekt-`CLAUDE.md`, falls es eine gibt. Sie hat Vorrang vor allem hier; nichts darin überschreiben, nur ergänzen.

Die Knöpfe richten sich nach dem Projekt:

| Knopf | erscheint, wenn | was er auslöst |
|---|---|---|
| Review | immer | schickt „Review starten“ mit den Commits der letzten REVIEW-EMPFEHLUNG (globale `CLAUDE.md` §5) |
| Komprimieren | immer | komprimiert mit der Anweisung des letzten `/compact`-Hinweises (§3a) |
| Live | `scripts/merge.ps1` existiert | schickt „Release nach production“; die Projekt-`CLAUDE.md` muss beschreiben, was das heißt |
| ⚡ | `.claude/arbeitsmodus` existiert | schickt „Modus schnell“ / „Modus sorgfältig“; grau = sorgfältig, gelb = schnell |
| ? | immer | klappt die Erklärungen auf |

Richte ein, was fehlt, **nach Rückfrage** (eine Frage mit allen Punkten, je Punkt dein Vorschlag):

1. **Arbeitsmodus.** Datei `.claude/arbeitsmodus` mit dem Wort `sorgfaeltig` anlegen und in der Projekt-`CLAUDE.md` einen Abschnitt „Arbeitsmodus — schnell oder sorgfältig“ ergänzen: was `schnell` erlaubt (fertige Änderung ohne Prüfung committen und bis Production ausliefern) und was in beiden Modi gilt (kein Datenverlust, Produktion nie implizit, Schema vor Code, nur eigene Dateien committen). Umschalten: „Modus schnell“ / „Modus sorgfältig“ → Claude schreibt das Wort und committet nur diese Datei.
2. **Release.** Nur wenn das Projekt einen Weg nach Production hat: ein Skript `scripts/merge.ps1` (oder das bestehende Release-Kommando dort verdrahten) und in der Projekt-`CLAUDE.md` ein Abschnitt, was „Release nach production“ Schritt für Schritt auslöst. Ohne Release-Weg nichts anlegen; der Live-Knopf bleibt dann weg.
3. **Review-Regel.** Steht in der Projekt-`CLAUDE.md` nichts zum Review, eine Zeile ergänzen: Reviews laufen auf Zuruf nach globaler `CLAUDE.md` §5 (Subagent prüft genau die Commits der Empfehlung, die Session behebt). Laufen im Workspace parallele Sessions, dazu: kein `/code-review`.

Danach nur die eigenen Dateien committen (`git commit --only <pfade>`), nie fremde Änderungen im Arbeitsbaum.

## 3. Grenzen

- Keine Klartext-Credentials in Dateien oder `settings.json`.
- `~/.claude/settings.json` nur über `install.ps1` bzw. `set-user-settings.cjs` ändern, keine weiteren Schlüssel.
- Nichts aus dem Repo `may-kit` selbst ändern, außer Marius sagt es; Anpassungen gehören ins Projekt.
