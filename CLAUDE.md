# CLAUDE.md — Globale Arbeitsweise (User-Scope)

**Geltung:** alle Projekte, alle Repositories, alle Sessions. **Vorrang:** Eine Projekt-`CLAUDE.md` schlägt diese Datei; wo ein Projekt eigene Regeln für Autonomie, Risikoklassen, Antwortformat oder Gates hat, gelten dessen Regeln, diese Datei füllt die Lücken. Rangfolge bei Konflikt: Projekt-`CLAUDE.md` > diese Datei > Skills > Plugins > Standardverhalten.

**Zweck:** das stärkere Modell dort, wo Architekturverständnis und Fehleranalyse zählen — das schnellere dort, wo ein guter Plan nur noch ausgeführt wird. Ziel ist das beste Verhältnis aus Qualität, Zuverlässigkeit, Geschwindigkeit und Modelleinsatz, nicht maximaler Prozess.

---

## 0. Antwortstil — gilt immer

**Wie** geantwortet wird, regelt der Output-Style `Marius` (`output-styles/marius.md` im Repo `may-kit`, aktiv über `"outputStyle": "Marius"` in `~/.claude/settings.json`). Diese Datei regelt, **wann** etwas gesagt wird.

Fehlt der Style (fremde Umgebung, Codespace), gilt als Untergrenze: Ergebnis zuerst, kurze ganze Sätze, keine Werkzeug-Erzählung, keine Abschluss-Zusammenfassung; Datei:Zeile, Fehlermeldungen, Zahlen und Warnungen bleiben vollständig; ausführlich nur bei Compliance, Auth, Migrationen und destruktiven Eingriffen.

Die Hinweise aus §3a und §5 erscheinen nur im Fall „Ja" — sie sind Entscheidungsvorlage, nicht Zusammenfassung. Die Modellzeile aus §3 steht vor jeder Umsetzung, auch wenn das Modell bleibt.

---

## 1. Wann geplant wird

Planungsphase ist **Pflicht**, sobald einer dieser Punkte zutrifft — ODER-Liste, kein Ermessen:

- die Änderung berührt **≥ 3 Dateien** oder mehrere Komponenten
- **Datenbank:** Migration, Schemaänderung, RLS-Policy, Trigger
- **Auth, Berechtigungen, Security** in jeder Form
- **Foundation-Code:** Design-System-Primitive, geteilte Hooks, zentrale Utilities — alles mit vielen Aufrufern
- **Concurrency, Async-Verhalten, State-Management** über Komponentengrenzen hinweg
- **Geld-, Abrechnungs- oder sonstige kritische Geschäftslogik**
- die **Fehlerursache ist nicht verstanden** (Symptom bekannt, Ursache nicht)
- ein **neues Pattern** entsteht: erste Migration eines Typs, neue Testart, neue Schnittstelle nach außen

**Keine Planungsphase** bei: Einzeldatei-Änderung mit klarem Ziel, Textkorrektur, Umbenennung, Formatierung, Abarbeiten eines beschlossenen Plans, reiner Recherchefrage.

**Escape:** Sagt der User „mach einfach", „direkt umsetzen" oder Vergleichbares, entfällt die Phase — auch bei erfülltem Trigger. Ausnahme: Migration, Auth und Security bleiben planungspflichtig, der Plan wird dort auf das Nötigste gekürzt.

Diese Liste **schlägt die Selbsteinschätzung**: Ein Modell, das eine Ursache nicht verstanden hat, hält den Fall typischerweise für klar.

---

## 2. Planungsphase

Werkzeug ist der eingebaute **Plan-Mode** (Plan schreiben, ausgeben, Freigabe abwarten) — kein separater Mechanismus daneben. Erst lesen, dann planen: betroffener Code, Architektur, Konventionen, Abhängigkeiten. Alle wesentlichen Architektur- und Designentscheidungen fallen **hier**, nicht während der Umsetzung.

Der Plan enthält: betroffene Dateien und Komponenten · geplante Änderungen · Schnittstellen · Datenflüsse · Abhängigkeiten · Invarianten und Constraints · Edge Cases · Risiken und Seiteneffekte · notwendige Tests · Verifikationsschritte · mögliche Regressionen. Maßstab: **ein anderes Modell muss ihn umsetzen können, ohne die Architektur neu zu entwerfen.**

**Letzte Zeile des Plans** ist die Modellzeile nach §3 — sie steht damit schon im Freigabedialog.

**Plandatei:** Empfiehlt §3 einen Wechsel („**Weiter:**") oder steht ein Komprimier-Hinweis an (§3a), wird der Plan zusätzlich als Datei geschrieben — `docs/plans/<YYYY-MM-DD>-<slug>.md`, ersatzweise ins Scratchpad — und der Pfad genannt. Der Kontext überlebt Kompaktierung und Session-Ende nicht, der Plan muss das.

---

## 3. Modellempfehlung

**Wann:** vor **jeder Umsetzung** — vor der ersten Änderung an Code, Konfiguration oder Doku, unabhängig davon, ob eine Planungsphase lief (§1). Ausgenommen ist nur, was §1 als „keine Planungsphase" nennt, außer „Abarbeiten eines beschlossenen Plans": Dort steht die Zeile gerade. Auch „mach einfach" hebt sie nicht auf; sie kostet eine Zeile, keine Runde.

**Bleibt das Modell** — genau eine Zeile, dann direkt weiterarbeiten:

```
**Modell:** Opus xhigh passt, weil <Kriterium aus der Liste unten>.
```

**Lohnt ein Wechsel** — die Antwort endet mit dem Hinweis, umgesetzt wird **nicht**; der User wechselt und schickt den Auftrag (oder drückt den Knopf „Modell" der Mod `may-kit-panel`, der `/compact`, `/model` und `/effort` ausführt und den Auftrag schickt):

````
**Weiter:** [erst `/compact`, dann] `/model` → [Opus | Sonnet], Effort [medium | high | xhigh]. [Begründung, ein Satz.]
Plan: <Pfad> [· danach Opus-Review]

```
/compact …   ← nur wenn zugleich ein Schnittpunkt nach §3a erreicht ist
```
````

Pflichtinhalt: Modell, Effort, Begründung; Plandatei, sobald eine geschrieben wurde (§2); „danach Opus-Review", wenn §5 schon absehbar „Ja" ergibt. Die Schreibweise `/model` → <Modell>, Effort <Stufe> ist fest: Die Mod liest genau sie.

**Plan-Mode:** Der Plan endet mit der Modellzeile (§2). Steht dort „**Weiter:**", startet die Freigabe **nicht** die Umsetzung: Plandatei schreiben, den Hinweis ausgeben, Antwort beenden.

**Nicht weglassen:** Die Zeile fehlt nie stillschweigend. Ein fehlender Hinweis sieht aus wie ein vergessener; deshalb steht auch „passt" ausdrücklich da. Als richtig gilt das laufende Modell nur mit einem benannten Kriterium — „ich bin ja schon da" ist keins.

**Mechanik:** Den Modellwechsel löst der User aus (`/model`, oder der Knopf „Modell"). Effort setzt `/effort <stufe>` (persistiert als `effortLevel`): `low | medium | high | xhigh | max | auto`; empfohlen werden nur `medium | high | xhigh`. Subagents ohne eigene `model:`-Angabe laufen auf Sonnet (`CLAUDE_CODE_SUBAGENT_MODEL` in `~/.claude/settings.json`, seit 2026-11-02) — wer einen Subagent für schwere Analyse braucht, gibt das Modell ausdrücklich mit.

**Kriterien:**
- **Sonnet medium** — mechanische, vollständig definierte Arbeit: repetitive Änderungen, Boilerplate, Umbenennungen, einfache Tests, Migration auf ein festgelegtes Interface, kleine Refactorings ohne Architekturentscheidung.
- **Sonnet high** — **bevorzugter Executor** für gut geplante Implementierung: Architektur steht, Plan detailliert, Komponenten bekannt, Zielverhalten und Verifikation eindeutig, keine grundlegenden Entscheidungen mehr zu erwarten.
- **Opus xhigh** — sobald eines zutrifft: offene Architekturentscheidung · unklare Anforderung oder unklares Systemverhalten · Ursache nicht verstanden · tiefe Analyse erst während der Umsetzung möglich · komplexe Wechselwirkungen zwischen Systemen · Concurrency und Race Conditions · riskante Migration · Security · komplexes State-Management · verteilte oder Agentensysteme · ein Fehler würde systemisch und schwer erkennbar wirken.

**Kopplung an das Projektmodell:** Hat das Projekt ein eigenes Autonomie- oder Risikomodell (Stufen 1–3, Risikoklassen S/M/L o. ä.), ist **dessen Vokabular maßgeblich**:

| Projekt-Einstufung | Konsequenz |
|---|---|
| höchste Stufe (Stop-and-Wait / Klasse L) | Opus xhigh, **kein** Delegieren an Sonnet |
| mittlere Stufe (autonomer Lauf mit Endprüfung / Klasse M) | Plan + Sonnet high |
| niedrigste Stufe (vollautonom / Klasse S) | keine Planungsphase, Modellzeile, direkt arbeiten |

Ohne solches Modell gilt allein die Trigger-Liste aus §1.

---

## 3a. Komprimieren an Abschnittsgrenzen

Komprimiert wird an einer **Abschnittsgrenze**, nicht ab einer Token-Zahl. Ziel: Der nächste Abschnitt startet mit allem, was er braucht — und ohne den Ballast des vorigen.

**Schnittpunkte** — dann den Hinweis geben:
- Plan freigegeben, Umsetzung beginnt. Die Erkundung hat ihren Zweck erfüllt; die Umsetzung braucht nur noch den Plan.
- Etappe oder Aufgabe fertig: verifiziert, committet, Stand dokumentiert.
- Fehlersuche abgeschlossen: Ursache und Fix stehen fest, die Spuren der Suche braucht niemand mehr.
- Themenwechsel: Der neue Auftrag hat mit dem bisherigen nichts zu tun → `/clear` statt `/compact`.

**Kein Schnittpunkt**, solange: eigene Änderungen ungesichert sind · eine Rückfrage oder Freigabe offen ist · ein Lauf im Hintergrund arbeitet · ein Review aussteht, das sich auf eben gelesenen Code bezieht · der nächste Schritt direkt auf gerade Gelesenem aufbaut und das Neu-Lesen mehr kostet, als es spart.

**Vorher sichern** — was weiter gebraucht wird, gehört in Dateien, nicht in die Zusammenfassung: Plan → Plandatei (§2) · Stand → Spec bzw. Doku · Entscheidungen → Entscheidungslog oder Spec · Umgebungsfallen → Fehlerkatalog bzw. Projekt-Memory.

**Was mitgeht:** Ziel des nächsten Abschnitts · Pfade zu Plan und Spec (mit §) · Entscheidungen und Weisungen aus dem Gespräch, die noch nirgends stehen · gefundene Fallen · offene Punkte.
**Was nicht mitgeht:** Dateiinhalte, Tool-Ausgaben, Logs · verworfene Entwürfe · Erkundungswege (nur deren Ergebnis: „X geprüft, scheidet aus, weil …").

**Form** — am Ende der Antwort, nach dem Ergebnis:

````
**Jetzt komprimieren:** <Abschnitt> fertig, Stand in <Datei>.

```
/compact <Ziel des nächsten Abschnitts>; Grundlage <Pfad §>; offen: …; Fallen: …
```
````

Der Befehl steht immer in einem eigenen Codeblock, damit er kopierfertig ist, und bleibt kurz (höchstens rund zehn Zeilen); was länger wäre, gehört in eine Datei. Fallen Komprimieren und Modellwechsel (§3) zusammen, wird daraus **ein** „Weiter:"-Hinweis nach §3: **erst `/compact`, dann `/model`** — so schreibt noch das stärkere Modell die Zusammenfassung.

---

## 4. Umsetzung durch ein anderes Modell

Der Plan ist **bindend**. Kleine technische Anpassungen sind erlaubt, solange die Architektur unberührt bleibt; Architektur nicht eigenmächtig neu entwerfen.

Stoppen und eskalieren, sobald: eine zentrale Annahme des Plans falsch ist · ein wichtiger Edge Case übersehen wurde · die Architektur grundlegend anders sein müsste · größere ungeplante Abhängigkeiten auftauchen · eine erhebliche Designentscheidung ansteht · die Lösung nicht sicher oder robust umsetzbar ist. Den Arbeitsstand vorher in einen benennbaren Zustand bringen (committet oder präzise beschrieben):

```
OPUS-ESKALATION EMPFOHLEN
- Problem:
- Warum der Plan nicht ausreicht:
- Welche Entscheidung neu zu treffen ist:
- Stand der Implementierung: [was fertig ist, welche Dateien angefasst sind, ob committet und lauffähig]
```

---

## 5. Review nach der Umsetzung

Erst nach bestandenen Tests und Verifikation. **Belege vor Behauptungen:** Prüfkommandos tatsächlich ausführen und die Ausgabe lesen, bevor „fertig", „behoben" oder „grün" fällt.

**Zeitpunkt:** Empfohlen wird erst, wenn keine offene Frage und kein fehlender Teil den Code der Etappe mehr ändern kann. Was offen bleiben darf, ohne das Review zu verschieben: Gerätetest, Browser-Test, Laufzeitmessung, Punkte einer späteren Etappe. Steht eine Rückfrage aus, deren Antwort den Code ändern kann, kommt zuerst die Frage, die Review-Empfehlung erst nach der Umsetzung der Antwort.

**Bündeln:** Kleine Teilschritte derselben Etappe (4b, 4c …) werden gemeinsam geprüft, nicht jeder einzeln. Die Empfehlung kommt nach dem letzten Teilschritt und nennt den Umfang (Commit-Bereich oder Teilschritte). Ausnahme: Ein Teilschritt mit Auth-, RLS- oder Security-Logik, auf dem der nächste aufbaut, wird sofort geprüft.

Ausgabe **nur im Fall „Ja"**:

```
REVIEW-EMPFEHLUNG
- Opus-Review empfohlen: Ja
- Modell / Effort: [Opus | Sonnet] / [medium | high | xhigh]
- Begründung:
- Besonders zu prüfen:
- Commits: <sha> [<sha> …]
```

`Commits:` nennt nur die eigenen Commits der Etappe als Kurz-SHAs. Ein Bereich `a..b` reicht nicht, weil andere Sessions dazwischen auf denselben Branch committen.

**Ablauf, wenn der User „Review starten" sagt** (oder den Review-Button der Mod `may-kit-panel` drückt):
1. **Prüfen lässt die Session einen frischen Subagent** (Agent-Tool, `model` und `effort` wie im Block). Er bekommt die SHAs aus dem `Commits:`-Block der letzten REVIEW-EMPFEHLUNG (fehlt der Block, etwa nach `/compact`, nennt die Session ihre Kandidaten und fragt nach, statt per `git log` zu raten: Commits paralleler Sessions tragen denselben Autor), die Liste „Besonders zu prüfen" und den Auftrag, genau `git show <sha>` je Commit zu prüfen, nichts sonst. Er liest den umliegenden Code, ändert nichts und liefert Befunde mit Datei:Zeile nach dem Maßstab unten.
2. **Beheben tut die Session selbst:** jeden Befund, der ihre eigenen Dateien betrifft, mit Ursache belegt (§6). Befunde in Dateien anderer Sessions oder ohne echten Fehler werden genannt, nicht angefasst.
3. Danach Tests, Commit (`git commit --only`), Meldung: je Befund behoben, verworfen (mit Grund) oder fremd.

**Kein `/code-review`, solange parallele Sessions im selben Arbeitsbaum laufen, auch nicht mit Ziel.** Das Skill kennt als Ziel nur PR, Branch oder Pfad. Ohne Ziel nimmt es den Diff gegen den Upstream samt aller ungesicherten Dateien im Arbeitsbaum, also auch die der anderen Sessions; ein Branch-Ziel bringt deren Commits mit, ein Pfad-Ziel ihre Änderungen in derselben Datei. Commit-SHAs als Argument ignoriert es (festgestellt 2026-11-03: 81 fremde Dateien statt zwei eigener Commits). Ohne parallele Sessions bleibt `/code-review` erlaubt.

**Ja bei:** systemweiten oder architektonischen Änderungen · größeren Refactorings · neuen Kernkomponenten · komplexen Datenflüssen · Agenten-, Memory- oder Orchestrierungssystemen · Concurrency und Async-Logik · Datenbankmigrationen · Security-Komponenten · kritischer Geschäftslogik (Trading, Finanzen, Abrechnung) · komplexem State-Management · vielen indirekten Abhängigkeiten · seltenen Fehlern mit großer Wirkung · **jeder Abweichung vom ursprünglichen Plan**. **Nein** bei einfachen, eindeutig überprüfbaren Implementierungen — kein Review-Theater.

**Aufgabe des Opus-Reviews:** **Fehler suchen**, nicht bestätigen. Geprüft wird: Anforderungen vollständig · Umsetzung entspricht dem Konzept · unnötige Komplexität · verletzte Architekturprinzipien · versteckte Seiteneffekte · fehlende Edge Cases · Fehlerbehandlung · Race Conditions und State-Probleme · neue technische Schulden · decken die Tests die relevanten Fehlerfälle · Regressionen · unbeabsichtigt veränderte Funktionen · deutlich einfachere oder robustere Lösung. Befunde nach **Kritisch / Hoch / Mittel / Niedrig**, getrennt in tatsächliches Problem · Risiko · optionaler Verbesserungsvorschlag.

---

## 6. Verhältnis zu Skills, Debugging

- **Das Superpowers-Plugin ist bewusst deaktiviert** (2026-09-03, in beiden Scopes `false`). Sein Prozessgerüst trägt diese Datei (§2–§5). Nicht ungefragt reaktivieren, kein gleichwertiges Skill-Gerüst ersatzweise aufbauen.
- **Debugging:** Bei Bug, Testausfall oder unerwartetem Verhalten zuerst die Ursache belegen — reproduzieren, Hypothese formulieren, am Code oder an Logs prüfen — erst dann einen Fix vorschlagen. Kein Reparieren auf Verdacht.

---

## 7. Browser: gemeinsames Chrome (nur dieser Rechner)

Der MCP-Server `chrome-devtools` (User-Scope, `~/.claude.json`) hängt an **einem** Chrome, das sich alle Sessions und Projekte teilen (`~/.claude/tools/chrome-geteilt.mjs`, Port 9333 (9222 belegt das normale Chrome), Profil `~/.cache/chrome-devtools-mcp/chrome-profile`, dort angemeldet; eingerichtet 2026-10-23).

- Immer mit `new_page` einen **eigenen Tab** öffnen und nur darin arbeiten. Fremde Tabs (andere Sessions, Marius) nie auswählen, bedienen oder schließen — `list_pages` zeigt sie alle.
- Den eigenen Tab am Ende mit `close_page` schließen.
- Nicht ab- oder ummelden; die Anmeldung gehört allen Sessions.
- Antwortet Chrome nicht, läuft meist noch ein Chrome mit demselben Profil ohne Debug-Port (altes Plugin) — Marius bitten, es zu schließen, nicht selbst beenden.

---

*Angelegt 2026-09-03, gestrafft 2026-11-02, §3a Komprimieren 2026-11-03, §3 Modellzeile vor jeder Umsetzung 2026-11-03.*
