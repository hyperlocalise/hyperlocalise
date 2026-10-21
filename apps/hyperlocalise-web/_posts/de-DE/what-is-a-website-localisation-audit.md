---
title: Was ist ein Website-Lokalisierungs-Audit?
date: 2026-08-13T00:00:00.000Z
excerpt: Die Übersetzung einer Website ist nur der Anfang. Ein Lokalisierungsaudit bewertet die technische Umsetzung, die Sprachqualität, den Produktkontext und das visuelle Erlebnis – und zeigt Ihnen, was Sie zuerst verbessern sollten.
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

Die Übersetzung einer Website ist nur der Anfang der Lokalisierung.

Eine Website kann übersetzte Seiten haben und internationalen Nutzern trotzdem ein schlechtes Erlebnis bieten. Ein fehlendes `hreflang`-Tag kann die Auffindbarkeit beeinträchtigen. Ein nicht übersetzter Call-to-Action kann Besucher verwirren. Eine technisch korrekte Übersetzung kann trotzdem den falschen Produktbegriff verwenden. Ein längerer deutscher Text kann dazu führen, dass eine Schaltfläche auf Mobilgeräten nicht richtig angezeigt wird.

Die Frage, die ein Lokalisierungsaudit beantwortet, lautet nicht „Wie viele Strings sind übersetzt?“, sondern:

> **Fühlt sich Ihre Website so an, als wäre sie tatsächlich für Nutzer in dieser Region entwickelt worden?**

Das Hyperlocalise Localisation Audit prüft eine Website anhand von vier Dimensionen – technische, sprachliche, kontextuelle und visuelle – und liefert einen einzigen Lokalisierungswert auf einer Skala von 100 sowie die Probleme, die zuerst behoben werden sollten.

## Was ein Lokalisierungsaudit umfasst

Ein Lokalisierungsaudit ist weder eine Übersetzungsprüfung noch ein allgemeines Website-Audit.

Performance-, Barrierefreiheits- und SEO-Tools betrachten die Implementierung. Bei der Übersetzungs-QA geht es um Genauigkeit, Grammatik und Sprachfluss. Weder das eine noch das andere vermittelt ein vollständiges Bild einer mehrsprachigen Website.

Ein Lokalisierungsaudit vereint beide Perspektiven:

| Audit            | Gewicht | Was es beantwortet                                   |
| ---------------- | -----: | ----------------------------------------------------- |
| Technisches Audit  |    25% | Ist die Lokalisierung korrekt implementiert?                |
| Sprachprüfung |    25% | Sind die Übersetzungen korrekt, natürlich und einheitlich?   |
| Kontextbezogene Prüfung |    25% | Ist die Lokalisierung in Ihrem Produktkontext sinnvoll? |
| Visuelle Prüfung | 25% | Sieht die lokalisierte Benutzeroberfläche korrekt aus und verhält sie sich richtig? |

Du erhältst eine Gesamtbewertung, eine Bewertung für jeden Bereich sowie konkrete Handlungsempfehlungen mit Schweregrad, Belegen und Vertrauensgrad.

## So interpretierst du den Score

Der Gesamtwert ist ein Gesundheitsindikator und kein Ersatz für die detaillierten Ergebnisse. Überprüfen Sie immer zuerst die Probleme mit dem höchsten Schweregrad.

| Punktzahl | Bewertung | Was es bedeutet |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 90–100 | Ausgezeichnet      | Das lokalisierte Erlebnis ist in einem sehr guten Zustand             |
| 75–89  | Gut              | Die Website ist im Allgemeinen gut lokalisiert, es gibt jedoch einige Probleme, die verbessert werden sollten |
| 50–74  | Verbesserungsbedarf | Nutzer können auf merkliche Lokalisierungsprobleme stoßen                 |
| 25–49  | Schlecht          | Erhebliche Lokalisierungslücken beeinträchtigen das Nutzungserlebnis |
| 0–24   | Kritisch          | Die lokalisierte Nutzererfahrung weist schwerwiegende Probleme auf, die behoben werden sollten |

Eine Website kann insgesamt eine gute Bewertung haben und trotzdem ein kritisches Problem beim Checkout, beim Routing oder auf einer stark frequentierten Seite aufweisen. Die Bewertung zeigt Ihnen, wo Sie suchen sollten. Die Ergebnisse zeigen Ihnen, was Sie beheben müssen.

## Technisches Audit: Ist die Lokalisierung korrekt implementiert?

Das technische Audit prüft die Infrastruktur hinter einer mehrsprachigen Website: Auffindbarkeit, Routing, Formatierung, Barrierefreiheit und ob Nutzer und Suchmaschinen das richtige Gebietsschema erreichen können.

### Locale-Erkennung und Routing

Seiten sollten ihre Sprache und ihr Gebietsschema korrekt deklarieren, zum Beispiel `<html lang="fr-FR">`. Bei der Prüfung wird nach fehlenden Sprachdeklarationen, falschen Sprach- oder Regionscodes, Abweichungen zwischen Gebietsschema und Inhalt sowie inkonsistenten Bezeichnern gesucht.

Außerdem wird geprüft, ob lokalisierte Seiten eine einheitliche URL-Struktur verwenden:

```text
/en/pricing
/fr/pricing
/de/pricing
```

Zu den häufigsten Fehlern zählen fehlende lokalisierte Routen, fehlerhafte Locale-URLs, falsche Weiterleitungen, ein unerwarteter Rückfall auf das Standardgebietsschema und Probleme bei der Beibehaltung des Gebietsschemas.

### Sprachauswahl und `hreflang`

Besucher sollten die Spracheinstellung ändern können, ohne die Seite zu verlieren, die sie gerade ansehen. Beim Wechsel von `/fr/pricing` sollte die entsprechende Seite unter `/de/pricing` geöffnet werden, nicht die deutsche Startseite.

Das Audit prüft auch die Beziehungen zwischen lokalisierten Versionen einer Seite: fehlende `hreflang`, falsche Sprach- oder Regionscodes, ungültige URLs, fehlende wechselseitige Verweise oder Selbstverweise, falsche `x-default` und Konflikte mit kanonischen URLs.

Lokalisierte Seiten sollten im Allgemeinen sich selbst als kanonische URL festlegen. Eine französische Preisseite, deren kanonische URL auf die englische Version verweist, ist ein häufiger SEO-Fehler:

```text
/fr/pricing
canonical → /en/pricing
```

### Metadaten, Sitemaps und strukturierte Daten.

Wichtige Seitenmetadaten sollten lokalisiert werden: Titel, Meta-Beschreibungen, Open-Graph-Titel und -Beschreibungen, `og:locale` und Metadaten für Social Sharing.

Die Prüfung kontrolliert außerdem, ob lokalisierte URLs in der Sitemap erscheinen und korrekt aufgelöst werden und ob gegebenenfalls strukturierte Daten wie Product, WebPage, Breadcrumbs, FAQ, Organization, Article und LocalBusiness lokalisiert sind.

### Internationale Formatierung und Barrierefreiheit

Gebietsschemaabhängige Werte sollten dem Gebietsschema entsprechen:

```text
US:  $1,234.56
DE:  1.234,56 €
FR:  1 234,56 €
```

Das umfasst Datumsangaben, Uhrzeiten, Zahlen, Währungen, Maßeinheiten und Zeitzonen.

Die Lokalisierung für Barrierefreiheit umfasst `lang`, `aria-label`, zugängliche Namen, Formularbeschriftungen, Validierungsmeldungen und den Alternativtext von Bildern `alt`.

## Sprachliche Prüfung: Ist die Sprache korrekt, natürlich und einheitlich?

Die linguistische Prüfung bewertet die Sprache auf der Seite. Sie geht über die bloße Prüfung hinaus, ob der Text übersetzt wurde. Dabei wird beurteilt, ob die Übersetzung die richtige Bedeutung vermittelt und für Nutzerinnen und Nutzer in der Zielregion natürlich klingt.

### Vollständigkeit und Genauigkeit

Nicht übersetzte Inhalte werden markiert, während Markennamen, Produktnamen, URLs, E-Mail-Adressen, Code, Eigennamen und bewusst beibehaltene englische Begriffe als erwartete Ausnahmen gelten.

Eine französische Seite mit dem Text:

```text
Bienvenue sur notre site.

Start your free trial
```

würde wegen des nicht übersetzten Call-to-Action markiert werden.

Genauigkeitsprüfungen achten auf fehlende oder hinzugefügte Bedeutungen, falsche Interpretationen, falsche Zahlen, falsche Produktaktionen und eine falsche Terminologie.

### Sprachliche Flüssigkeit, Terminologie und Markenstimme

Eine Übersetzung kann technisch korrekt sein und trotzdem unnatürlich klingen. Bei der Prüfung wird auf holprige Formulierungen, unnatürlichen Satzbau, Grammatik- und Rechtschreibfehler, typische Fehler maschineller Übersetzungen und sprachspezifische Schreibkonventionen geachtet.

Außerdem identifiziert es Begriffe, die auf der Website unterschiedlich übersetzt werden:

```text
Workspace

Page 1 → Espace de travail
Page 2 → Workspace
Page 3 → Espace Workspace
```

Wenn es für das Projekt ein genehmigtes Glossar gibt, hat die darin festgelegte Terminologie Vorrang.

Die Markenstimme wird anhand des beabsichtigten Tons bewertet – professionell, freundlich, prägnant, technisch, dialogorientiert, hochwertig oder verspielt – sowie anhand der lokalspezifischen Grammatik und des Stils, etwa Groß- und Kleinschreibung, Zeichensetzung, Formalität und Kongruenz.

## Kontextprüfung: Ist die Übersetzung für dieses Produkt korrekt?

Der Kontext ist einer der am leichtesten zu übersehenden Aspekte der Lokalisierung.

Eine Übersetzung kann grammatikalisch vollkommen korrekt sein und trotzdem für den Kontext, in dem sie erscheint, falsch sein. Das Wort „Cancel“ kann bedeuten, einen Dialog zu schließen, ein Abonnement zu kündigen, eine Bestellung zu stornieren oder einen Vorgang abzubrechen. Die richtige Übersetzung hängt vom Produktkontext ab.

Das kontextbezogene Audit nutzt Seiten-, UI-, Terminologie- und Produktkontext, um zu bewerten, ob Übersetzungen an den Stellen, an denen sie verwendet werden, sinnvoll sind.

### UI-, Produkt- und CTA-Zielsetzung

Das Audit berücksichtigt, wo ein Text erscheint – auf einer Schaltfläche, in der Navigation, in einem Formular, einem modalen Fenster, einem Tooltip, einer Überschrift, einer Fehlermeldung, einer Benachrichtigung, einem Menü oder im Checkout – und bewertet die Sprache im Hinblick auf die Produktkonzepte auf der Seite: Funktionsnamen, Tarife, Einstellungen, Kontokonzepte, Workflow-Aktionen und Produktterminologie.

Handlungsaufforderungen verdienen besondere Aufmerksamkeit. „Kostenlose Testversion starten“, „Jetzt buchen“, „Änderungen speichern“, „Konto löschen“ und „Upgrade durchführen“ müssen die beabsichtigte Aktion in der Zielsprache vermitteln und dürfen nicht durch eine allgemeine Entsprechung ersetzt werden.

### Glossar, Übersetzungsspeicher und Kultur

Wenn ein Glossar oder eine genehmigte Terminologie verfügbar ist, können Übersetzungen anhand bevorzugter und verbotener Begriffe, Produktnamen und Markenbezeichnungen überprüft werden.

Wenn bereits genehmigte Übersetzungen vorliegen, kann die Prüfung Abweichungen vom Übersetzungsspeicher erkennen.

Bei der kulturellen Anpassung werden Währungen, Datumsangaben, Maßeinheiten, Adressen, Telefonnummern, Zahlungsgepflogenheiten, lokale Beispiele, kulturelle Bezüge und Redewendungen berücksichtigt. Nicht jeder Unterschied ist ein Fehler. Kulturelle Aspekte werden bei Bedarf als Empfehlungen oder prüfungsbedürftige Punkte dargestellt.

Auch der Zielgruppenkontext ist wichtig. Eine Sprache, die zu einem Reiseprodukt für Verbraucher passt, kann für ein Entwicklertool für Unternehmen, ein Finanzprodukt oder den Gesundheitsbereich ungeeignet sein.

## Visuelle Prüfung: Funktioniert die lokalisierte Website tatsächlich?

Sprachen verändern Größe, Form und Layout von Inhalten. Das visuelle Audit prüft gerenderte Seiten, um Probleme zu finden, die sich allein anhand von Quelltextzeichenfolgen nicht erkennen lassen.

### Überlauf, Layout und Texterweiterung

Das englische „Start free trial“ wird zu „Kostenlose Testversion starten“. Wenn die deutsche Version nicht mehr auf die Schaltfläche passt, wird dies vom Audit markiert.

Weitere visuelle Probleme sind abgeschnittener oder gekürzter Text, unerwartete Auslassungspunkte, überlaufende Navigation und Tabellen, überlappende Elemente, fehlerhafte Raster, falsch ausgerichtete Inhalte, überlaufende Modalfenster, unerwartete Zeilenumbrüche und falsche Abstände.

Lokalisierte Seiten können sich bei Mobil-, Tablet- und Desktop-Breiten ebenfalls unterschiedlich verhalten. Das Audit kann wichtige Layouts über diese Breakpoints hinweg bewerten.

### RTL, Schriftarten und lokalisierte Assets

Für RTL-Sprachen wie Arabisch und Hebräisch prüft das Audit die Textrichtung, die Spiegelung des Layouts, die Navigation, die Ausrichtung, Symbole, Formulare, Seitenleisten und Modale.

Die Typografie muss die Zielschriftsysteme unterstützen – einschließlich Arabisch, Chinesisch, Japanisch, Koreanisch, Thai, Vietnamesisch und Kyrillisch. Fehlende Glyphen, unerwartete Ersatzschriften, uneinheitliche Typografie, falsche Zeilenhöhe und Darstellungsprobleme werden markiert.

Sprachspezifische visuelle Inhalte sind ebenfalls wichtig. Eine französische Seite, die einen Screenshot einer englischsprachigen Benutzeroberfläche enthält, weist eine Lokalisierungslücke auf, selbst wenn jede Zeichenfolge auf der Seite übersetzt ist.

Das Audit prüft außerdem, ob die Lokalisierung die visuelle Hierarchie verändert: Überschriften, die zu lang werden, CTAs, die umbrechen, wichtige Texte, die an Hervorhebung verlieren, Karten mit uneinheitlicher Höhe und eine Navigation, die schwer zu überblicken ist.

## Wie Befunde priorisiert werden

Nicht jedes Problem hat dieselben Auswirkungen. Jeder Befund erhält einen Schweregrad, damit Teams zuerst die richtigen Dinge beheben können.

**Kritische** Probleme können die lokalisierte Nutzererfahrung schwer beeinträchtigen: eine nicht verfügbare Sprachversion, eine vollständig unübersetzte Seite, die Auslieferung der falschen Sprachversion, eine falsche Währung im Checkout, ein schwerwiegender Fehler im RTL-Layout oder eine nicht erreichbare lokalisierte Route.

**Schwerwiegende** Probleme beeinträchtigen die Benutzerfreundlichkeit, SEO oder Übersetzungsqualität: fehlendes `hreflang`, ein nicht übersetzter primärer CTA, ein schwerwiegender Übersetzungsfehler, eine fehlerhafte Navigation, abgeschnittener wichtiger Text oder eine falsche Produktterminologie.

**Mittelschwere** Probleme sind erkennbar und sollten behoben werden: inkonsistente Terminologie, fehlende lokalisierte Metadaten, sekundäre nicht übersetzte Inhalte, geringfügige visuelle Überläufe oder fehlender lokalisierter Alternativtext.

**Niedrige** Befunde sind Qualitätsverbesserungen: leicht unnatürliche Formulierungen, geringfügige stilistische Inkonsistenzen, kleinere Formatierungsprobleme oder optionale Verbesserungen von Metadaten.

**Info**-Elemente sind Empfehlungen oder Möglichkeiten und nicht unbedingt Fehler.

KI-gestützte Befunde enthalten gegebenenfalls auch eine Konfidenzstufe. Befunde mit hoher Konfidenz sind eher objektiv oder deterministisch – zum Beispiel ein fehlendes `hreflang`. Befunde mit geringerer Konfidenz, etwa ein mögliches Problem bei der kulturellen Anpassung, sollten als Empfehlungen zur Überprüfung und nicht als eindeutige Fehler behandelt werden.

## So funktioniert das Audit

Das Audit beginnt mit einer Website-URL, ermittelt verfügbare Sprachversionen, durchsucht lokalisierte Seiten, extrahiert Inhalte und Metadaten, rendert die Seiten und führt anschließend die vier Analyse-Engines aus, bevor es Bewertungen berechnet und einen Bericht erstellt.

Die Erkennung der Spracheinstellung nutzt Signale wie die URL-Struktur, `hreflang`, Sitemaps, Sprachauswahlen, HTML-Metadaten sowie Domains oder Subdomains.

Die Darstellung der tatsächlichen Seite ist entscheidend. Visuelle Probleme, die durch übersetzte Inhalte verursacht werden, sind im HTML-Quelltext oft nicht vorhanden. Der Bericht umfasst den Gesamtwert für die Lokalisierung, vier Modulbewertungen, nach Schweregrad gruppierte Probleme, betroffene Seiten, Belege, Konfidenz und empfohlene Maßnahmen.

## Von Erkenntnissen zu kontinuierlicher Qualität

Ein Audit sollte nicht dabei stehen bleiben, Ihnen zu sagen, was falsch ist.

Wenn Hyperlocalise ein Problem erkennt, kann der Befund als Ausgangspunkt für dessen Behebung dienen: Nicht übersetzte Inhalte können übersetzt, terminologische Inkonsistenzen anhand genehmigter Begriffe überprüft, Glossarverstöße korrigiert, fehlende Metadaten lokalisiert und visuelle Überläufe durch Anpassungen am Text oder Layout behoben werden.

Das schafft einen kontinuierlichen Arbeitsablauf: prüfen, Probleme finden, beheben, erneut prüfen, überwachen und Regressionen erkennen.

Lokalisierung ist kein einmaliges Projekt. Jede neue Funktion, Seite, Veröffentlichung oder Übersetzung kann neue Probleme mit sich bringen – neue englische Zeichenfolgen, fehlende Übersetzungen, Glossarverstöße, defekte `hreflang`, fehlerhafte Metadaten, visuelle Überläufe oder Routing-Regressionen.

Für Teams, die kontinuierlich ausliefern, besteht das Ziel darin, von einem einmaligen Lokalisierungsaudit zu einer kontinuierlichen Überwachung der Lokalisierungsqualität überzugehen.

Das ist derselbe Wandel, den wir in [Was ist Translation Intelligence?](/blog/what-is-translation-intelligence) beschrieben haben: Die Übersetzung selbst ist nicht mehr der Engpass. Entscheidend sind Urteilsvermögen, Kontext und das Erkennen von Regressionen.

## Häufig gestellte Fragen

### Ist das ein Übersetzungsprüfer?

Nicht ganz. Ein Übersetzungsprüfer konzentriert sich hauptsächlich auf die sprachliche Qualität. Das Hyperlocalise Localisation Audit bewertet die gesamte lokalisierte Website, einschließlich technischer Umsetzung, SEO, Produktkontext und visueller Benutzeroberfläche.

### Erzielt eine übersetzte Website automatisch eine gute Bewertung?

Nein. Eine Website kann vollständig übersetzte Inhalte haben und dennoch Probleme mit `hreflang`, dem Locale-Routing, Währungsangaben, der Datumsformatierung, der Terminologie, dem Produktkontext, dem visuellen Layout und der Barrierefreiheit aufweisen. Die Bewertung erfasst das Gesamterlebnis.

### Kann das Audit nicht übersetzte Inhalte erkennen?

Ja. Es analysiert lokalisierte Seiten, um Inhalte zu identifizieren, die offenbar in der Ausgangssprache verblieben sind, und berücksichtigt dabei Markennamen, URLs, Produktnamen und andere Inhalte, die möglicherweise absichtlich unverändert bleiben.

### Kann es schlechte Übersetzungen erkennen?

Das Audit kann potenzielle Probleme in Bezug auf Bedeutung, Sprachfluss, Terminologie, Grammatik und Konsistenz identifizieren. KI-gestützte Befunde enthalten Angaben zur Konfidenz, damit Teams fundierte Befunde von Punkten unterscheiden können, die möglicherweise eine menschliche Prüfung erfordern.

### Kann es visuelle Probleme erkennen?

Ja. Das Visual Audit bewertet gerenderte lokalisierte Seiten und kann Textüberläufe, fehlerhafte Layouts, Probleme mit der Responsivität, RTL-Probleme und Probleme mit lokalisierten Assets erkennen.

### Bedeutet eine niedrige Punktzahl, dass die Website unbrauchbar ist?

Nicht unbedingt. Der Score ist ein Gesundheitsindikator. Prüfen Sie stets die einzelnen Befunde und deren Schweregrad. Eine Website kann insgesamt einen guten Score haben und dennoch ein kritisches Problem aufweisen, das eine wichtige Seite oder einen Nutzerablauf beeinträchtigt.

## Finden Sie Lokalisierungsprobleme, bevor Ihre Nutzer darauf stoßen.

Traditionelle Website-Audits messen Leistung, Barrierefreiheit und SEO. Die Qualitätssicherung von Übersetzungen bewertet Genauigkeit, Grammatik und Sprachfluss. Ein Lokalisierungsaudit stellt vier Fragen zugleich:

- Ist die Lokalisierung korrekt implementiert?
- Ist die Übersetzung korrekt und natürlich?
- Ist es für das Produkt, die Zielgruppe und die Situation angemessen?
- Funktioniert das lokalisierte Erlebnis für Nutzer tatsächlich?

Zusammen ergeben diese Antworten ein umfassenderes Bild vom Zustand der Lokalisierung.

Wenn Sie Produkte für mehr als einen Markt entwickeln, sollten Sie sich dieses Bild machen, bevor Kunden selbst die Lücken entdecken. [Führen Sie ein kostenloses Lokalisierungs-Audit durch](/localisation-audit) oder erfahren Sie mehr über [kontextbezogene Lokalisierung](/blog/ai-translation-is-not-enough-context-aware-localisation).
