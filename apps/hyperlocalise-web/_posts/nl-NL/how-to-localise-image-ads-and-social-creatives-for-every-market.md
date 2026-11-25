---
title: Hoe je beeldadvertenties en socialmedia-uitingen voor elke markt lokaliseert
date: 2026-11-24T00:00:00.000Z
excerpt: Het bijschrift vertalen is eenvoudig. De tekst in de banner zorgt ervoor dat campagnes voor meerdere markten vertraging oplopen. Deze gids laat zien hoe je beeldadvertenties, socialmedia-uitingen en productfoto’s lokaliseert, zodat elke versie voor een markt leest alsof die daar is gemaakt.
category: Product
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

Uw campagne gaat maandag in acht markten van start. De advertentietekst is vertaald, de bijschriften zijn klaar en de landingspagina's staan online.

Dan vraagt iemand naar de banners.

De kop, de aanbieding en de oproep tot actie maken allemaal deel uit van de afbeelding. Elke markt heeft een eigen versie nodig, dus opent een ontwerper het bronbestand opnieuw, plakt de vertalingen erin, ontdekt dat de Duitse kop niet past en maakt die kleiner, ontdekt dat het Japanse lettertype ontbreekt en herhaalt dit voor elk formaat en elke markt. Na veertig bestanden gaat de campagne donderdag van start, maar in één markt staat nog steeds de prijs van vorig kwartaal.

Deze gids behandelt hoe u beeldadvertenties en uitingen voor sociale media goed lokaliseert: wat u moet beslissen voordat u begint, hoe u omgaat met tekst die in de afbeelding is verwerkt en hoe u elke markt controleert voordat de uitingen worden gepubliceerd. Voor de praktische onderdelen gebruiken we **[Iris](/iris)**, de Hyperlocalise Mac-app voor meertalige middelen, maar de checklist is van toepassing ongeacht welke tools u gebruikt.

## Waarom beeldadvertenties het moeilijkst te lokaliseren onderdeel van een campagne zijn

Tekst in een product of op een website staat in strings. Je kunt die extraheren, vertalen en weer terugzetten. Met tekst in een afbeelding werkt dat niet zo.

- **De tekst maakt deel uit van de afbeelding.** Tenzij iemand voor elk formaat een gelaagd bronbestand heeft bewaard, valt er niets te vervangen.
- **Elke markt vermenigvuldigt het werk.** Eén concept × vier formaten × acht markten levert 32 assets op, en bij elke tekstwijziging begint de telling opnieuw.
- **De ruimte is beperkt.** Een kop die in het Engels past, kan in het Duits 30% langer zijn, terwijl het vak niet groter wordt.
- **Schriftsystemen werken anders.** In het Japans en Thai worden regels afgebroken zonder spaties tussen woorden. Arabisch wordt van rechts naar links gelezen. Veel merklettertypen bevatten geen tekens voor deze talen.
- **Voor advertenties gelden regels.** Aanbiedingsvoorwaarden, prijzen, disclaimers en verboden claims verschillen per markt, en een fout in betaalde media is openbaar en kostbaar.

Het probleem is dus niet echt de vertaling. Het gaat erom het materiaal voor elke markt opnieuw op te bouwen, met behoud van het ontwerp, de merknamen en de juridische tekst.

## Stap 1: Bepaal de markten, niet alleen de talen

Begin met een lijst met markten, geschreven als landcodes: `fr-FR`, `de-DE`, `ja-JP`, `pt-BR`, `ar-AE`.

Alleen de taal is niet genoeg. Spaans in Spanje en Spaans in Mexico verschillen in woordkeuze, toon en formaliteit. Portugees in Brazilië en Portugal verschilt meer dan de meeste teams verwachten. Een prijs die in Frankrijk wordt weergegeven als `€49`, wordt geschreven als `49 €`. Een aanbieding voor ‘Black Friday’ kan in sommige markten niets betekenen of naar de verkeerde data verwijzen.

Noteer voor elke markt:

- **Aanspreekvorm.** Formele of informele aanspreekvorm (`tu`/`vous`, `du`/`Sie`).
- **Aanbod en prijzen.** Valuta, opmaak en of de aanbieding überhaupt van toepassing is.
- **Juridische tekst.** Disclaimers, voorwaarden en alles wat toezichthouders vereisen.
- **Vertalen of herschrijven.** Een woordspeling of culturele verwijzing vraagt soms om nieuwe tekst in plaats van een vertaling. Dat is [transcreatie](/blog/hyperlocalisation-why-global-growth-needs-more-than-translation). Daarover moet u vooraf een beslissing nemen, niet pas tijdens de review.

## Stap 2: Breng uw terminologie op orde voordat iemand iets vertaalt

De meeste fouten bij advertentielokalisatie zijn terminologiefouten, geen grammaticafouten: de productnaam is vertaald terwijl die Engels had moeten blijven, een handelsmerk van een concurrent is gebruikt voor een generieke functie, of een claim die de juridische afdeling vorig kwartaal heeft verwijderd, duikt in één markt weer op.

Controleer voordat u iets lokaliseert of uw woordenlijst het volgende bevat:

- **Product- en functienamen, en of ze worden vertaald.**
- **Goedgekeurde vertalingen** voor terugkerende campagnetermen zoals ‘gratis proefperiode’, ‘beperkte tijd’ en ‘aanmelden’.
- **Verboden termen**, woorden die in een bepaalde markt nooit mogen voorkomen.
- **Slogans**, met een goedgekeurde versie per markt in plaats van een nieuwe vertaling voor elke campagne.

In Hyperlocalise leest Iris dezelfde woordenlijsten en hetzelfde vertaalgeheugen als de webapp. Goedgekeurde vertalingen worden toegepast en verboden termen worden geblokkeerd in schermteksten en afbeeldingsprompts. Als uw regels in een merkboek of compliancedocument staan, uploadt u dat als een [richtlijn](/product/guidelines) en controleert u de tekst eraan. We gaan dieper in op eigenaarschap en handhaving in [Zo blijven merkstem en terminologie consistent in alle markten](/blog/how-to-keep-brand-voice-and-terminology-consistent-across-markets).

## Stap 3: Lokaliseer de tekst in de afbeelding

Er zijn twee startpunten, en die vereisen verschillende benaderingen.

### U hebt een voltooide afbeelding

Dit is het meest voorkomende geval. U hebt een PNG- of JPEG-bestand zonder lagen van een bureau of ontwerptool, en de tekst is erin verwerkt.

In Iris verloopt het als volgt:

1. **Open de afbeelding** als advertentiecreatie.
2. **Lees de tekst in de afbeelding.** Iris vindt elk tekstonderdeel en legt vast waar het staat, zodat u de kop, aanbieding, oproep tot actie en kleine lettertjes als afzonderlijke items krijgt.
3. **Vertaal en controleer deze items** aan de hand van uw woordenlijst en vertaalgeheugen. U beoordeelt de tekst, niet de afbeelding. Dat gaat sneller en is makkelijker te delen met beoordelaars in elke markt.
4. **Localiseer de afbeelding voor elke markt.** Iris tekent de goedgekeurde tekst opnieuw op dezelfde plek en in dezelfde stijl, met behoud van de fotografie, het product en de lay-out.

Elk resultaat wordt opgeslagen als de versie van de creatieve uiting voor die markt en naast het origineel weergegeven, zodat u markten naast elkaar kunt vergelijken. Een bestand met lagen of een schone achtergrondplaat is niet nodig.

### Je ontwerpt het helemaal opnieuw.

Als de creatieve uiting nog niet bestaat, maak dan eerst het origineel in Iris op basis van een briefing. Vermeld je merkkleuren, de lettertypes die je gebruikt, de lay-out en de exacte tekst tussen aanhalingstekens. Voeg ook je logo en productfoto's toe als referenties. Lokaliseer de uiting vervolgens op dezelfde manier.

Schrijf de brontekst met lokalisatie in gedachten:

- **Houd de kop kort.** Elk woord dat u in het Engels schrapt, bespaart nog meer in het Duits.
- **Voeg tekstfragmenten niet samen.** ‘Bespaar’ + ‘20%’ + ‘vandaag’ werkt niet in talen met een andere woordvolgorde. Schrijf de volledige zin.
- **Houd ruimte over.** Reken op ongeveer een derde meer ruimte dan de Engelse tekst nodig heeft.

Als de uiting in veel markten wordt gebruikt en vaak verandert, overweeg dan om de tekst als bewerkbare tekstlagen toe te voegen in plaats van die onderdeel te maken van de afbeelding. De tekstlagen blijven bewerkbaar en worden net als elk ander bericht vertaald.

## Stap 4: Controleer de lay-out in elke markt

Dit is de stap die teams overslaan, en juist die merken klanten op.

Vertalingen verschillen in lengte. Duits, Fins en Frans zijn vaak 20–35% langer dan Engels. Chinees en Japans zijn korter, waardoor er onhandig veel lege ruimte kan ontstaan. Arabisch en Hebreeuws worden van rechts naar links gelezen, waardoor links uitgelijnde lay-outs er verkeerd uitzien. In het Thais, Japans en Chinees worden regels afgebroken zonder spaties, waardoor regeleinden op onverwachte plekken vallen.

Controleer voor elke markt:

| Controle | Waar u op moet letten |
| --- | --- |
| **Tekstoverloop** | Tekst afgesneden, loopt over de rand of botst met het product |
| **Regelafbrekingen** | Losse woorden op de laatste regel, of afbrekingen die een merknaam of prijs splitsen |
| **Richting** | Rechts-naar-links tekst rechts uitgelijnd of gecentreerd, terwijl de lay-out in balans blijft |
| **Lettertypen** | Ontbrekende tekens (lege vakjes) of een terugvallettertype dat niet bij het merk past |
| **Cijfers** | Prijzen, percentages en datums geschreven zoals die markt ze noteert |
| **Passend** | Tekst die kort genoeg is om te lezen in de seconde of zo die een socialmedia-advertentie krijgt |

Iris controleert op deze problemen en u kunt elke markt op ware grootte bekijken voordat u deze goedkeurt. Voor langlopende campagnes voert u dezelfde controles uit als bij een [website-localisatieaudit](/blog/what-is-a-website-localisation-audit), omdat het om hetzelfde idee gaat, toegepast op creatieve uitingen.

## Stap 5: Bespreek het met mensen die de markt kennen

AI helpt u in elke markt aan een sterke eerste versie. Iemand die de markt kent, moet nog steeds alles goedkeuren waarvoor u betaalt om het aan klanten te tonen.

Beoordeel snel:

- **Stuur reviewers de tekst en de gerenderde afbeelding**, niet een spreadsheet met losse strings zonder context.
- **Stel specifieke vragen.** Klinkt de kop natuurlijk? Is het aanbod duidelijk? Is er iets dat niet bij het merk past of riskant is?
- **Los problemen bij de bron op.** Als een term niet klopt, pas die dan aan in de woordenlijst in plaats van in één afbeelding, zodat die in alle volgende afbeeldingen wel klopt.
- **Goedkeuringen opslaan.** Wanneer een markt goedkeuring geeft, onthoudt de werkruimte de goedgekeurde tekst. Zo begint de volgende campagne daarmee in plaats van vanaf nul.

## Stap 6: Exporteren en meten per markt

Exporteer alleen de goedgekeurde markten. Geef bestanden een naam op basis van concept, formaat en taalregio, zodat mediakopers de Franse banner niet uploaden naar de Duitse advertentieset.

Behandel lokalisatie vervolgens als iets wat je kunt meten. Vergelijk de doorklikratio en conversie per markt met een controleversie die alleen is vertaald, of met de resultaten van de vorige campagne. Als een markt achterblijft, kun je de creatieve tekst nu in minuten aanpassen in plaats van in dagen. Zo wordt [experimenteren per markt](/use-cases/market-experimentation) praktisch.

## Een checklist voor je volgende campagne

- [ ] Markten vermeld als landinstellingscodes, met registratie, aanbod en juridische tekst voor elk ervan
- [ ] Er is besloten of koppen en slogans worden vertaald of herschreven.
- [ ] De woordenlijst omvat productnamen, terugkerende campagnetermen en verboden termen.
- [ ] Brontekst kort gehouden, in volledige zinnen, met ruimte om uit te breiden.
- [ ] Afbeeldingstekst gelezen, vertaald en gecontroleerd aan de hand van de woordenlijst.
- [ ] Elke markt gecontroleerd op overloop, regeleinden, tekstoriëntatie, lettertypen en getallen
- [ ] Goedgekeurd door een reviewer die elke markt kent
- [ ] Goedkeuringen opgeslagen, zodat de volgende campagne daarmee kan beginnen.
- [ ] Bestanden benoemd op concept, formaat en taalregio; resultaten bijgehouden per markt

## Probeer het uit op één asset.

U hoeft niet uw hele campagneproces te veranderen om het verschil te zien. Neem één banner die u deze maand lanceert en één markt die u nog niet hebt aangepakt. Lokaliseer de banner in Iris, controleer de lay-out en vergelijk het resultaat en de benodigde tijd met uw huidige proces.

Iris is gratis te downloaden voor Mac, en voor het genereren wordt AI-tegoed gebruikt dat is inbegrepen bij betaalde abonnementen vanaf $ 20 per maand. Lees het [lanceringsbericht over Iris](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets) voor het volledige verhaal, of **[download Iris](/iris)** en ga aan de slag met uw volgende campagne.
