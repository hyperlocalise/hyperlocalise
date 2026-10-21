---
title: Hvad er en audit af et websites lokalisering?
date: 2026-08-13T00:00:00.000Z
excerpt: At oversætte et website er kun begyndelsen. En lokaliseringsgennemgang vurderer den tekniske implementering, sproglige kvalitet, produktkontekst og visuelle oplevelse – og fortæller dig, hvad du skal rette først.
category: Produkt
tags:
  - localisation audit
  - website localisation
  - localisation
  - localization
  - hreflang
  - translation quality
  - visual QA
  - product localisation
  - AI translation
  - SEO
  - terminology consistency
  - RTL
---

At oversætte et website er kun begyndelsen på lokalisering.

Et website kan have oversatte sider og stadig give internationale brugere en dårlig oplevelse. Et manglende `hreflang`-tag kan gøre det sværere at blive fundet. En oversat opfordring til handling kan forvirre besøgende. En teknisk korrekt oversættelse kan stadig bruge den forkerte produktbetegnelse. En længere tysk tekst kan få en knap til at gå i stykker på mobilen.

Spørgsmålet, som en lokaliseringsrevision besvarer, er ikke "hvor mange strenge er oversat?" Det er:

> **Føles dit website, som om det faktisk er udviklet til brugere i denne region?**

Hyperlocalise-lokaliseringsauditten gennemgår et website på fire områder — teknisk, sprogligt, kontekstuelt og visuelt — og giver en samlet lokaliseringsscore på 100 samt en liste over de problemer, der bør løses først.

## Hvad en lokaliseringsrevision omfatter

En lokaliseringsaudit er ikke en oversættelseskontrol, og det er ikke en generisk webstedsaudit.

Værktøjer til ydeevne, tilgængelighed og SEO ser på implementeringen. Kvalitetssikring af oversættelser ser på nøjagtighed, grammatik og sproglig naturlighed. Ingen af delene giver et fuldstændigt billede af et flersproget website.

En lokaliseringsrevision kombinerer begge perspektiver:

| Revision         | Vægt  | Hvad det besvarer                                      |
| ---------------- | -----: | ----------------------------------------------------- |
| Teknisk audit    |    25% | Er lokalisering implementeret korrekt?                |
| Sproglig gennemgang |    25% | Er oversættelserne præcise, naturlige og konsekvente?   |
| Kontekstuel gennemgang |    25% | Giver lokaliseringen mening i forbindelse med dit produkt? |
| Visuel gennemgang |    25% | Ser den lokaliserede brugergrænseflade korrekt ud og fungerer den korrekt?      |

Du får en samlet score, en score for hvert område samt handlingsorienterede fund med alvorlighedsgrad, dokumentation og konfidens.

## Sådan fortolkes scoren

Den samlede score er en indikator for sundhedstilstanden, ikke en erstatning for de detaljerede fund. Gennemgå altid problemerne med den højeste alvorlighedsgrad først.

| Score  | Bedømmelse        | Hvad det betyder                                                     |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 90–100 | Fremragende        | Den lokaliserede oplevelse er i rigtig god stand                     |
| 75–89  | God              | Webstedet er generelt godt lokaliseret, men der er enkelte problemer, der bør forbedres |
| 50–74  | Bør forbedres | Brugere kan opleve mærkbare lokaliseringsproblemer                 |
| 25–49  | Dårlig            | Væsentlige lokaliseringsmangler påvirker oplevelsen           |
| 0–24   | Kritisk          | Den lokaliserede oplevelse har alvorlige problemer, der bør løses |

Et website kan have en god samlet score og stadig have ét kritisk problem i betalingsflowet, routing eller på en side med meget trafik. Scoren fortæller dig, hvor du skal kigge. Resultaterne fortæller dig, hvad du skal rette.

## Teknisk audit: Er lokalisering implementeret korrekt?

Den tekniske audit gennemgår infrastrukturen bag et flersproget website: hvor let det er at finde, routing, formatering, tilgængelighed, og om brugere og søgemaskiner kan nå frem til den korrekte sprogversion.

### Registrering af lokalitet og routing

Pages should declare their language and locale correctly, for example `<html lang="fr-FR">`. The audit looks for missing language declarations, incorrect language or region codes, locale/content mismatches, and inconsistent identifiers.

Den kontrollerer også, om lokaliserede sider bruger en ensartet URL-struktur:

```text
/en/pricing
/fr/pricing
/de/pricing
```

Almindelige fejl omfatter manglende lokaliserede ruter, ugyldige URL'er for sprogversioner, forkerte omdirigeringer, uventet fallback til standardsprogversionen og problemer med at bevare sprogvalget.

### Sprogskifter og `hreflang`

Besøgende skal kunne ændre sprogindstilling uden at miste den side, de ser på. Når de skifter fra `/fr/pricing`, skal de lande på `/de/pricing`, ikke på den tyske hjemmeside.

Revisionen kontrollerer også relationerne mellem lokaliserede versioner af en side: manglende `hreflang`, forkerte sprog- eller regionskoder, ugyldige URL'er, manglende gensidige referencer eller selvreferencer, forkerte `x-default` og konflikter med kanoniske URL'er.

Lokaliserede sider bør generelt have sig selv som canonical URL. En fransk prisside, der angiver den engelske version som canonical, er en almindelig SEO-fejl:

```text
/fr/pricing
canonical → /en/pricing
```

### Metadata, sitemaps og strukturerede data

Vigtige sidemetadata skal lokaliseres: titler, metabeskrivelser, Open Graph-titler og -beskrivelser, `og:locale` og metadata til deling på sociale medier.

Gennemgangen kontrollerer også, om lokaliserede URL'er findes i sitemapet og fører til de korrekte sider, og, hvor det er relevant, om strukturerede data såsom Produkt, Webside, Brødkrummer, FAQ, Organisation, Artikel og Lokal virksomhed er lokaliseret.

### International formatering og tilgængelighed

Lokaletilpassede værdier skal følge lokaliteten:

```text
US:  $1,234.56
DE:  1.234,56 €
FR:  1 234,56 €
```

Det omfatter datoer, klokkeslæt, tal, valuta, måleenheder og tidszoner.

Tilgængelighedslokalisering omfatter `lang`, `aria-label`, tilgængelige navne, formularlabels, valideringsmeddelelser og billeders `alt`-tekst.

## Sproglig gennemgang: Er sproget korrekt, naturligt og konsekvent?

Den sproglige evaluering vurderer sproget på siden. Den går videre end blot at kontrollere, om teksten er oversat. Den undersøger, om oversættelsen formidler den rette betydning og lyder naturlig for brugere i det pågældende sprogområde.

### Fuldstændighed og nøjagtighed

Ikke-oversat indhold markeres, mens brandnavne, produktnavne, URL'er, e-mailadresser, kode, egennavne og bevidst anvendt engelsk terminologi betragtes som forventede undtagelser.

En fransk side, hvor der står:

```text
Bienvenue sur notre site.

Start your free trial
```

ville blive markeret for den uoversatte opfordring til handling.

Nøjagtighedskontroller leder efter manglende eller tilføjet betydning, forkert fortolkning, forkerte tal, forkerte produkthandlinger og forkert terminologi.

### Flydende sprog, terminologi og brandstemme

En oversættelse kan være teknisk korrekt og stadig lyde unaturlig. Gennemgangen ser efter kluntede formuleringer, unaturlig sætningsstruktur, grammatiske fejl og stavefejl, spor af maskinoversættelse samt lokale skrivekonventioner.

Det identificerer også begreber, der er oversat forskelligt på tværs af webstedet:

```text
Workspace

Page 1 → Espace de travail
Page 2 → Workspace
Page 3 → Espace Workspace
```

Hvis projektet har en godkendt ordliste, har ordlistens terminologi forrang.

Brandets tone vurderes ud fra den tilsigtede stil — professionel, venlig, kortfattet, teknisk, samtalende, eksklusiv eller legende — samt lokale grammatik- og stilregler, såsom brug af store og små bogstaver, tegnsætning, formalitetsniveau og kongruens.

## Kontekstuel vurdering: Er oversættelsen korrekt for dette produkt?

Kontekst er en af de nemmeste dele af lokalisering at overse.

En oversættelse kan være grammatisk perfekt og stadig være forkert i den sammenhæng, den vises i. Ordet "Cancel" kan betyde at lukke en dialogboks, opsige et abonnement, annullere en ordre eller stoppe en handling. Den rigtige oversættelse afhænger af produktets kontekst.

Den kontekstuelle gennemgang bruger side-, brugergrænseflade-, terminologi- og produktkontekst til at vurdere, om oversættelser giver mening dér, hvor de bruges.

### UI-, produkt- og CTA-intention

Gennemgangen tager højde for, hvor en tekststreng vises — på en knap, i navigationen, i en formular, i et modalvindue, i et værktøjstip, i en overskrift, i en fejlmeddelelse, i en notifikation, i en menu eller i betalingsflowet — og vurderer sproget i forhold til produktbegreberne på siden: funktionsnavne, abonnementer, indstillinger, kontobegreber, arbejdsgangshandlinger og produkterminologi.

Handlingsopfordringer kræver særlig opmærksomhed. "Start gratis prøveperiode", "Book nu", "Gem ændringer", "Slet konto" og "Opgrader" skal formidle den tilsigtede handling på målsproget, ikke en generisk ækvivalent.

### Ordliste, oversættelseshukommelse og kultur

Hvis der findes en ordliste eller godkendt terminologi, kan oversættelser kontrolleres i forhold til foretrukne og forbudte termer, produktnavne og brandterminologi.

Hvis der findes tidligere godkendte oversættelser, kan gennemgangen identificere afvigelser fra oversættelseshukommelsen.

Kulturel tilpasning ser på valuta, datoer, måleenheder, adresser, telefonnumre, betalingskonventioner, lokale eksempler, kulturelle referencer og idiomer. Ikke alle forskelle er fejl. Kulturelle fund præsenteres, når det er relevant, som anbefalinger eller emner til gennemgang.

Audience context also matters. Language that fits a consumer travel product may be wrong for an enterprise developer tool, a finance product, or healthcare.

## Visuel kontrol: fungerer det lokaliserede website faktisk?

Sprog ændrer indholdets størrelse, form og layout. Den visuelle gennemgang evaluerer renderede sider for at finde problemer, der ikke kan opdages ud fra kildestrenge alene.

### Overløb, layout og tekstudvidelse

Det engelske "Start gratis prøveperiode" bliver til tysk "Kostenlose Testversion starten". Hvis den tyske version ikke længere passer på knappen, markerer kontrollen det.

Andre visuelle problemer omfatter afklippet eller afkortet tekst, uventede udeladelsesprikker, indhold, der flyder ud over navigation og tabeller, overlappende elementer, ødelagte gitre, forkert justeret indhold, indhold, der flyder ud over modaler, uventede linjeskift og forkert afstand.

Lokaliserede sider kan også opføre sig forskelligt ved mobil-, tablet- og desktopbredder. Auditeringen kan evaluere vigtige layouts på tværs af disse brydepunkter.

### RTL, skrifttyper og lokaliserede ressourcer

For RTL-lokaliteter som arabisk og hebraisk kontrollerer revisionen tekstretning, spejling af layout, navigation, justering, ikoner, formularer, sidebjælker og modaler.

Typografien skal understøtte målsprogenes skriftsystemer — herunder arabisk, kinesisk, japansk, koreansk, thai, vietnamesisk og kyrillisk. Manglende glyffer, uventede fallback-skrifttyper, inkonsekvent typografi, forkert linjehøjde og gengivelsesproblemer markeres.

Sprogspecifikke visuelle elementer er også vigtige. En fransk side, der indeholder et skærmbillede af en engelsksproget brugergrænseflade, er en mangel i lokaliseringen, selvom alle tekster på siden er oversat.

Revisionen kontrollerer også, om lokaliseringen ændrer det visuelle hierarki: overskrifter, der bliver for lange, CTA'er, der ombrydes, vigtig tekst, der mister sin fremhævelse, kort med uens højde og navigation, der bliver svær at skimme.

## Hvordan fund prioriteres

Ikke alle problemer har samme indvirkning. Hvert fund tildeles en alvorlighedsgrad, så teams kan rette de vigtigste ting først.

**Kritiske** problemer kan forringe den lokaliserede brugeroplevelse alvorligt: et utilgængeligt sprog, en helt uoversat side, forkert sprogversion, forkert valuta ved betaling, et større layoutbrud i RTL eller en utilgængelig lokaliseret rute.

**Alvorlige** problemer påvirker brugervenlighed, SEO eller oversættelseskvalitet: manglende `hreflang`, en primær CTA, der ikke er oversat, en større oversættelsesfejl, ødelagt navigation, afskåret vigtig tekst eller forkert produkterminologi.

**Mellemstore problemer** er synlige og bør håndteres: inkonsekvent terminologi, manglende lokaliserede metadata, sekundært uoversat indhold, mindre visuelle overskridelser eller manglende lokaliseret alternativ tekst.

**Lave** fund er kvalitetsforbedringer: lidt unaturlig formulering, mindre inkonsekvent stil, små formateringsproblemer eller valgfrie forbedringer af metadata.

**Info**-elementer er anbefalinger eller muligheder, som ikke nødvendigvis er fejl.

AI-drevne fund omfatter også et konfidensniveau, hvor det er relevant. Fund med høj konfidens er mere tilbøjelige til at være objektive eller deterministiske – for eksempel manglende `hreflang`. Fund med lavere konfidens, såsom et potentielt problem med kulturel tilpasning, bør betragtes som anbefalinger til gennemgang snarere end som definitive fejl.

## Sådan fungerer revisionen

Auditten starter med en websteds-URL, finder de tilgængelige lokaliteter, crawler lokaliserede sider, udtrækker indhold og metadata, renderer siderne og kører derefter de fire analysemotorer, inden den beregner scorerne og genererer en rapport.

Lokalisering identificeres ved hjælp af signaler som URL-struktur, `hreflang`, sitemaps, sprogvalg, HTML-metadata og domæner eller underdomæner.

Det er vigtigt, hvordan den faktiske side vises. Visuelle problemer, der skyldes oversat indhold, findes ofte ikke i HTML-kilden. Rapporten indeholder den samlede lokaliseringsscore, fire modulscorer, problemer grupperet efter alvorlighedsgrad, berørte sider, dokumentation, sikkerhed og anbefalede handlinger.

## Fra fund til løbende kvalitet

En audit bør ikke nøjes med at fortælle dig, hvad der er galt.

Når Hyperlocalise identificerer et problem, kan fundet blive udgangspunktet for at løse det: Ikke-oversat indhold kan oversættes, terminologiske uoverensstemmelser kan vurderes i forhold til godkendte termer, overtrædelser af ordlisten kan rettes, manglende metadata kan lokaliseres, og visuelle problemer med overløb kan løses ved at justere teksten eller layoutet.

Det skaber en kontinuerlig arbejdsgang: auditér, find problemer, ret dem, auditér igen, overvåg og opdag regressioner.

Lokalisering er ikke et engangsprojekt. Hver ny funktion, side, udgivelse eller oversættelse kan medføre nye problemer — nye engelske strenge, manglende oversættelser, overtrædelser af ordlisten, ødelagt `hreflang`, forkerte metadata, tekst, der flyder ud over skærmen, eller problemer med routing.

For teams, der løbende udgiver, er målet at gå fra en engangsrevision af lokaliseringen til løbende overvågning af lokaliseringskvaliteten.

Det er det samme skifte, som vi beskrev i [Hvad er Translation Intelligence?](/blog/what-is-translation-intelligence): Oversættelsesoutput er ikke længere flaskehalsen. Det er dømmekraft, kontekst og registrering af regressioner.

## Ofte stillede spørgsmål

### Er dette et værktøj til at tjekke oversættelser?

Ikke helt. En oversættelseskontrol fokuserer primært på sproglig kvalitet. Hyperlocalise Localisation Audit evaluerer hele det lokaliserede website, herunder den tekniske implementering, SEO, produktkontekst og den visuelle brugergrænseflade.

### Får et oversat website automatisk en god score?

Nej. Et website kan have fuldt oversat indhold og stadig have problemer med `hreflang`, lokaliseringsrouting, valuta, datoformatering, terminologi, produktkontekst, visuelt layout og tilgængelighed. Scoren evaluerer den samlede oplevelse.

### Kan auditten registrere uoversat indhold?

Ja. Det analyserer lokaliserede sider for at identificere indhold, der ser ud til stadig at være på kildesproget, samtidig med at der tages højde for brandnavne, URL'er, produktnavne og andet indhold, der med vilje kan være uændret.

### Kan den registrere dårlige oversættelser?

Auditten kan identificere potentielle problemer med betydning, sproglig naturlighed, terminologi, grammatik og konsistens. AI-drevne fund indeholder oplysninger om konfidensniveau, så teams kan skelne mellem fund med høj konfidens og punkter, der muligvis kræver menneskelig gennemgang.

### Kan den registrere visuelle problemer?

Ja. Den visuelle audit evaluerer renderede, lokaliserede sider og kan identificere tekstoverløb, ødelagte layouts, problemer med responsivt design, RTL-problemer og problemer med lokaliserede medieressourcer.

### Betyder en lav score, at webstedet er ubrugeligt?

Ikke nødvendigvis. Scoren er en indikator for sundhedstilstanden. Gennemgå altid de enkelte resultater og deres alvorlighedsgrad. Et website kan have en god samlet score og stadig have et kritisk problem, der påvirker en vigtig side eller brugerrejse.

## Find lokaliseringsproblemer, før dine brugere gør det.

Traditionelle websiteaudits måler ydeevne, tilgængelighed og SEO. Kvalitetssikring af oversættelser måler nøjagtighed, grammatik og hvor naturligt sproget flyder. En lokaliseringsaudit stiller fire spørgsmål på én gang:

- Er lokaliseringen implementeret korrekt?
- Er oversættelsen korrekt og naturlig?
- Er det passende til produktet, målgruppen og situationen?
- Fungerer den lokaliserede oplevelse rent faktisk for brugerne?

Tilsammen giver disse svar et mere komplet billede af lokaliseringsstatus.

Hvis du udvikler produkter til mere end ét marked, er det værd at have det overblik, før kunderne selv opdager manglerne. [Få en gratis gennemgang af din lokalisering](/localisation-audit) eller læs mere om [kontekstbevidst lokalisering](/blog/ai-translation-is-not-enough-context-aware-localisation).
