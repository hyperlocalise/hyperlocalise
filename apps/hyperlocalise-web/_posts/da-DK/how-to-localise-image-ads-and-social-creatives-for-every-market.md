---
title: Sådan lokaliserer du billedannoncer og socialt indhold til alle markeder
date: 2026-11-24T00:00:00.000Z
excerpt: Det er nemt at oversætte billedteksten. Det er teksten, der er indlejret i banneret, som får kampagner på tværs af markeder til at gå langsommere. Denne guide gennemgår, hvordan du lokaliserer billedannoncer, indhold til sociale medier og produktbilleder, så versionen til hvert marked fremstår, som om den var lavet lokalt.
category: Produkt
tags:
  - Iris
  - ad localisation
  - creative localisation
  - image localisation
  - social media localisation
  - marketing localisation
  - transcreation
  - localisation
  - localization
  - terminology consistency
  - visual QA
  - RTL
---

Din kampagne går live på otte markeder på mandag. Annonceteksterne er oversat, billedteksterne er klar, og landingssiderne er live.

Så spørger nogen om bannerne.

Overskriften, tilbuddet og handlingsopfordringen er alle en del af billedet. Hvert marked skal have sin egen version, så en designer åbner kildefilen igen, indsætter oversættelserne, opdager, at den tyske overskrift ikke kan være der, gør den mindre, opdager, at den japanske skrifttype mangler, og gentager processen for alle størrelser og markeder. Efter 40 grafikker går kampagnen live torsdag, og ét marked viser stadig prisen fra sidste kvartal.

Denne guide gennemgår, hvordan du lokaliserer billedannoncer og kreativt indhold til sociale medier korrekt: hvad du skal beslutte, før du går i gang, hvordan du håndterer tekst, der er indlejret i billedet, og hvordan du kontrollerer hvert marked, inden materialet lanceres. I de praktiske afsnit bruger vi **[Iris](/iris)**, Hyperlocalises Mac-app til flersprogede materialer, men tjeklisten gælder, uanset hvilke værktøjer du bruger.

## Hvorfor billedannoncer er den sværeste del af en kampagne at lokalisere

Tekst i et produkt eller på et website findes i tekststrenge. Du kan udtrække den, oversætte den og sende den tilbage. Tekst i et billede fungerer ikke på samme måde.

- **Teksten er en del af billedet.** Medmindre nogen har gemt en lagdelt kildefil for hver størrelse, er der ikke noget at udskifte.
- **Hvert marked mangedobler arbejdet.** Ét koncept × fire størrelser × otte markeder giver 32 materialer, og hver ændring i teksten starter optællingen forfra.
- **Pladsen er fast.** En overskrift, der passer på engelsk, kan være 30 % længere på tysk, og boksen bliver ikke større.
- **Skriftsystemer fungerer forskelligt.** Japansk og thai ombryder linjer uden mellemrum mellem ordene. Arabisk læses fra højre mod venstre. Mange brandskrifttyper mangler tegn for alle disse sprog.
- **Annoncer er underlagt regler.** Vilkår for tilbud, priser, ansvarsfraskrivelser og forbudte påstande varierer fra marked til marked, og fejl i betalt annoncering er offentlige og dyre.

Så problemet handler egentlig ikke om oversættelse. Det handler om at genskabe materialet på hvert marked, samtidig med at designet, brandtermerne og de juridiske tekster bevares.

## Trin 1: Fastlæg markederne, ikke kun sprogene.

Start med en liste over markeder skrevet som landekoder: `fr-FR`, `de-DE`, `ja-JP`, `pt-BR`, `ar-AE`.

Sprog alene er ikke nok. Spansk i Spanien og spansk i Mexico adskiller sig i ordvalg, tone og formalitetsniveau. Portugisisk i Brasilien og Portugal adskiller sig mere, end de fleste teams forventer. En pris, der vises som `€49` i Frankrig, skrives `49 €`. Et tilbud på "Black Friday" betyder måske ingenting eller henviser til de forkerte datoer på nogle markeder.

For hvert marked skal du skrive:

- **Tiltaleform.** Formel eller uformel tiltale (`tu`/`vous`, `du`/`Sie`).
- **Tilbud og priser.** Valuta, format og om tilbuddet overhovedet gælder.
- **Juridisk tekst.** Ansvarsfraskrivelser, vilkår og alt, hvad myndighederne kræver.
- **Om man skal oversætte eller omskrive.** Et ordspil eller en kulturel reference kan kræve en ny tekst, ikke en oversættelse. Det er [transcreation](/blog/hyperlocalisation-why-global-growth-needs-more-than-translation), og det er en beslutning, der skal træffes på forhånd, ikke noget, man først opdager i gennemgangen.

## Trin 2: Få terminologien på plads, før nogen oversætter

De fleste fejl i lokalisering af annoncer skyldes terminologi, ikke grammatik: Produktnavnet oversættes, selvom det burde forblive på engelsk, en konkurrents varemærke bruges om en generisk funktion, eller en påstand, som juridisk afdeling fjernede i sidste kvartal, dukker op igen på ét marked.

Før du lokaliserer noget, skal du sikre dig, at din ordliste dækker :

- **Produkt- og funktionsnavne** samt hvorvidt de enkelte oversættes.
- **Godkendte oversættelser** af tilbagevendende kampagneudtryk som "gratis prøveperiode", "i en begrænset periode" og "tilmeld dig".
- **Forbudte termer**, dvs. ord, der aldrig må forekomme på et bestemt marked.
- **Slogans**, med en godkendt version for hvert marked i stedet for en ny oversættelse til hver kampagne.

I Hyperlocalise bruger Iris de samme ordlister og den samme oversættelseshukommelse som webappen. Godkendte oversættelser anvendes, og forbudte termer blokeres i tekst på skærmen og i billedprompter. Hvis jeres regler står i en brandbog eller et compliance-dokument, kan I uploade det som en [retningslinje](/product/guidelines) og tjekke teksten op imod den. Vi går mere i dybden med ejerskab og håndhævelse i [Sådan sikrer du en ensartet brandstemme og terminologi på tværs af markeder](/blog/how-to-keep-brand-voice-and-terminology-consistent-across-markets).

## Trin 3: Lokalisér teksten i billedet

Der er to udgangspunkter, og de kræver forskellige tilgange.

### Du har et færdigt billede

Dette er det mest almindelige tilfælde. Du har en flad PNG- eller JPEG-fil fra et bureau eller et designværktøj, og teksten er indlejret i billedet.

I Iris foregår forløbet sådan:

1. **Åbn billedet** som en annonce.
2. **Læs teksten i billedet.** Iris finder hver enkelt tekst og registrerer dens placering, så du får overskriften, tilbuddet, handlingsopfordringen og det med småt som separate elementer.
3. **Oversæt og gennemgå disse elementer** ved at sammenholde dem med din ordliste og oversættelseshukommelse. Du gennemgår teksten, ikke billedet, hvilket er hurtigere og nemmere at dele med korrekturlæsere på hvert marked.
4. **Tilpas billedet til hvert marked.** Iris tegner den godkendte tekst på ny i samme position og stil og bevarer fotografiet, produktet og layoutet, som det var.

Hvert resultat gemmes som den kreative version til det pågældende marked og vises ved siden af originalen, så du kan sammenligne markederne side om side. Du behøver ikke en lagdelt fil eller et rent baggrundsbillede.

### Du designer det helt fra bunden.

Hvis det kreative materiale ikke findes endnu, skal du oprette originalen i Iris ud fra en brief. Medtag jeres brandfarver, den skrifttype, I bruger, layoutet, den præcise tekst i anførselstegn samt jeres logo og produktbilleder som referencer. Lokaliser det derefter på samme måde.

Skriv kildeteksten med lokalisering for øje:

- **Hold overskriften kort.** Hvert ord, du fjerner på engelsk, sparer endnu mere på tysk.
- **Sæt ikke tekstfragmenter sammen.** “Gem” + “20 %” + “i dag” fungerer ikke på sprog med en anden ordstilling. Skriv hele sætningen.
- **Sørg for plads.** Planlæg med cirka en tredjedel mere plads, end den engelske tekst kræver.

Hvis det kreative materiale skal bruges på mange markeder og ofte ændres, kan du overveje at gøre teksten til redigerbare tekstlag i stedet for at indlejre den i billedet. Redigerbar tekst kan stadig redigeres og oversættes som enhver anden meddelelse.

## Trin 4: Kontrollér layoutet på alle markeder

Det er dette trin, teams springer over, og det er det, kunderne lægger mærke til.

Oversættelser varierer i længde. Tysk, finsk og fransk tekst fylder ofte 20–35 % mere end engelsk. Kinesisk og japansk tekst fylder mindre, hvilket kan efterlade uhensigtsmæssigt meget tom plads. Arabisk og hebraisk læses fra højre mod venstre, så venstrejusterede layouts ser forkerte ud. Thai, japansk og kinesisk tekst ombrydes uden mellemrum, så linjeskift kan opstå uventede steder.

For hvert marked skal du kontrollere:

| Tjek | Hvad du skal se efter |
| --- | --- |
| **Overløb** | Tekst, der er skåret af, løber ud over kanten eller overlapper produktet |
| **Linjeskift** | Enkeltord alene på sidste linje eller linjeskift, der deler et brandnavn eller en pris |
| **Retning** | Højre-mod-venstre-tekst justeret til højre eller centreret, mens layoutet stadig er afbalanceret |
| **Skrifttyper** | Manglende tegn (tomme felter) eller en reservefont, der ikke passer til brandet |
| **Tal** | Priser, procenter og datoer skrevet, som det marked skriver dem |
| **Egnethed** | Tekst, der stadig er kort nok til at kunne læses på det sekund eller deromkring, en annonce på sociale medier får |

Iris tjekker for disse problemer, og du kan forhåndsvise hvert marked i fuld størrelse, før du godkender det. For langvarige kampagner skal du udføre de samme kontroller, som du ville bruge i en [audit af website-lokalisering](/blog/what-is-a-website-localisation-audit), da det er den samme idé anvendt på kreative elementer.

## Trin 5: Gennemgå med personer, der kender markedet

AI hjælper dig med at nå frem til et stærkt første udkast på alle markeder. En person, der kender markedet, bør stadig godkende alt, du betaler for at vise kunderne.

Gør gennemgangen hurtig:

- **Send anmelderne teksten og det renderede billede**, ikke et regneark med løsrevne strenge.
- **Stil specifikke spørgsmål.** Lyder overskriften naturlig ? Er tilbuddet tydeligt ? Er der noget, der ikke passer til brandet eller virker risikabelt ?
- **Ret problemerne ved kilden.** Hvis et begreb er forkert, skal du rette det i ordlisten i stedet for i ét enkelt billede, så det bliver korrekt i alt efterfølgende materiale.
- **Gem godkendelser.** Når et marked godkender teksten, husker arbejdsområdet den godkendte tekst, så den næste kampagne kan tage udgangspunkt i den i stedet for at starte fra bunden.

## Trin 6: Eksportér og mål pr. marked

Eksportér kun de markeder, der er blevet godkendt. Navngiv filerne efter koncept, størrelse og sprog/region, så mediekøbere ikke uploader det franske banner til det tyske annoncesæt.

Behandl derefter lokalisering som noget, du kan måle. Sammenlign klikrate og konvertering pr. marked med en kontrolgruppe, hvor kun teksten er oversat, eller med resultaterne fra sidste kampagne. Hvis et marked klarer sig dårligere, er annonceteksten en variabel, du nu kan ændre på få minutter i stedet for dage. Det er her, [eksperimenter på tværs af markeder](/use-cases/market-experimentation) bliver praktiske.

## En tjekliste til din næste kampagne

- [ ] Markeder angivet som lokalitetskoder med sprogregister, tilbud og juridisk tekst for hvert marked
- [ ] Beslutning truffet om oversættelse eller omskrivning af overskrifter og slogans
- [ ] Ordlisten dækker produktnavne, tilbagevendende kampagneudtryk og forbudte termer.
- [ ] Kildeteksten er kortfattet, skrevet som hele sætninger og har plads til at vokse.
- [ ] Billedtekst læst, oversat og gennemgået i forhold til ordlisten
- [ ] Alle markeder forhåndsvises for overløb, linjeskift, tekstretning, skrifttyper og tal
- [ ] Godkendt af en bedømmer, der kender hvert marked
- [ ] Godkendelserne er gemt, så den næste kampagne kan tage udgangspunkt i dem.
- [ ] Filer navngivet efter koncept, størrelse og sprogvariant; resultater følges pr. marked

## Prøv det på ét aktiv.

Du behøver ikke ændre hele din kampagneproces for at se forskellen. Vælg ét banner, du skal sende ud denne måned, og ét marked, du har udskudt. Lokaliser det i Iris, tjek layoutet, og sammenlign resultatet og den tid, det tog, med din nuværende proces.

Iris er gratis at downloade til Mac, og generering bruger AI-kreditter, der er inkluderet i betalingsabonnementer fra 20 $ om måneden. Læs [Iris' lanceringsindlæg](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets) for at få det fulde overblik, eller **[download Iris](/iris)** og kom i gang med din næste kampagne.
