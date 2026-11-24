---
title: "Brug af Iris fra Claude Code, Cursor og andre agenter via MCP"
date: 2026-11-24T00:00:00.000Z
excerpt: Iris stiller hele sit værktøjssæt til kreativ lokalisering til rådighed via MCP. Forbind Claude Code, Cursor, Codex eller en anden agent, og bed den om at lokalisere billeder, undertekste og eftersynkronisere videoer samt kontrollere hvert marked i forhold til din ordliste, mens du følger arbejdet i appen.
category: Teknik
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

Kodeagenter er blevet rigtig gode til produktlokalisering. De udtrækker strenge, kobler `react-intl` til, åbner pull requests og tjekker pluralisformer. Vi har skrevet om den arbejdsgang for [GitHub](/blog/github-localisation-workflow-from-pull-request-to-multilingual-release) og for [React Intl og ICU](/blog/react-intl-icu-localisation-workflow-extract-sync-and-review).

Så skal lanceringen have en lanceringsvideo, en række sociale bannere og en produktdemo på seks sprog, og agenten kan ikke hjælpe. Kreative værktøjer er bygget op omkring, at en person klikker sig gennem en tidslinje eller et lærred. Der er ingen funktioner, som en agent kan kalde.

**[Iris](/iris)** fungerer anderledes. Alle funktioner i appen er også et MCP-værktøj. Tilslut din agent én gang, så kan den åbne kreativer, læse teksten i et billede, lokalisere den til hvert marked, undertekste og dubbe en video, kontrollere layouts og læse din ordliste og oversættelseshukommelse. Arbejdet foregår i Iris-appen på din Mac, så du kan følge med og træde til når som helst.

Dette indlæg gennemgår, hvordan det ser ud, hvordan du opretter forbindelse, og hvordan du giver en agent en kreativ lokaliseringsopgave, den rent faktisk kan løse.

## Hvorfor MCP-adgang er vigtig for kreativt arbejde

De fleste kreative værktøjer har en eksportknap, og nogle tilbyder en API til en enkelt opgave som f.eks. "oversæt denne undertekstfil". Ingen af delene lader en agent køre hele arbejdsgangen.

Lokalisering af ét kreativt materiale er en kæde af beslutninger: læs teksten, slå de godkendte termer op, oversæt, tegn om eller tilpas timingen, tjek hvert marked, ret det, der gik galt, og bed en person om at godkende. En agent kan kun stå for hele kæden, hvis den har adgang til hvert led.

Iris gør det hele tilgængeligt. Serveren viser hele sit værktøjssæt til enhver tilsluttet agent, og hvert værktøjs input og output er beskrevet som JSON Schema. Den indeholder også de samme færdighedssider, som Iris' indbyggede assistent bruger, om lokalisering, videoredigering, motion graphics og terminologi, så agenten lærer den rigtige arbejdsgang, før den går i gang, i stedet for at gætte.

Det betyder, at du kan uddelegere et ønsket resultat ("lokalisér denne kampagne til Frankrig, Tyskland og Japan") i stedet for at opliste hvert trin.

## Hvad en agent kan gøre via Iris

| Område | Hvad agenten kan gøre |
| --- | --- |
| **Billeder** | Læs teksten i et banner eller en annonce på sociale medier, oversæt den, og indsæt den godkendte tekst igen for hvert marked |
| **Video** | Genskab teksten på skærmen i en færdig video, oversæt den, og generér undertekster med samme timing som originalen |
| **Stemme** | Eftersynkronisér tale med talernes egne stemmer, indtal nye speak til hvert marked, og synkronisér læbebevægelserne |
| **Terminologi** | Slå op i ordlisten efter termer, godkendte og forbudte oversættelser samt oversættelseshukommelse for al tekst |
| **Retningslinjer** | Kontrollér teksten i forhold til dine uploadede brand- og compliance-dokumenter, og angiv resultater med kildehenvisninger |
| **Kvalitet** | Tjek hvert marked for tekst, der flyder over, undertekster, der går ud over skærmen, og manglende tegn, og få vist de frames med mest tekst |
| **Arbejdsområde** | Se lokaliseringsprojekter, opgaver, QA-rapporter og automatiseringer i dit Hyperlocalise-arbejdsområde |

Agenten bruger de samme ordlister og den samme oversættelseshukommelse som alle andre i dit arbejdsområde. Når agenten lokaliserer et banner, anvendes godkendte termer, og forbudte termer blokeres, ligesom det ville være tilfældet for en person, der bruger appen.

## Tilslut din agent

Iris kører sin MCP-server lokalt, mens appen er åben. Den kan kun tilgås fra din egen maskine på en fast adresse:

```text
http://127.0.0.1:4747/mcp
```

### Den hurtige måde

Åbn **Tilslut agenter via MCP** i Iris. Iris registrerer de agenter, der er installeret på din Mac, og skriver serveren ind i hver agents konfiguration, når du klikker på **Tilslut**. Det understøtter Claude Code, Claude Desktop, Cursor, VS Code (Copilot), GitHub Copilot CLI, Codex, Gemini CLI, Windsurf, Cline, Roo Code, Amp, OpenCode og flere andre.

### I hånden

Hvis du hellere selv vil tilføje den, skal du registrere en HTTP MCP-server med navnet `hyperlocalise-iris`. For Claude Code:

```bash
claude mcp add --scope user -t http hyperlocalise-iris http://127.0.0.1:4747/mcp
```

For Cursor skal du føje den til `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "hyperlocalise-iris": {
      "url": "http://127.0.0.1:4747/mcp"
    }
  }
}
```

Klienter, der kun kan starte lokale kommandolinjeservere, kan få adgang til URL'en via en generisk bro som `mcp-remote`.

### Tjek forbindelsen

Med Iris åben skal du spørge din agent:

```text
What screen do I have open in Hyperlocalise? Don't change anything.
```

Det skal beskrive, hvad der vises på skærmen i appen. Hvis værktøjerne mangler, skal du sørge for, at Iris kører. Serveren findes kun, mens appen er åben.

> **Iris' MCP-server er anderledes end den hostede [Hyperlocalise MCP-server](/use-cases/localisation-for-ai-coding-agents).** Den hostede server på `hyperlocalise.com/mcp` giver agenter adgang til dine projekter, kildefiler og oversættelsesnøgler fra alle steder. Iris' lokale server tilføjer kreativt arbejde (billeder, video og stemme) på din Mac. Mange teams forbinder begge.

## Giv agenten en opgave, den kan gøre færdig.

Agenter arbejder bedst med et klart resultat, et afgrænset omfang og et punkt, hvor et menneske kontrollerer resultatet. Her er nogle instruktioner, der fungerer godt:

Lokaliser et banner

```text
Open the summer-sale banner in Iris and localise it for fr-FR, de-DE and ja-JP.
Use our glossary and keep "Pro plan" in English. Check each market for overflow and
show me the results side by side. Don't export.
```

**Lav undertekster til en produktvideo**

```text
Subtitle the onboarding video for es-MX and pt-BR. Split cues at natural pauses,
keep product names together, and flag any cue that overflows the caption area.
```

**Gennemgå teksten, før den udgives**

```text
Look up the glossary terms in this ad copy for de-DE, then check the German
translation against our brand guidelines. List anything that breaks a rule,
with the guideline it breaks.
```

**Skab lanceringsmateriale ud fra en udgivelse**

```text
Read the release notes in this PR, write a 15-second launch video script, and build it
in Iris. Then localise the on-screen copy for our five launch markets and show me
a preview of each.
```

Det er her, det bliver interessant. Den samme agent, der lancerede funktionen, kan lave lanceringsmaterialet til alle markeder med den samme terminologi, som produktet bruger.

## Hold en person orienteret

Iris er bygget, så agenten udfører arbejdet, og en person godkender det.

- **Arbejdet er synligt.** Agenten arbejder i Iris-appen på din Mac, så du kan se det kreative materiale ændre sig undervejs og træde til når som helst.
- **Forhåndsvisninger før eksport.** Agenterne instrueres i at vise forhåndsvisningsbilleder og vente med den endelige eksport, indtil du beder om den.
- **Ændringer i ordlisten kræver enighed.** Agenter vejledes i at bekræfte et nyt begreb i ordlisten med dig, før de tilføjer det, i stedet for uden videre at ændre din termbase.
- **Godkendelser lærer arbejdsområdet.** Når du godkender et marked, gemmes den godkendte tekst i arbejdsområdets hukommelse, så næste agentkørsel tager udgangspunkt i den.

Det er det samme princip, der ligger bag alle Hyperlocalise-arbejdsgange, og som vi gennemgik i [Bør du bygge din egen lokaliseringsagent?](/blog/should-you-build-your-own-localisation-agent): Den svære del er ikke at generere output, men at bevare konteksten, sikre kvaliteten og lære af menneskelig feedback.

## Kom i gang

1. **[Download Iris](/iris)** til Mac. Det er gratis; generering bruger AI-kredit, som er inkluderet i betalte abonnementer fra 20 USD om måneden.
2. Åbn **Forbind agenter via MCP**, og tilslut de agenter, du bruger.
3. Bed din agent om at lokalisere ét aktiv, du sender ud denne måned.

Ny i Iris? Start med [launch-opslaget](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets), eller læs [Sådan lokaliserer du billedannoncer og kreativt indhold til sociale medier for hvert marked](/blog/how-to-localise-image-ads-and-social-creatives-for-every-market) for at se, hvordan din agent vil gribe arbejdsgangen an.
