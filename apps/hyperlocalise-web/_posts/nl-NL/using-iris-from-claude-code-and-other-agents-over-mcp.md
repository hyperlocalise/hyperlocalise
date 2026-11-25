---
title: "Iris gebruiken vanuit Claude Code, Cursor en andere agents via MCP"
date: 2026-11-24T00:00:00.000Z
excerpt: Iris stelt zijn volledige creatieve lokalisatietoolset beschikbaar via MCP. Koppel Claude Code, Cursor, Codex of een andere agent en vraag deze om afbeeldingen te lokaliseren, video’s te ondertitelen en te dubben, en elke markt aan je woordenlijst te toetsen, terwijl je in de app ziet hoe het werk vordert.
category: Engineering
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

Codeagents zijn erg goed geworden in productlokalisatie. Ze halen strings op, koppelen `react-intl`, openen pull requests en controleren meervoudsvormen. We hebben over die workflow geschreven voor [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) en voor [React Intl en ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review).

Vervolgens heeft de release een lanceringsvideo, een reeks banners voor sociale media en een productdemo in zes talen nodig, maar de agent kan niet helpen. Creatieve tools zijn gemaakt voor iemand die door een tijdlijn of canvas klikt. Er is niets wat een agent kan aanroepen.

**[Iris](/iris)** werkt anders. Elke functie in de app is ook een MCP-tool. Koppel je agent één keer en die kan creatieve uitingen openen, de tekst in een afbeelding lezen, deze voor elke markt lokaliseren, een video ondertitelen en nasynchroniseren, lay-outs controleren en je woordenlijst en vertaalgeheugen raadplegen. Het werk wordt uitgevoerd in de Iris-app op je Mac, zodat je kunt meekijken en op elk moment kunt ingrijpen.

Deze post bespreekt hoe dat eruitziet, hoe je verbinding maakt en hoe je een agent een creatieve lokalisatieopdracht geeft die die ook echt kan afronden.

## Waarom MCP-toegang belangrijk is voor creatief werk

De meeste creatieve tools hebben een exportknop, en sommige bieden een API voor één specifieke taak, zoals 'vertaal dit ondertitelbestand'. Met geen van beide kan een agent de volledige workflow uitvoeren.

Eén uiting lokaliseren is een reeks beslissingen: de tekst lezen, de goedgekeurde termen opzoeken, vertalen, opnieuw vormgeven of de timing aanpassen, elke markt controleren, herstellen wat niet goed is gegaan en iemand om goedkeuring vragen. Een agent kan die hele reeks alleen voor zijn rekening nemen als die toegang heeft tot elke schakel.

Iris stelt dit allemaal beschikbaar. De server toont de volledige set tools aan elke verbonden agent, met de invoer en uitvoer van elke tool beschreven in JSON Schema. Ook bevat de server dezelfde vaardigheidspagina’s die de ingebouwde assistent van Iris gebruikt, over lokalisatie, videobewerking, motion graphics en terminologie, zodat de agent de juiste werkwijze leert voordat die aan de slag gaat, in plaats van te gokken.

Dat betekent dat je een resultaat kunt overdragen (‘lokaliseer deze campagne voor Frankrijk, Duitsland en Japan’) in plaats van elke stap op te sommen.

## Wat een agent via Iris kan doen

| Gebied | Wat de agent kan doen |
| --- | --- |
| **Afbeeldingen** | Lees de tekst in een banner of socialmedia-advertentie, vertaal deze en plaats de goedgekeurde tekst opnieuw voor elke markt |
| **Video** | Bouw de tekst in beeld van een voltooide video opnieuw op, vertaal die en genereer ondertitels met dezelfde timing als het origineel |
| **Stem** | Dub spraak met de eigen stemmen van de sprekers, genereer nieuwe voice-overs per markt en synchroniseer de lipbewegingen |
| **Terminologie** | Zoek in de woordenlijst naar termen, goedgekeurde en verboden vertalingen en vertaalgeheugen voor alle teksten |
| **Richtlijnen** | Controleer de tekst aan de hand van je geüploade merk- en compliancedocumenten en vermeld bij je bevindingen de bron |
| **Kwaliteit** | Controleer elke markt op overlopende tekst, bijschriften die buiten het scherm vallen en ontbrekende tekens, en bekijk een voorbeeld van de frames met de meeste tekst |
| **Werkruimte** | Lokalisatieprojecten, taken, QA-rapporten en automatiseringen in je Hyperlocalise-werkruimte bekijken |

De agent gebruikt dezelfde woordenlijsten en vertaalgeheugens als iedereen in je werkruimte. Wanneer de agent een banner lokaliseert, worden goedgekeurde termen toegepast en verboden termen geblokkeerd, net zoals bij iemand die de app gebruikt.

## Verbind je agent

Iris draait lokaal een MCP-server zolang de app geopend is. Die is alleen bereikbaar vanaf je eigen machine op een vast adres:

```text
http://127.0.0.1:4747/mcp
```

### De snelle manier

Open in Iris **Agents verbinden via MCP**. Iris detecteert de agents die op je Mac zijn geïnstalleerd en schrijft de server met **Verbinden** naar de configuratie van elke agent. Het ondersteunt Claude Code, Claude Desktop, Cursor, VS Code (Copilot), GitHub Copilot CLI, Codex, Gemini CLI, Windsurf, Cline, Roo Code, Amp, OpenCode en diverse andere.

### Met de hand

Als je het liever zelf toevoegt, registreer dan een HTTP MCP-server met de naam `hyperlocalise-iris`. Voor Claude Code:

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

Voor Cursor voeg je het toe aan `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

Clients die alleen lokale servers via de opdrachtregel kunnen starten, kunnen de URL bereiken via een generieke brug zoals `mcp-remote`.

### Controleer de verbinding

Vraag je agent terwijl Iris geopend is:

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

Het moet beschrijven wat er op het scherm in de app staat. Als de tools ontbreken, zorg er dan voor dat Iris actief is. De server bestaat alleen zolang de app geopend is.

> **Iris' MCP-server is anders dan de gehoste [Hyperlocalise MCP-server](/use-cases/localisation-for-ai-coding-agents).** De gehoste server op `hyperlocalise.com/mcp` geeft agents overal toegang tot je projecten, bronbestanden en vertaalsleutels. Iris' lokale server voegt creatief werk (afbeeldingen, video en spraak) toe op je Mac. Veel teams verbinden beide.

## Geef de agent een taak die hij kan voltooien.

Agenten leveren hun beste werk met een duidelijk resultaat, een afgebakende scope en een moment waarop iemand het resultaat controleert. Enkele prompts die goed werken:

**Een banner lokaliseren**

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

**Ondertitel een productvideo**

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**Controleer de tekst voordat deze live gaat**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**Zet een release om in lanceringsmateriaal**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

Dat laatste is waar het interessant wordt. Dezelfde agent die de functie heeft opgeleverd, kan de lanceringsmaterialen voor elke markt maken, met dezelfde terminologie als het product.

## Houd iemand op de hoogte.

Iris is zo ontworpen dat de agent het werk doet en een persoon het goedkeurt.

- **Het werk is zichtbaar.** De agent werkt in de Iris-app op je Mac, zodat je de creaties ziet veranderen terwijl die eraan werkt en op elk moment kunt ingrijpen.
- **Previewframes vóór exports.** Agents worden aangestuurd om previewframes te tonen en de definitieve export pas te maken als je daarom vraagt.
- **Voor wijzigingen in de woordenlijst is overeenstemming nodig.** Agenten worden aangemoedigd om een nieuwe term in de woordenlijst eerst met je af te stemmen voordat ze die toevoegen, in plaats van je termenbank stilletjes aan te passen.
- **Goedkeuringen helpen de werkruimte leren.** Wanneer je een markt goedkeurt, wordt de goedgekeurde tekst opgeslagen in het werkgeheugen, zodat de volgende agentrun daarvan uitgaat.

Dat is hetzelfde principe achter elke Hyperlocalise-workflow, waarover we het hebben gehad in [Moet je je eigen lokalisatieagent bouwen?](/blog/should-you-build-your-own-localisation-agent): het moeilijke deel is niet het genereren van output, maar context behouden, kwaliteit bewaken en leren van menselijke feedback.

## Aan de slag

1. **[Download Iris](/iris)** voor Mac. Het is gratis; voor het genereren wordt AI-tegoed gebruikt dat is inbegrepen bij betaalde abonnementen vanaf $20 per maand.
2. Open **Agents verbinden via MCP** en verbind de agents die je gebruikt.
3. Vraag je agent om één asset te lokaliseren die je deze maand uitbrengt.

Nieuw bij Iris? Begin met het [lanceringsbericht](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets) of lees [Zo lokaliseer je beeldadvertenties en social creatives voor elke markt](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market) voor de workflow die je agent zal volgen.
