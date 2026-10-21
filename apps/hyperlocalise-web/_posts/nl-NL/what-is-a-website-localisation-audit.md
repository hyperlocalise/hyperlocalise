---
title: Wat is een audit voor websitelokalisatie?
date: 2026-08-13T00:00:00.000Z
excerpt: Een website vertalen is slechts het begin. Een lokalisatie-audit beoordeelt de technische implementatie, taalkwaliteit, productcontext en visuele ervaring — en vertelt je wat je als eerste moet verbeteren.
category: Product
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

Een website vertalen is slechts het begin van lokalisatie.

Een website kan vertaalde pagina’s hebben en internationale gebruikers toch een slechte ervaring bieden. Een ontbrekende `hreflang`-tag kan de vindbaarheid schaden. Een niet-vertaalde call-to-action kan bezoekers in verwarring brengen. Een technisch correcte vertaling kan nog steeds de verkeerde productterm gebruiken. Een langere Duitse tekst kan ervoor zorgen dat een knop op mobiel niet goed wordt weergegeven.

De vraag die een lokalisatie-audit beantwoordt, is niet: 'hoeveel strings zijn vertaald?' Het is:

> **Voelt uw website alsof die echt is gebouwd voor gebruikers in deze regio?**

De Hyperlocalise-lokalisatieaudit controleert een website op vier dimensies — technisch, taalkundig, contextueel en visueel — en geeft één lokalisatiescore op 100, plus de problemen die als eerste moeten worden opgelost.

## Wat een lokalisatie-audit omvat

Een lokalisatie-audit is geen vertaalcontrole en ook geen algemene website-audit.

Tools voor prestaties, toegankelijkheid en SEO kijken naar de implementatie. Kwaliteitscontrole van vertalingen kijkt naar nauwkeurigheid, grammatica en vloeiendheid. Geen van beide geeft een volledig beeld van een meertalige website.

Een lokalisatie-audit combineert beide perspectieven:

| Audit            | Gewicht | Wat het beantwoordt                                   |
| ---------------- | -----: | ----------------------------------------------------- |
| Technische audit  |    25% | Is de lokalisatie correct geïmplementeerd?                |
| Taalkundige audit |    25% | Zijn vertalingen nauwkeurig, natuurlijk en consistent?   |
| Contextuele audit |    25% | Is de lokalisatie zinvol binnen de context van uw product? |
| Visuele audit     |    25% | Ziet de gelokaliseerde UI er correct uit en werkt deze naar behoren?      |

Je krijgt een totaalscore, een score per onderdeel en actiegerichte bevindingen met ernst, onderbouwing en betrouwbaarheid.

## Hoe de score te interpreteren

De totaalscore is een gezondheidsindicator, geen vervanging voor de gedetailleerde bevindingen. Bekijk altijd eerst de problemen met de hoogste ernst.

| Score  | Beoordeling       | Wat het betekent                                                     |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 90–100 | Uitstekend         | De gelokaliseerde ervaring verkeert in uitstekende staat                          |
| 75–89  | Goed              | De website is over het algemeen goed gelokaliseerd, met enkele verbeterpunten |
| 50–74  | Verbetering nodig | Gebruikers kunnen merkbare lokalisatieproblemen ondervinden                 |
| 25–49  | Slecht              | Aanzienlijke lokalisatiehiaten beïnvloeden de ervaring           |
| 0–24   | Kritiek            | De gelokaliseerde ervaring heeft grote problemen die moeten worden aangepakt |

Een website kan een goede totaalscore hebben en toch één kritiek probleem hebben bij het afrekenen, de routering of een pagina met veel verkeer. De score vertelt je waar je moet kijken. De bevindingen vertellen je wat je moet oplossen.

## Technische audit: is lokalisatie correct geïmplementeerd?

De technische audit controleert de infrastructuur achter een meertalige website: vindbaarheid, routering, opmaak, toegankelijkheid en of gebruikers en zoekmachines de juiste taal- en regioversie kunnen bereiken.

### Detectie en routering van taalregio's

Pagina's moeten hun taal en landinstelling correct declareren, bijvoorbeeld `<html lang="fr-FR">`. De audit controleert op ontbrekende taalaanduidingen, onjuiste taal- of regiocodes, afwijkingen tussen landinstelling en inhoud en inconsistente identificatiegegevens.

Het controleert ook of gelokaliseerde pagina's een consistente URL-structuur gebruiken:

```text
/en/pricing
/fr/pricing
/de/pricing
```

Veelvoorkomende problemen zijn ontbrekende gelokaliseerde routes, defecte locale-URL's, onjuiste omleidingen, onverwachte terugval naar de standaardlocale en problemen met het behouden van de locale.

### Taalwisselaar en `hreflang`

Bezoekers moeten de taal/regio kunnen wijzigen zonder de pagina die ze bekijken te verliezen. Als ze overschakelen van `/fr/pricing`, moeten ze op `/de/pricing` terechtkomen, niet op de Duitse startpagina.

De audit controleert ook de relaties tussen gelokaliseerde versies van een pagina: ontbrekende `hreflang`, onjuiste taal- of regiocodes, ongeldige URL's, ontbrekende wederkerige verwijzingen of verwijzingen naar zichzelf, onjuiste `x-default` en conflicten met canonieke URL's.

Gelokaliseerde pagina's zouden doorgaans naar zichzelf moeten canonicaliseren. Een Franse prijspagina die naar de Engelse versie canonicaliseert, is een veelvoorkomende SEO-fout:

```text
/fr/pricing
canonical → /en/pricing
```

### Metadata, sitemaps en gestructureerde gegevens

Belangrijke paginametadata moeten worden gelokaliseerd: titels, metabeschrijvingen, Open Graph-titels en -beschrijvingen, `og:locale` en metadata voor delen op sociale media.

De audit controleert ook of gelokaliseerde URL's in de sitemap voorkomen en correct werken, en, waar van toepassing, of gestructureerde gegevens zoals Product, WebPage, Breadcrumbs, FAQ, Organization, Article en LocalBusiness zijn gelokaliseerd.

### Internationale opmaak en toegankelijkheid

Localegevoelige waarden moeten overeenkomen met de locale:

```text
US:  $1,234.56
DE:  1.234,56 €
FR:  1 234,56 €
```

Daaronder vallen datums, tijden, getallen, valuta, meeteenheden en tijdzones.

Toegankelijkheidslokalisatie omvat `lang`, `aria-label`, toegankelijke namen, formuliervelden, validatiemeldingen en `alt`-tekst bij afbeeldingen.

## Taalkundige controle: is de taal correct, natuurlijk en consistent?

De taalkundige audit beoordeelt de taal op de pagina. Daarbij wordt meer gecontroleerd dan alleen of de tekst is vertaald. Er wordt gekeken of de vertaling de juiste betekenis overbrengt en natuurlijk klinkt voor gebruikers in de doellocale.

### Volledigheid en nauwkeurigheid

Niet-vertaalde inhoud wordt gemarkeerd, terwijl merknamen, productnamen, URL's, e-mailadressen, code, eigennamen en bewust gebruikte Engelse terminologie als verwachte uitzonderingen worden beschouwd.

Een Franstalige pagina waarop staat:

```text
Bienvenue sur notre site.

Start your free trial
```

zou worden gemarkeerd vanwege de onvertaalde call-to-action.

Nauwkeurigheidscontroles letten op ontbrekende of toegevoegde betekenis, onjuiste interpretaties, verkeerde getallen, verkeerde productacties en onjuiste terminologie.

### Vloeiendheid, terminologie en merkstem

Een vertaling kan technisch correct zijn en toch onnatuurlijk klinken. Bij de controle wordt gelet op stroef taalgebruik, onnatuurlijke zinsbouw, grammatica- en spelfouten, kenmerken van machinevertaling en schrijfconventies die specifiek zijn voor de taalregio.

Het identificeert ook concepten die op verschillende manieren op de site zijn vertaald:

```text
Workspace

Page 1 → Espace de travail
Page 2 → Workspace
Page 3 → Espace Workspace
```

Als het project een goedgekeurde woordenlijst heeft, gaat de terminologie daarin voor.

De merkstem wordt beoordeeld op basis van de gewenste toon — professioneel, vriendelijk, beknopt, technisch, conversationeel, premium of speels — en op locatiespecifieke grammatica en stijl, zoals hoofdlettergebruik, interpunctie, formaliteit en congruentie.

## Contextuele audit: is de vertaling correct voor dit product?

Context is een van de makkelijkste aspecten van lokalisatie om over het hoofd te zien.

Een vertaling kan grammaticaal perfect zijn en toch verkeerd zijn voor de plek waar die verschijnt. Het woord 'Annuleren' kan betekenen dat je een dialoogvenster sluit, een abonnement opzegt, een bestelling annuleert of een bewerking stopt. De juiste vertaling hangt af van de productcontext.

De contextuele audit gebruikt pagina-, UI-, terminologie- en productcontext om te beoordelen of vertalingen logisch zijn in de context waarin ze worden gebruikt.

### Intentie voor UI, product en CTA

De audit kijkt naar waar een tekst voorkomt — op een knop, in navigatie, een formulier, modaal venster, tooltip, kop, foutmelding, melding, menu of afrekenpagina — en beoordeelt de taal aan de hand van de productconcepten op de pagina: functienamen, abonnementen, instellingen, accountconcepten, workflowacties en productterminologie.

Call-to-actions verdienen bijzondere aandacht. ‘Start gratis proefperiode’, ‘Boek nu’, ‘Wijzigingen opslaan’, ‘Account verwijderen’ en ‘Upgraden’ moeten in de doeltaal de bedoelde actie overbrengen, niet een algemene variant.

### Woordenlijst, vertaalgeheugen en cultuur

Als er een woordenlijst of goedgekeurde terminologie beschikbaar is, kunnen vertalingen worden gecontroleerd op voorkeurs- en verboden termen, productnamen en merkterminologie.

Waar eerder goedgekeurde vertalingen bestaan, kan de audit afwijkingen van het vertaalgeheugen identificeren.

Bij culturele aanpassing wordt gekeken naar valuta, datums, meeteenheden, adressen, telefoonnummers, betalingsgewoonten, lokale voorbeelden, culturele verwijzingen en idiomen. Niet elk verschil is een fout. Culturele bevindingen worden waar passend gepresenteerd als aanbevelingen of aandachtspunten ter beoordeling.

Ook de doelgroep is belangrijk. Taal die past bij een reisproduct voor consumenten is misschien niet geschikt voor een zakelijke ontwikkelaarstool, een financieel product of de gezondheidszorg.

## Visuele controle: werkt de gelokaliseerde website daadwerkelijk?

Talen veranderen de grootte, vorm en indeling van content. De visuele audit beoordeelt gerenderde pagina's om problemen op te sporen die niet alleen aan de hand van bronteksten kunnen worden gedetecteerd.

### Overloop, lay-out en tekste uitbreiding

Het Engelse 'Start free trial' wordt het Duitse 'Kostenlose Testversion starten'. Als de Duitse versie niet meer op de knop past, wordt dit door de audit gemarkeerd.

Andere visuele problemen zijn onder meer afgeknipte of afgebroken tekst, onverwachte weglatingstekens, overlopende navigatie en tabellen, overlappende elementen, kapotte rasters, verkeerd uitgelijnde inhoud, overlopende modaalvensters, onverwachte tekstterugloop en onjuiste tussenruimte.

Gelokaliseerde pagina's kunnen zich ook anders gedragen op mobiele, tablet- en desktopbreedtes. De audit kan belangrijke lay-outs op die breakpoints evalueren.

### RTL, lettertypen en gelokaliseerde assets

Voor RTL-lokalisaties zoals Arabisch en Hebreeuws controleert de audit de tekstrichting, spiegeling van de lay-out, navigatie, uitlijning, pictogrammen, formulieren, zijbalken en modals.

De typografie moet de doelscripts ondersteunen, waaronder Arabisch, Chinees, Japans, Koreaans, Thai, Vietnamees en Cyrillisch. Ontbrekende tekens, onverwachte fallback-lettertypen, inconsistente typografie, onjuiste regelhoogte en weergaveproblemen worden gemeld.

Taalspecifieke visuele middelen zijn ook belangrijk. Een Franse pagina met een screenshot van een Engelstalige gebruikersinterface is een lokalisatiehiaat, ook als alle teksten op de pagina zijn vertaald.

De audit controleert ook of lokalisatie de visuele hiërarchie verandert: koppen die te lang worden, CTA's die afbreken, belangrijke tekst die aan nadruk verliest, kaarten met verschillende hoogtes en navigatie die moeilijk te scannen is.

## Hoe bevindingen worden geprioriteerd

Niet elk probleem heeft dezelfde impact. Aan elke bevinding wordt een ernstniveau toegekend, zodat teams de juiste zaken als eerste kunnen oplossen.

**Kritieke** problemen kunnen de gelokaliseerde ervaring ernstig schaden: een niet-beschikbare locale, een volledig onvertaalde pagina, de verkeerde locale die wordt aangeboden, een onjuiste valuta bij het afrekenen, een ernstige fout in de RTL-indeling of een ontoegankelijke gelokaliseerde route.

**Ernstige** problemen beïnvloeden de gebruiksvriendelijkheid, SEO of vertaalkwaliteit: ontbrekende `hreflang`, een onvertaalde primaire CTA, een grote vertaalfout, niet-werkende navigatie, belangrijke tekst die is afgekapt of onjuiste productterminologie.

**Middelgrote** problemen zijn merkbaar en moeten worden aangepakt: inconsistente terminologie, ontbrekende gelokaliseerde metadata, secundaire onvertaalde inhoud, kleine visuele overloop of ontbrekende gelokaliseerde alt-tekst.

**Lage** bevindingen zijn verbeterpunten voor de kwaliteit: licht onnatuurlijk woordgebruik, kleine inconsistenties in stijl, kleine opmaakproblemen of optionele verbeteringen van metadata.

**Info**-items zijn aanbevelingen of kansen die niet per se fouten zijn.

AI-aangedreven bevindingen bevatten waar passend ook een betrouwbaarheidsniveau. Bevindingen met een hoge betrouwbaarheid zijn waarschijnlijker objectief of deterministisch — bijvoorbeeld een ontbrekende `hreflang`. Bevindingen met een lagere betrouwbaarheid, zoals een mogelijk probleem met culturele aanpassing, moeten worden behandeld als aanbevelingen voor beoordeling en niet als definitieve fouten.

## Hoe de audit werkt

De audit begint met een website-URL, ontdekt beschikbare taal- en regioversies, crawlt gelokaliseerde pagina's, extraheert inhoud en metadata, rendert pagina's en voert vervolgens de vier analyse-engines uit voordat scores worden berekend en een rapport wordt gegenereerd.

Lokalisatiedetectie gebruikt signalen zoals URL-structuur, `hreflang`, sitemaps, taalselectors, HTML-metadata en domeinen of subdomeinen.

De weergave van de daadwerkelijke pagina is belangrijk. Visuele problemen die door vertaalde content worden veroorzaakt, zijn vaak niet zichtbaar in de HTML-bron. Het rapport bevat de algemene lokalisatiescore, scores voor vier modules, problemen gegroepeerd op ernst, getroffen pagina's, bewijs, betrouwbaarheid en aanbevolen acties.

## Van bevindingen naar continue kwaliteit

Een audit hoort niet te stoppen bij vertellen wat er mis is.

Wanneer Hyperlocalise een probleem vaststelt, kan die bevinding het startpunt zijn om het op te lossen: onvertaalde content kan worden vertaald, inconsistent gebruik van terminologie kan worden gecontroleerd aan de hand van goedgekeurde termen, overtredingen van de woordenlijst kunnen worden gecorrigeerd, ontbrekende metadata kan worden gelokaliseerd en visuele overloop kan worden aangepakt in de tekst of de lay-out.

Dat zorgt voor een doorlopende workflow: auditen, problemen opsporen, ze oplossen, opnieuw auditen, monitoren en regressies detecteren.

Lokalisatie is geen eenmalig project. Elke nieuwe functie, pagina, release of vertaling kan nieuwe problemen introduceren — nieuwe Engelse strings, ontbrekende vertalingen, afwijkingen van de woordenlijst, defecte `hreflang`, onjuiste metadata, visuele overloop of regressies in de routering.

Voor teams die voortdurend releases uitbrengen, is het doel om over te stappen van een eenmalige lokalisatie-audit naar continue monitoring van de lokalisatiekwaliteit.

Dit is dezelfde verschuiving die we beschreven in [Wat is vertaalintelligentie?](/blog/what-is-translation-intelligence): de vertaaloutput is niet langer de bottleneck. Oordeelsvermogen, context en regressiedetectie zijn dat.

## Veelgestelde vragen

### Is dit een vertaalchecker?

Niet helemaal. Een vertaalchecker richt zich voornamelijk op de taalkwaliteit. De Hyperlocalise Localisatieaudit beoordeelt de volledige gelokaliseerde website, inclusief de technische implementatie, SEO, productcontext en visuele gebruikersinterface.

### Krijgt een vertaalde website automatisch een goede score?

Nee. Een website kan volledig vertaalde content hebben en toch problemen hebben met `hreflang`, lokale routering, valuta, datumopmaak, terminologie, productcontext, visuele lay-out en toegankelijkheid. De score beoordeelt de algehele ervaring.

### Kan de audit onvertaalde inhoud detecteren?

Ja. Het analyseert gelokaliseerde pagina's om inhoud te identificeren die in de brontaal lijkt te zijn gebleven, waarbij rekening wordt gehouden met merknamen, URL's, productnamen en andere inhoud die mogelijk opzettelijk ongewijzigd blijft.

### Kan het slechte vertalingen detecteren?

De audit kan mogelijke problemen identificeren op het gebied van betekenis, vloeiendheid, terminologie, grammatica en consistentie. AI-gestuurde bevindingen bevatten informatie over de mate van zekerheid, zodat teams onderscheid kunnen maken tussen sterke bevindingen en punten die mogelijk menselijke beoordeling vereisen.

### Kan het visuele problemen detecteren?

Ja. De Visual Audit beoordeelt gerenderde gelokaliseerde pagina’s en kan tekstoverloop, kapotte lay-outs, problemen met responsiviteit, RTL-problemen en problemen met gelokaliseerde assets identificeren.

### Betekent een lage score dat de website onbruikbaar is?

Niet noodzakelijk. De score is een gezondheidsindicator. Bekijk altijd de afzonderlijke bevindingen en de ernst ervan. Een website kan een goede totaalscore hebben, terwijl er toch een kritiek probleem is dat van invloed is op een belangrijke pagina of gebruikersstroom.

## Spoor lokalisatieproblemen op voordat uw gebruikers dat doen.

Traditionele website-audits meten prestaties, toegankelijkheid en SEO. Kwaliteitscontrole van vertalingen meet nauwkeurigheid, grammatica en vloeiendheid. Een lokalisatieaudit stelt vier vragen tegelijk:

- Is lokalisatie correct geïmplementeerd?
- Is de vertaling correct en natuurlijk?
- Is het geschikt voor het product, de doelgroep en de situatie?
- Werkt de gelokaliseerde ervaring daadwerkelijk voor gebruikers?

Samen geven die antwoorden een completer beeld van hoe gezond de lokalisatie ervoor staat.

Als je producten voor meer dan één markt ontwikkelt, is het goed om dat beeld te hebben voordat klanten zelf de hiaten ontdekken. [Voer een gratis lokalisatie-audit uit](/localisation-audit) of lees meer over [contextbewuste lokalisatie](/blog/ai-translation-is-not-enough-context-aware-localisation).
