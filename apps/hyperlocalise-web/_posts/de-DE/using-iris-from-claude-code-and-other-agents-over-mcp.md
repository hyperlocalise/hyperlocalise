---
title: "Iris mit Claude Code, Cursor und anderen Agenten über MCP nutzen"
date: 2026-11-24T00:00:00.000Z
excerpt: Iris stellt sein komplettes Toolset für kreative Lokalisierung über MCP bereit. Verbinde Claude Code, Cursor, Codex oder einen anderen Agenten und bitte ihn, Bilder zu lokalisieren, Videos zu untertiteln und zu synchronisieren sowie jeden Markt anhand deines Glossars zu prüfen – während du die Arbeit in der App mitverfolgst.
category: Ingenieurwesen
tags:
  - Iris
  - MCP
  - Model Context Protocol
  - Claude Code
  - Cursor
  - AI agents
  - creative localisation
  - video localisation
  - image localisation
  - localisation
  - localization
  - agentic workflows
---

Coding-Agenten sind inzwischen sehr gut in der Produktlokalisierung. Sie extrahieren Strings, binden `react-intl` ein, öffnen Pull Requests und prüfen Pluralformen. Wir haben über diesen Workflow für [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) und für [React Intl und ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review) geschrieben.

Dann braucht die Veröffentlichung ein Launch-Video, eine Reihe von Social-Media-Bannern und eine Produktdemo in sechs Sprachen – und der Agent kann nicht helfen. Kreativtools sind darauf ausgelegt, dass eine Person durch eine Zeitleiste oder eine Arbeitsfläche klickt. Ein Agent kann sie nicht bedienen.

**[Iris](/iris)** funktioniert anders. Jede Funktion in der App ist auch ein MCP-Tool. Verbinde deinen Agenten einmal, und er kann Werbemittel öffnen, den Text in einem Bild auslesen, ihn für jeden Markt lokalisieren, ein Video untertiteln und vertonen, Layouts prüfen sowie dein Glossar und Translation Memory lesen. Die Arbeit findet in der Iris-App auf deinem Mac statt, sodass du sie beobachten und jederzeit eingreifen kannst.

Dieser Beitrag behandelt, wie das aussieht, wie du eine Verbindung herstellst und wie du einem Agenten eine kreative Lokalisierungsaufgabe gibst, die er tatsächlich abschließen kann.

## Warum MCP-Zugriff für kreative Arbeit wichtig ist

Die meisten Kreativtools bieten eine Export-Schaltfläche, und einige stellen eine API für einzelne Aufgaben bereit, etwa „diese Untertiteldatei übersetzen“. Mit keinem davon kann ein Agent den gesamten Workflow ausführen.

Die Lokalisierung eines Werbemittels umfasst eine ganze Reihe von Entscheidungen: den Text lesen, die freigegebenen Begriffe nachschlagen, übersetzen, das Design neu gestalten oder das Timing anpassen, jeden Markt prüfen, Fehler beheben und eine Person um Freigabe bitten. Ein Agent kann diese Prozesskette nur dann eigenständig verantworten, wenn er auf jeden einzelnen Schritt zugreifen kann.

Iris stellt all das bereit. Der Server listet sein gesamtes Toolset für jeden verbundenen Agenten auf und beschreibt die Eingaben und Ausgaben jedes Tools mit JSON Schema. Außerdem stellt er dieselben Skill-Seiten bereit, die auch Iris’ integrierter Assistent nutzt. Sie decken Lokalisierung, Videobearbeitung, Motion Graphics und Terminologie ab, damit der Agent den richtigen Workflow lernt, bevor er loslegt, statt zu raten.

Das bedeutet, dass du ein Ergebnis delegieren kannst („Lokalisiere diese Kampagne für Frankreich, Deutschland und Japan“), statt jeden einzelnen Schritt aufzulisten.

## Was ein Agent über Iris tun kann

| Bereich | Was der Agent tun kann |
| --- | --- |
| **Bilder** | Lies den in ein Banner oder eine Social-Media-Anzeige integrierten Text, übersetze ihn und setze den freigegebenen Text für jeden Markt neu |
| **Video** | Den Bildschirmtext eines fertigen Videos nachbilden, übersetzen und Untertitel mit denselben Zeitmarken wie im Original erstellen |
| **Stimme** | Sprache mit den eigenen Stimmen der Sprecher synchronisieren, neue Voiceovers für jeden Markt erstellen und Lippenbewegungen synchronisieren |
| **Terminologie** | Suche im Glossar nach Begriffen, freigegebenen und unzulässigen Übersetzungen sowie Übersetzungsspeichern für beliebige Texte |
| **Richtlinien** | Prüfe die Texte anhand deiner hochgeladenen Marken- und Compliance-Dokumente und gib Ergebnisse mit Quellenangaben aus |
| **Qualität** | Prüfe jeden Markt auf überlaufenden Text, Untertitel, die über den Bildschirmrand hinauslaufen, und fehlende Zeichen. Zeige eine Vorschau der Frames mit dem meisten Text an. |
| **Arbeitsbereich** | Lokalisierungsprojekte, Aufträge, QA-Berichte und Automatisierungen in deinem Hyperlocalise-Arbeitsbereich lesen |

Der Agent verwendet dieselben Glossare und Übersetzungsspeicher wie alle anderen in deinem Arbeitsbereich. Wenn er ein Banner lokalisiert, werden genehmigte Begriffe angewendet und verbotene Begriffe blockiert – genau wie bei einer Person, die die App verwendet.

## Verbinde deinen Agenten

Iris betreibt seinen MCP-Server lokal, solange die App geöffnet ist. Er ist nur von deinem eigenen Gerät aus unter einer festen Adresse erreichbar:

```text
http://127.0.0.1:4747/mcp
```

### Der schnelle Weg

Öffne in Iris **Agenten über MCP verbinden**. Iris erkennt die auf deinem Mac installierten Agenten und trägt den Server mit **Verbinden** in die Konfiguration jedes Agenten ein. Unterstützt werden Claude Code, Claude Desktop, Cursor, VS Code (Copilot), GitHub Copilot CLI, Codex, Gemini CLI, Windsurf, Cline, Roo Code, Amp, OpenCode und einige weitere.

### Von Hand

Wenn du ihn lieber selbst hinzufügen möchtest, registriere einen HTTP-MCP-Server namens `hyperlocalise-iris`. Für Claude Code:

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

Füge es für Cursor zu `~/.cursor/mcp.json` hinzu:

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

Clients, die nur lokale Kommandozeilen-Server starten können, können über eine generische Bridge wie `mcp-remote` auf die URL zugreifen.

### Überprüfe die Verbindung.

Frag bei geöffnetem Iris deinen Agenten:

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

Es sollte beschreiben, was in der App auf dem Bildschirm zu sehen ist. Wenn die Tools fehlen, stelle sicher, dass Iris läuft. Der Server ist nur verfügbar, solange die App geöffnet ist.

> **Iris' MCP-Server unterscheidet sich vom gehosteten [Hyperlocalise-MCP-Server](/use-cases/localisation-for-ai-coding-agents).** Der gehostete Server unter `hyperlocalise.com/mcp` stellt Agents von überall aus deine Projekte, Quelldateien und Übersetzungsschlüssel bereit. Iris' lokaler Server ergänzt kreative Arbeit (Bilder, Videos und Sprache) auf deinem Mac. Viele Teams verbinden beide.

## Gib dem Agenten eine Aufgabe, die er erledigen kann.

Agenten erzielen die besten Ergebnisse mit einem klaren Ziel, einem festgelegten Umfang und einem Punkt, an dem eine Person das Ergebnis überprüft. Einige Prompts, die gut funktionieren:

**Banner lokalisieren**

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

**Ein Produktvideo untertiteln**

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**Prüfe den Text, bevor er veröffentlicht wird**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**Mach aus einem Release Launch-Materialien**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

Genau hier wird es interessant. Derselbe Agent, der das Feature ausgeliefert hat, kann die Launch-Materialien für jeden Markt erstellen und dabei dieselbe Terminologie verwenden wie das Produkt.

## Eine Person auf dem Laufenden halten

Iris ist so konzipiert, dass der Agent die Arbeit erledigt und eine Person sie genehmigt.

- **Die Arbeit ist sichtbar.** Der Agent arbeitet in der Iris-App auf deinem Mac. So kannst du sehen, wie sich die Werbemittel verändern, und jederzeit eingreifen.
- **Vorschauen vor dem Export.** Agenten werden dazu angeleitet, Vorschauen zu zeigen und den endgültigen Export erst vorzunehmen, wenn du danach fragst.
- **Änderungen am Glossar müssen abgestimmt werden.** Agenten werden angewiesen, einen neuen Glossarbegriff mit dir abzustimmen, bevor sie ihn hinzufügen, statt deine Terminologiedatenbank stillschweigend zu ändern.
- **Freigaben machen den Arbeitsbereich schlauer.** Wenn du einen Markt freigibst, wird der freigegebene Text im Arbeitsbereichsspeicher abgelegt, sodass der nächste Agentenlauf darauf aufbaut.

Das ist derselbe Grundsatz, der hinter jedem Hyperlocalise-Workflow steht und den wir in [Sollten Sie Ihren eigenen Lokalisierungsagenten entwickeln?](/blog/should-you-build-your-own-localisation-agent) behandelt haben: Die Schwierigkeit besteht nicht darin, Ergebnisse zu generieren, sondern den Kontext zu wahren, die Qualität zu sichern und aus menschlichem Feedback zu lernen.

## Loslegen

1. **[Iris herunterladen](/iris)** für Mac. Es ist kostenlos; die Generierung verbraucht KI-Guthaben, das in kostenpflichtigen Tarifen ab 20 $ pro Monat enthalten ist.
2. Öffne **Agenten über MCP verbinden** und verbinde die Agenten, die du verwendest.
3. Bitte deinen Agenten, ein Asset zu lokalisieren, das du diesen Monat veröffentlichst.

Neu bei Iris? Beginne mit dem [Launch-Beitrag](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets) oder lies [So lokalisierst du Bildanzeigen und Social-Media-Creatives für jeden Markt](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market), um mehr über den Workflow zu erfahren, dem dein Agent folgen wird.
