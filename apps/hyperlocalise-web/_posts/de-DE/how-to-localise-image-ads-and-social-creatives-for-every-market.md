---
title: So lokalisieren Sie Bildanzeigen und Social-Media-Motive für jeden Markt
date: 2026-11-24T00:00:00.000Z
excerpt: Die Bildunterschrift zu übersetzen ist einfach. Bei Kampagnen für mehrere Märkte wird es schwierig, wenn der Text fest ins Banner integriert ist. Dieser Leitfaden zeigt, wie Sie Bildanzeigen, Social-Media-Motive und Produktaufnahmen lokalisieren, damit sich jede Marktversion so liest, als wäre sie vor Ort erstellt worden.
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

Ihre Kampagne startet am Montag in acht Märkten. Die Anzeigentexte sind übersetzt, die Bildunterschriften stehen bereit und die Landingpages sind online.

Dann fragt jemand nach den Bannern.

Die Überschrift, das Angebot und die Handlungsaufforderung sind alle Teil des Bildes. Jeder Markt braucht eine eigene Version. Deshalb öffnet ein Designer die Quelldatei erneut, fügt die Übersetzungen ein, stellt fest, dass die deutsche Überschrift nicht hineinpasst, verkleinert sie, stellt fest, dass die japanische Schriftart fehlt, und wiederholt das Ganze für jede Größe und jeden Markt. Nach vierzig Assets startet die Kampagne am Donnerstag, und in einem Markt wird immer noch der Preis des letzten Quartals angezeigt.

In diesem Leitfaden erfahren Sie, wie Sie Bildanzeigen und Social-Media-Creatives richtig lokalisieren: Was Sie vor dem Start entscheiden sollten, wie Sie mit Texten umgehen, die bereits ins Bild integriert sind, und wie Sie jeden Markt vor der Veröffentlichung prüfen. Für die praktischen Beispiele verwenden wir **[Iris](/iris)**, die Hyperlocalise-Mac-App für mehrsprachige Assets. Die Checkliste lässt sich jedoch unabhängig davon anwenden, welche Tools Sie verwenden.

## Warum Bildanzeigen der am schwierigsten zu lokalisierende Teil einer Kampagne sind

Text in einem Produkt oder auf einer Website ist in Zeichenketten gespeichert. Sie können ihn extrahieren, übersetzen und wieder einfügen. Bei Text in einem Bild funktioniert das nicht.

- **Der Text ist Teil des Bildes.** Wenn niemand für jede Größe eine Datei mit Ebenen aufbewahrt hat, gibt es nichts auszutauschen.
- **Jeder Markt vervielfacht den Aufwand.** Ein Konzept × vier Größen × acht Märkte ergibt 32 Assets, und jede Textänderung lässt die Zählung von vorn beginnen.
- **Der Platz ist begrenzt.** Eine Überschrift, die auf Englisch passt, kann auf Deutsch 30 % länger sein, und der Kasten wird nicht größer.
- **Schriftsysteme verhalten sich unterschiedlich.** Im Japanischen und Thailändischen werden Zeilen ohne Leerzeichen zwischen Wörtern umgebrochen. Arabisch wird von rechts nach links gelesen. Viele Markenschriften enthalten keine Glyphen für diese Schriftsysteme.
- **Für Werbung gelten Regeln.** Angebotsbedingungen, Preise, Haftungsausschlüsse und unzulässige Werbeaussagen unterscheiden sich je nach Markt. Ein Fehler in bezahlter Werbung ist öffentlich sichtbar und kostspielig.

Das Problem ist also nicht wirklich die Übersetzung. Es geht darum, das Asset in jedem Markt neu aufzubauen und dabei Design, Markenbegriffe und Rechtstexte unverändert zu lassen.

## Schritt 1: Entscheiden Sie sich für die Märkte, nicht nur für die Sprachen.

Beginnen Sie mit einer Liste von Märkten in Form von Gebietsschemacodes: `fr-FR`, `de-DE`, `ja-JP`, `pt-BR`, `ar-AE`.

Sprache allein reicht nicht. Spanisch in Spanien und Spanisch in Mexiko unterscheiden sich in Wortwahl, Ton und Formalität. Portugiesisch in Brasilien und Portugal unterscheidet sich stärker, als die meisten Teams erwarten. Ein Preis, der in Frankreich als `€49` angezeigt wird, wird als `49 €` geschrieben. Ein „Black-Friday“-Angebot kann in manchen Märkten nichts oder die falschen Termine bedeuten.

Notieren Sie für jeden Markt:

- **Anrede.** Formelle oder informelle Anrede (`tu`/`vous`, `du`/`Sie`).
- **Angebot und Preise.** Währung, Format und ob das Angebot überhaupt gilt.
- **Rechtliche Hinweise.** Haftungsausschlüsse, Bedingungen und alles, was Aufsichtsbehörden vorschreiben.
- **Übersetzen oder neu formulieren.** Ein Wortspiel oder kultureller Bezug erfordert möglicherweise einen neuen Text statt einer Übersetzung. Das nennt man [Transkreation](/blog/hyperlocalisation-why-global-growth-needs-more-than-translation). Diese Entscheidung sollte gleich zu Beginn getroffen werden und nicht erst bei der Überprüfung.

## Schritt 2: Legen Sie Ihre Terminologie fest, bevor jemand mit der Übersetzung beginnt

Die meisten Fehler bei der Anzeigenlokalisierung sind Terminologiefehler und keine Grammatikfehler: Der Produktname wird übersetzt, obwohl er auf Englisch bleiben sollte, eine Marke eines Wettbewerbers wird als Bezeichnung für eine allgemeine Funktion verwendet oder eine Aussage, die die Rechtsabteilung im letzten Quartal entfernt hat, taucht in einem Markt wieder auf.

Bevor Sie etwas lokalisieren, stellen Sie sicher, dass Ihr Glossar Folgendes abdeckt:

- **Produkt- und Funktionsnamen** und ob sie jeweils übersetzt werden.
- **Freigegebene Übersetzungen** für wiederkehrende Kampagnenbegriffe wie „kostenloser Testzeitraum“, „zeitlich begrenzt“ und „anmelden“.
- **Verbotene Begriffe**, also Wörter, die in einem bestimmten Markt niemals erscheinen dürfen.
- **Slogans**, mit einer freigegebenen Version pro Markt statt einer Neuübersetzung für jede Kampagne.

In Hyperlocalise verwendet Iris dieselben Glossare und Translation Memories wie die Web-App. Freigegebene Übersetzungen werden übernommen, und unzulässige Begriffe werden in Bildschirmtexten und Bild-Prompts blockiert. Wenn Ihre Regeln in einem Markenhandbuch oder Compliance-Dokument stehen, laden Sie es als [Richtlinie](/product/guidelines) hoch und prüfen Sie die Texte anhand dieser Vorgaben. Wie Sie Zuständigkeiten und Durchsetzung über verschiedene Märkte hinweg sicherstellen, erfahren Sie in [So bleiben Markenstimme und Terminologie über verschiedene Märkte hinweg konsistent](/blog/how-to-keep-brand-voice-and-terminology-consistent-across-markets).

## Schritt 3: Lokalisieren Sie den Text im Bild

Es gibt zwei Ausgangspunkte, und sie erfordern unterschiedliche Ansätze.

### Sie haben ein fertiges Bild

Das ist der häufigste Fall. Sie haben eine reduzierte PNG- oder JPEG-Datei von einer Agentur oder einem Designtool, in der der Text fest eingebettet ist.

In Iris ist der Ablauf:

1. **Öffnen Sie das Bild** als Creative.
2. **Lesen Sie den Text im Bild.** Iris findet jeden Textbaustein und erfasst seine Position, damit Sie Überschrift, Angebot, Handlungsaufforderung und Kleingedrucktes als separate Elemente erhalten.
3. **Übersetze und überprüfe diese Elemente anhand deines Glossars und Übersetzungsspeichers. Du überprüfst den Text, nicht das Bild. Das geht schneller und lässt sich leichter mit Prüfenden in den einzelnen Märkten teilen.**
4. **Lokalisieren Sie das Bild für jeden Markt.** Iris setzt den freigegebenen Text an derselben Stelle und im selben Stil neu, während Fotografie, Produkt und Layout unverändert bleiben.

Jedes Ergebnis wird als Version des Werbemittels für den jeweiligen Markt gespeichert und neben dem Original angezeigt, sodass Sie die Märkte direkt miteinander vergleichen können. Eine Datei mit Ebenen oder eine saubere Hintergrundplatte ist nicht erforderlich.

### Sie entwerfen es ganz neu.

Falls das Werbemittel noch nicht existiert, erstellen Sie das Original in Iris anhand eines Briefings. Geben Sie Ihre Markenfarben, die verwendete Schriftart, das Layout, den genauen Wortlaut in Anführungszeichen sowie Ihr Logo und Ihre Produktbilder als Referenzen an. Lokalisieren Sie es anschließend auf dieselbe Weise.

Formulieren Sie den Ausgangstext so, dass er sich gut lokalisieren lässt :

- **Halte die Überschrift kurz.** Jedes Wort, das du im Englischen streichst, spart im Deutschen noch mehr.
- **Fügen Sie Textfragmente nicht zusammen.** „Sparen“ + „20 %“ + „heute“ funktioniert in Sprachen mit einer anderen Wortstellung nicht. Formulieren Sie den vollständigen Satz.
- **Lassen Sie Platz.** Planen Sie etwa ein Drittel mehr Platz ein, als der englische Text benötigt.

Wenn das Werbemittel in vielen Märkten eingesetzt wird und sich häufig ändert, sollten Sie den Text als bearbeitbare Textebenen anlegen, statt ihn in das Bild einzubetten. Text in bearbeitbaren Ebenen bleibt editierbar und lässt sich wie jede andere Nachricht übersetzen.

## Schritt 4: Prüfen Sie das Layout in jedem Markt

Das ist der Schritt, den Teams auslassen – und den Kundinnen und Kunden bemerken.

Übersetzungen variieren in der Länge. Deutsch, Finnisch und Französisch sind oft 20–35 % länger als Englisch. Chinesische und japanische Übersetzungen fallen kürzer aus, wodurch unangenehme Leerflächen entstehen können. Arabisch und Hebräisch werden von rechts nach links gelesen, daher wirken linksbündige Layouts falsch. Thai, Japanisch und Chinesisch setzen keine Leerzeichen zwischen Wörtern, sodass Zeilenumbrüche an unerwarteten Stellen auftreten.

Prüfen Sie für jeden Markt:

| Prüfung | Worauf Sie achten sollten |
| --- | --- |
| **Überlauf** | Text wird abgeschnitten, läuft über den Rand hinaus oder überlappt das Produkt |
| **Zeilenumbrüche** | Einzelne Wörter, die allein in der letzten Zeile stehen, oder Umbrüche, die einen Markennamen oder einen Preis trennen |
| **Ausrichtung** | Rechts-nach-links-Text rechtsbündig oder zentriert ausgerichtet, wobei das Layout weiterhin ausgewogen bleibt |
| **Schriftarten** | Fehlende Zeichen (leere Kästchen) oder eine Ersatzschrift, die nicht zur Marke passt |
| **Zahlen** | Preise, Prozentsätze und Datumsangaben in der im jeweiligen Markt üblichen Schreibweise |
| **Passend** | Text, der kurz genug ist, um in der Sekunde oder so gelesen zu werden, die eine Social-Media-Anzeige Aufmerksamkeit erhält |

Iris prüft auf diese Probleme, und Sie können sich jeden Markt vor der Freigabe in voller Größe ansehen. Bei länger laufenden Kampagnen sollten Sie dieselben Prüfungen durchführen wie bei einem [Website-Lokalisierungsaudit](/blog/what-is-a-website-localisation-audit), denn es ist dasselbe Prinzip, angewendet auf Werbemittel.

## Schritt 5: Mit Personen überprüfen, die den Markt kennen

KI bringt Sie in jedem Markt zu einem soliden ersten Entwurf. Eine Person mit Marktkenntnis sollte dennoch alles freigeben, wofür Sie bezahlen, um es Kunden zu präsentieren.

Bewertung schnell erstellen:

- **Senden Sie den Reviewer:innen den Text und das gerenderte Bild**, nicht eine Tabelle mit Strings ohne Kontext.
- **Stellen Sie konkrete Fragen.** Klingt die Überschrift natürlich? Ist das Angebot klar? Wirkt etwas markenfremd oder riskant?
- **Behebe Probleme an der Quelle.** Wenn ein Begriff falsch ist, korrigiere ihn im Glossar statt in einem einzelnen Bild, damit er in allen späteren Assets richtig ist.
- **Freigaben speichern.** Wenn ein Markt etwas freigibt, merkt sich der Workspace die genehmigten Texte. So kann die nächste Kampagne darauf aufbauen, statt von vorn anzufangen.

## Schritt 6: Pro Markt exportieren und messen

Exportieren Sie nur die genehmigten Märkte. Benennen Sie Dateien nach Konzept, Größe und Sprachversion, damit Medieneinkäufer nicht das französische Banner in die deutsche Anzeigengruppe hochladen.

Behandeln Sie Lokalisierung anschließend als etwas, das sich messen lässt. Vergleichen Sie Klickrate und Conversion-Rate je Markt mit einer Kontrollvariante, die lediglich übersetzt wurde, oder mit den Ergebnissen der letzten Kampagne. Wenn ein Markt schlechter abschneidet, können Sie den Werbetext jetzt innerhalb von Minuten statt Tagen anpassen. Genau hier wird [Marktexperimentieren](/use-cases/market-experimentation) praktisch.

## Eine Checkliste für Ihre nächste Kampagne

- [ ] Märkte als Locale-Codes aufgeführt, jeweils mit Register, Angebot und Rechtstexten
- [ ] Entscheidung zwischen Übersetzen und Umformulieren für Überschriften und Slogans getroffen
- [ ] Das Glossar umfasst Produktnamen, wiederkehrende Kampagnenbegriffe und unzulässige Begriffe.
- [ ] Quelltexte kurz und in vollständigen Sätzen verfasst, mit Raum für Erweiterungen
- [ ] Bildtext gelesen, übersetzt und anhand des Glossars überprüft
- [ ] Jeden Markt in der Vorschau auf Überläufe, Zeilenumbrüche, Schreibrichtung, Schriftarten und Zahlen geprüft
- [ ] Von einer Person genehmigt, die sich in den jeweiligen Märkten auskennt
- [ ] Freigaben gespeichert, damit die nächste Kampagne darauf aufbauen kann
- [ ] Dateien nach Konzept, Größe und Gebietsschema benannt; Ergebnisse pro Markt nachverfolgt

## Probiere es an einem Asset aus.

Sie müssen nicht Ihren gesamten Kampagnenprozess ändern, um den Unterschied zu sehen. Nehmen Sie ein Banner, das Sie diesen Monat veröffentlichen, und einen Markt, den Sie bisher aufgeschoben haben. Lokalisieren Sie es in Iris, prüfen Sie das Layout und vergleichen Sie das Ergebnis und den Zeitaufwand mit Ihrem aktuellen Prozess.

Iris kann kostenlos für Mac heruntergeladen werden. Für die Generierung wird KI-Guthaben verwendet, das in kostenpflichtigen Tarifen ab 20 $ pro Monat enthalten ist. Lesen Sie den [Einführungsbeitrag zu Iris](/blog/introducing-iris-ai-localisation-engine-for-multilingual-assets) für den vollständigen Überblick oder **[Iris herunterladen](/iris)** und starten Sie mit Ihrer nächsten Kampagne.
