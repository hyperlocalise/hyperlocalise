---
title: Was ist ein Lokalisierungs-Audit für Websites?
date: 2026-08-13T00:00:00.000Z
excerpt: Die Übersetzung einer Website ist erst der Anfang. Ein Lokalisierungsaudit bewertet die technische Umsetzung, die Sprachqualität, den Produktkontext und das visuelle Erlebnis – und zeigt Ihnen, was Sie zuerst verbessern sollten.
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

A site can have translated pages and still give international users a poor experience. A missing `hreflang` tag can hurt discoverability. An untranslated call to action can confuse visitors. A technically correct translation can still use the wrong product term. A longer German string can break a button on mobile.

Die Frage, die ein Lokalisierungsaudit beantwortet, lautet nicht: „Wie viele Zeichenfolgen sind übersetzt?“ Sie lautet:

> **Fühlt sich Ihre Website so an, als wäre sie tatsächlich für Nutzer in dieser Region entwickelt worden?**

Das Hyperlocalise-Lokalisierungs-Audit prüft eine Website in vier Dimensionen – technisch, sprachlich, kontextbezogen und visuell – und gibt eine einzige Lokalisierungsbewertung von 100 sowie die zuerst zu behebenden Probleme aus.

## Was ein Lokalisierungsaudit abdeckt

Ein Lokalisierungsaudit ist weder ein Übersetzungsprüfer noch ein allgemeines Website-Audit.

Performance-, Barrierefreiheits- und SEO-Tools prüfen die Implementierung. Bei der Übersetzungs-QA geht es um Genauigkeit, Grammatik und Sprachfluss. Beides vermittelt kein vollständiges Bild einer mehrsprachigen Website.

Ein Lokalisierungs-Audit kombiniert beide Perspektiven:

| Audit            | Gewicht | Was es beantwortet                                       |
| ---------------- | -----: | ----------------------------------------------------- |
| Technisches Audit  |    25% | Ist die Lokalisierung korrekt implementiert?                |
| Sprachliche Prüfung |    25% | Sind die Übersetzungen korrekt, natürlich und konsistent?   |
| Kontextprüfung |    25% | Ist die Lokalisierung in Ihrem Produktkontext sinnvoll? |
| Visuelle Prüfung |    25% | Sieht die lokalisierte Benutzeroberfläche korrekt aus und verhält sie sich entsprechend?      |

Sie erhalten eine Gesamtbewertung, eine Bewertung für jeden Bereich sowie umsetzbare Ergebnisse mit Schweregrad, Belegen und Konfidenz.

## So interpretieren Sie die Punktzahl

Die Gesamtbewertung ist ein Gesundheitsindikator und kein Ersatz für die detaillierten Ergebnisse. Überprüfen Sie immer zuerst die Probleme mit dem höchsten Schweregrad.

| Punktzahl | Bewertung | Was es bedeutet |
| ------ | ----------------- | -------------------------------------------------------------------- |
| 90–100 | Hervorragend | Die lokalisierte Erfahrung ist in sehr gutem Zustand |
| 75–89  | Gut              | Die Website ist im Allgemeinen gut lokalisiert, mit einigen verbesserungswürdigen Punkten |
| 50–74  | Verbesserungsbedarf | Bei der Lokalisierung können für Nutzer auffällige Probleme auftreten                 |
| 25–49  | Schlecht              | Erhebliche Lokalisierungslücken beeinträchtigen das Nutzungserlebnis           |
| 0–24   | Kritisch          | Die lokalisierte Benutzererfahrung weist erhebliche Probleme auf, die behoben werden sollten |

Eine Website kann insgesamt eine gute Bewertung haben und trotzdem ein kritisches Problem im Checkout, bei der Weiterleitung oder auf einer stark frequentierten Seite aufweisen. Die Bewertung zeigt dir, wo du suchen solltest. Die Ergebnisse zeigen dir, was du beheben solltest.

## Technisches Audit: Ist die Lokalisierung korrekt implementiert?

Das technische Audit prüft die Infrastruktur hinter einer mehrsprachigen Website: Auffindbarkeit, Routing, Formatierung, Barrierefreiheit und ob Nutzer und Suchmaschinen die richtige Sprachumgebung erreichen können.

### Lokalisierungserkennung und -weiterleitung

Pages should declare their language and locale correctly, for example `<html lang="fr-FR">`. The audit looks for missing language declarations, incorrect language or region codes, locale/content mismatches, and inconsistent identifiers.

Außerdem wird geprüft, ob lokalisierte Seiten eine konsistente URL-Struktur verwenden:

```text
/en/pricing
/fr/pricing
/de/pricing
```

Häufige Fehler sind fehlende lokalisierte Routen, fehlerhafte URLs für Locales, falsche Weiterleitungen, unerwartete Rückfälle auf die Standardsprache und Probleme bei der Beibehaltung der Spracheinstellungen.

### Language switcher and `hreflang`

Visitors should be able to change locale without losing the page they are viewing. Switching from `/fr/pricing` should land on `/de/pricing`, not the German homepage.

The audit also checks the relationships between localised versions of a page: missing `hreflang`, incorrect language or region codes, invalid URLs, missing reciprocal or self-references, incorrect `x-default`, and conflicts with canonical URLs.

Lokalisierte Seiten sollten im Allgemeinen auf sich selbst als kanonische Version verweisen. Eine französische Preisseite, die auf die englische Version als kanonische Version verweist, ist ein häufiger SEO-Fehler:

```text
/fr/pricing
canonical → /en/pricing
```

### Metadaten, Sitemaps und strukturierte Daten

Important page metadata should be localised: titles, meta descriptions, Open Graph titles and descriptions, `og:locale`, and social sharing metadata.

Das Audit prüft außerdem, ob lokalisierte URLs in der Sitemap enthalten sind und korrekt aufgelöst werden und, sofern zutreffend, ob strukturierte Daten wie Product, WebPage, Breadcrumbs, FAQ, Organization, Article und LocalBusiness lokalisiert sind.

### Internationale Formatierung und Barrierefreiheit

Gebietsschemaspezifische Werte sollten dem Gebietsschema entsprechen:

```text
US:  $1,234.56
DE:  1.234,56 €
FR:  1 234,56 €
```

Das umfasst Datumsangaben, Uhrzeiten, Zahlen, Währungen, Maßeinheiten und Zeitzonen.

Accessibility localisation covers `lang`, `aria-label`, accessible names, form labels, validation messages, and image `alt` text.

## Sprachliche Prüfung: Ist die Sprache korrekt, natürlich und konsistent?

Das Linguistic Audit bewertet die Sprache auf der Seite. Es geht über die Prüfung hinaus, ob der Text übersetzt wurde. Es wird geprüft, ob die Übersetzung die richtige Bedeutung vermittelt und für Nutzer der Zielregion natürlich klingt.

### Vollständigkeit und Genauigkeit

Nicht übersetzte Inhalte werden gekennzeichnet, während Markennamen, Produktnamen, URLs, E-Mail-Adressen, Code, Eigennamen und absichtlich verwendete englische Begriffe als erwartete Ausnahmen behandelt werden.

Eine französische Seite mit folgendem Text:

```text
Bienvenue sur notre site.

Start your free trial
```

würde wegen des nicht übersetzten Call-to-Action-Elements markiert werden.

Genauigkeitsprüfungen achten auf fehlende oder hinzugefügte Bedeutungen, falsche Interpretationen, falsche Zahlen, falsche Produktaktionen und eine falsche Terminologie.

### Flüssigkeit, Terminologie und Markenstimme

Eine Übersetzung kann technisch korrekt sein und dennoch unnatürlich klingen. Bei der Prüfung wird auf unbeholfene Formulierungen, eine unnatürliche Satzstruktur, Grammatik- und Rechtschreibfehler, Artefakte maschineller Übersetzungen sowie sprachraumspezifische Schreibkonventionen geachtet.

Außerdem identifiziert es Konzepte, die auf der gesamten Website unterschiedlich übersetzt werden:

```text
Workspace

Page 1 → Espace de travail
Page 2 → Workspace
Page 3 → Espace Workspace
```

Bitte geben Sie den zu übersetzenden Text ein.

Die Markenstimme wird anhand des beabsichtigten Tons bewertet – professionell, freundlich, prägnant, technisch, dialogorientiert, hochwertig oder verspielt – sowie anhand der für die jeweilige Region typischen Grammatik und des Stils, etwa Großschreibung, Zeichensetzung, Höflichkeitsform und Kongruenz.

## Kontextbezogene Prüfung: Ist die Übersetzung für dieses Produkt korrekt?

Kontext ist einer der am leichtesten zu übersehenden Aspekte der Lokalisierung.

Eine Übersetzung kann grammatikalisch perfekt und dennoch für den jeweiligen Verwendungsort falsch sein. Das Wort „Cancel“ könnte bedeuten, einen Dialog zu schließen, ein Abonnement zu kündigen, eine Bestellung zu stornieren oder einen Vorgang abzubrechen. Die richtige Übersetzung hängt vom Produktkontext ab.

Das kontextbezogene Audit nutzt den Kontext der Seite, der Benutzeroberfläche, der Terminologie und des Produkts, um zu bewerten, ob Übersetzungen an den Stellen, an denen sie verwendet werden, sinnvoll sind.

### UI-, Produkt- und CTA-Ziel

Das Audit berücksichtigt, wo ein String erscheint – als Schaltfläche, in der Navigation, in einem Formular, Modal, Tooltip, einer Überschrift, Fehlermeldung, Benachrichtigung, einem Menü oder im Checkout – und bewertet die Sprache anhand der Produktkonzepte auf der Seite: Funktionsnamen, Tarife, Einstellungen, Kontokonzepte, Workflow-Aktionen und Produktterminologie.

Handlungsaufforderungen verdienen besondere Aufmerksamkeit. „Kostenlose Testversion starten“, „Jetzt buchen“, „Änderungen speichern“, „Konto löschen“ und „Upgrade durchführen“ müssen die beabsichtigte Aktion in der Zielsprache vermitteln, nicht ein allgemeines Äquivalent.

### Glossar, Übersetzungsspeicher und Kultur

Wenn ein Glossar oder eine genehmigte Terminologie verfügbar ist, können die Übersetzungen anhand bevorzugter und zu vermeidender Begriffe, Produktnamen und Markenterminologie überprüft werden.

Wenn zuvor genehmigte Übersetzungen vorhanden sind, kann das Audit Abweichungen vom Übersetzungsspeicher erkennen.

Bei der kulturellen Anpassung werden Währungen, Datumsangaben, Maßeinheiten, Adressen, Telefonnummern, Zahlungsgepflogenheiten, lokale Beispiele, kulturelle Bezüge und Redewendungen berücksichtigt. Nicht jeder Unterschied ist ein Fehler. Kulturelle Feststellungen werden gegebenenfalls als Empfehlungen oder zu überprüfende Punkte präsentiert.

Auch der Kontext der Zielgruppe spielt eine Rolle. Eine Sprache, die zu einem Verbraucherreiseprodukt passt, kann für ein Entwickler-Tool für Unternehmen, ein Finanzprodukt oder ein Produkt im Gesundheitswesen ungeeignet sein.

## Visuelle Prüfung: Funktioniert die lokalisierte Website tatsächlich?

Sprachen verändern die Größe, Form und das Layout von Inhalten. Das visuelle Audit bewertet gerenderte Seiten, um Probleme zu finden, die sich nicht allein anhand der Quellzeichenfolgen erkennen lassen.

### Überlauf, Layout und Texterweiterung

Englisch „Kostenlose Testversion starten“ wird zu Deutsch „Kostenlose Testversion starten“. Wenn die deutsche Version nicht mehr auf die Schaltfläche passt, markiert das Audit dies.

Weitere visuelle Probleme umfassen abgeschnittenen oder verkürzten Text, unerwartete Auslassungspunkte, Überläufe bei der Navigation und in Tabellen, sich überlagernde Elemente, fehlerhafte Raster, falsch ausgerichtete Inhalte, Überläufe in Dialogfenstern, unerwartete Zeilenumbrüche und falsche Abstände.

Lokalisierte Seiten können sich bei mobilen, Tablet- und Desktop-Breiten ebenfalls unterschiedlich verhalten. Das Audit kann wichtige Layouts über diese Breakpoints hinweg bewerten.

### RTL, Schriftarten und lokalisierte Assets

Für RTL-Sprachen wie Arabisch und Hebräisch prüft das Audit die Textrichtung, die Spiegelung des Layouts, die Navigation, die Ausrichtung, Symbole, Formulare, Seitenleisten und Modalfenster.

Die Typografie muss die Zielschriften unterstützen – einschließlich Arabisch, Chinesisch, Japanisch, Koreanisch, Thai, Vietnamesisch und Kyrillisch. Fehlende Glyphen, unerwartete Fallback-Schriftarten, uneinheitliche Typografie, eine falsche Zeilenhöhe und Darstellungsprobleme werden als Fehler markiert.

Sprachspezifische visuelle Elemente sind ebenfalls wichtig. Eine französische Seite, die einen Screenshot einer englischen Benutzeroberfläche enthält, weist eine Lokalisierungslücke auf, selbst wenn jede Zeichenfolge auf der Seite übersetzt ist.

Das Audit prüft außerdem, ob Lokalisierungsänderungen die visuelle Hierarchie beeinflussen: Überschriften, die zu lang werden, CTAs, die umbrechen, wichtige Texte, die an Betonung verlieren, Karten mit uneinheitlicher Höhe und eine Navigation, die schwer zu überblicken ist.

## Wie Befunde priorisiert werden

Nicht jedes Problem hat dieselben Auswirkungen. Jeder Befund wird mit einem Schweregrad versehen, damit Teams zuerst die richtigen Probleme beheben können.

**Kritische** Probleme können das lokalisierte Nutzungserlebnis erheblich beeinträchtigen: ein nicht verfügbarer Sprachraum, eine vollständig unübersetzte Seite, der falsche ausgelieferte Sprachraum, eine falsche Checkout-Währung, ein schwerwiegender Fehler im RTL-Layout oder eine nicht zugängliche lokalisierte Route.

**High** issues affect usability, SEO, or translation quality: missing `hreflang`, an untranslated primary CTA, a major translation error, broken navigation, clipped important text, or incorrect product terminology.

**Mittlere** Probleme sind auffällig und sollten behoben werden: inkonsistente Terminologie, fehlende lokalisierte Metadaten, sekundäre nicht übersetzte Inhalte, geringfügiges visuelles Überlaufen oder fehlender lokalisierter Alternativtext.

**Niedrig** eingestufte Befunde sind Qualitätsverbesserungen: leicht unnatürliche Formulierungen, geringfügige Stilinkonsistenzen, kleinere Formatierungsprobleme oder optionale Verbesserungen an Metadaten.

**Info**-Elemente sind Empfehlungen oder Möglichkeiten, bei denen es sich nicht unbedingt um Fehler handelt.

AI-powered findings also include a confidence level where appropriate. High-confidence findings are more likely to be objective or deterministic — for example, missing `hreflang`. Lower-confidence findings, such as a potential cultural adaptation issue, should be treated as recommendations for review rather than definitive errors.

## So funktioniert das Audit

Das Audit beginnt mit einer Website-URL, ermittelt die verfügbaren Sprachumgebungen, durchsucht lokalisierte Seiten, extrahiert Inhalte und Metadaten, rendert Seiten und führt anschließend die vier Analyse-Engines aus, bevor die Bewertungen berechnet und ein Bericht erstellt wird.

Locale discovery uses signals such as URL structure, `hreflang`, sitemaps, language selectors, HTML metadata, and domains or subdomains.

Die Darstellung der tatsächlichen Seite ist entscheidend. Durch übersetzte Inhalte verursachte visuelle Probleme sind in der HTML-Quelle oft nicht erkennbar. Der Bericht enthält den Gesamt-Lokalisierungswert, vier Modulbewertungen, nach Schweregrad gruppierte Probleme, betroffene Seiten, Belege, eine Konfidenzbewertung und empfohlene Maßnahmen.

## Von Erkenntnissen zu kontinuierlicher Qualität

Ein Audit sollte nicht damit enden, Ihnen nur mitzuteilen, was falsch ist.

Wenn Hyperlocalise ein Problem erkennt, kann der Befund zum Ausgangspunkt für dessen Behebung werden: Nicht übersetzte Inhalte können übersetzt, terminologische Inkonsistenzen anhand freigegebener Begriffe überprüft, Glossarverstöße aktualisiert, fehlende Metadaten lokalisiert und visueller Überlauf im Text oder Layout behoben werden.

Das schafft einen kontinuierlichen Workflow: prüfen, Probleme finden, beheben, erneut prüfen, überwachen und Regressionen erkennen.

Localisation is not a one-time project. Every new feature, page, release, or translation can introduce new problems — new English strings, missing translations, glossary violations, broken `hreflang`, incorrect metadata, visual overflow, or routing regressions.

Für Teams, die kontinuierlich veröffentlichen, besteht das Ziel darin, von einem einmaligen Lokalisierungs-Audit zu einer kontinuierlichen Überwachung der Lokalisierungsqualität überzugehen.

This is the same shift we described in [What Is Translation Intelligence?](/blog/what-is-translation-intelligence): translation output is no longer the bottleneck. Judgement, context, and regression detection are.

## Häufig gestellte Fragen

### Ist dies ein Übersetzungsprüfer?

Nicht ganz. Ein Übersetzungsprüfer konzentriert sich in erster Linie auf die sprachliche Qualität. Das Hyperlocalise-Lokalisierungsaudit bewertet die gesamte lokalisierte Website, einschließlich technischer Umsetzung, SEO, Produktkontext und visueller Benutzeroberfläche.

### Erzielt eine übersetzte Website automatisch eine gute Bewertung?

No. A website can have fully translated content and still have problems with `hreflang`, locale routing, currency, date formatting, terminology, product context, visual layout, and accessibility. The score evaluates the overall experience.

### Kann das Audit nicht übersetzten Inhalt erkennen?

Ja. Es analysiert lokalisierte Seiten, um Inhalte zu identifizieren, die offenbar in der Ausgangssprache verblieben sind, und berücksichtigt dabei Markennamen, URLs, Produktnamen und andere Inhalte, die absichtlich unverändert bleiben können.

### Kann es schlechte Übersetzungen erkennen?

Das Audit kann potenzielle Probleme in Bezug auf Bedeutung, Sprachfluss, Terminologie, Grammatik und Konsistenz identifizieren. KI-gestützte Ergebnisse enthalten Angaben zur Konfidenz, damit Teams eindeutige Ergebnisse von Punkten unterscheiden können, die möglicherweise eine menschliche Überprüfung erfordern.

### Kann es visuelle Probleme erkennen?

Ja. Das Visual Audit bewertet gerenderte lokalisierte Seiten und kann Textüberläufe, fehlerhafte Layouts, Probleme mit der Responsivität, RTL-Probleme und Probleme mit lokalisierten Assets erkennen.

### Bedeutet eine niedrige Bewertung, dass die Website unbrauchbar ist?

Nicht unbedingt. Der Score ist ein Gesundheitsindikator. Überprüfen Sie immer die einzelnen Ergebnisse und deren Schweregrad. Eine Website kann insgesamt einen guten Score haben und dennoch ein kritisches Problem aufweisen, das eine wichtige Seite oder einen wichtigen Nutzerfluss beeinträchtigt.

## Finden Sie Lokalisierungsprobleme, bevor Ihre Nutzer sie entdecken

Herkömmliche Website-Audits messen Performance, Barrierefreiheit und SEO. Die Übersetzungs-QA misst Genauigkeit, Grammatik und Sprachfluss. Ein Lokalisierungs-Audit stellt vier Fragen gleichzeitig:

- Ist die Lokalisierung korrekt implementiert?
- Ist die Übersetzung korrekt und natürlich?
- Ist es für das Produkt, die Zielgruppe und die Situation geeignet?
- Funktioniert das lokalisierte Erlebnis tatsächlich für die Nutzer?

Zusammen ergeben diese Antworten ein umfassenderes Bild der Lokalisierungsgesundheit.

If you are building products for more than one market, that picture is worth having before customers find the gaps themselves. [Run a free localisation audit](/localisation-audit) or read more about [context-aware localisation](/blog/ai-translation-is-not-enough-context-aware-localisation).
