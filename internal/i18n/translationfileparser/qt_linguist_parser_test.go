package translationfileparser

import (
	"strings"
	"testing"
)

const qtLinguistSample = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE TS>
<TS version="2.1" language="en_US" sourcelanguage="en">
<context>
    <name>MainWindow</name>
    <message>
        <location filename="mainwindow.cpp" line="42"/>
        <source>File</source>
        <extracomment>Menu title</extracomment>
        <translation type="unfinished"></translation>
    </message>
    <message>
        <source>Open</source>
        <comment>verb</comment>
        <translation>Open</translation>
    </message>
    <message id="save.action">
        <source>Save</source>
        <translation type="unfinished">Save</translation>
    </message>
    <message numerus="yes">
        <source>%n file(s)</source>
        <translation>
            <numerusform>%n file</numerusform>
            <numerusform>%n files</numerusform>
        </translation>
    </message>
    <message>
        <source>Gone</source>
        <translation type="obsolete">Weg</translation>
    </message>
    <message>
        <source>Missing</source>
        <translation type="vanished">Fort</translation>
    </message>
</context>
</TS>`

func TestLooksLikeQtLinguistTS(t *testing.T) {
	t.Parallel()
	if !LooksLikeQtLinguistTS([]byte(qtLinguistSample)) {
		t.Fatal("expected Qt catalog detection")
	}
	if !LooksLikeQtLinguistTS([]byte("\ufeff<?xml version=\"1.0\"?>\n<TS version=\"2.1\">\n</TS>")) {
		t.Fatal("expected BOM and xml declaration detection")
	}
	if LooksLikeQtLinguistTS([]byte(`export default { hello: "Hello" };`)) {
		t.Fatal("did not expect JS locale module to look like Qt")
	}
	if LooksLikeQtLinguistTS([]byte("")) {
		t.Fatal("did not expect empty content to look like Qt")
	}
}

func TestQtLinguistParserReadsMessagesAndSkipsObsolete(t *testing.T) {
	t.Parallel()
	values, contextByKey, err := (QtLinguistParser{}).ParseWithContext([]byte(qtLinguistSample))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if values["MainWindow|File"] != "File" {
		t.Fatalf("unfinished empty translation should fall back to source, got %#v", values["MainWindow|File"])
	}
	if values["MainWindow|Open|verb"] != "Open" {
		t.Fatalf("comment-disambiguated key, got %#v", values)
	}
	if values["save.action"] != "Save" {
		t.Fatalf("explicit id key, got %#v", values)
	}
	if values["MainWindow|%n file(s)::numerus.0"] != "%n file" {
		t.Fatalf("numerus 0, got %#v", values)
	}
	if values["MainWindow|%n file(s)::numerus.1"] != "%n files" {
		t.Fatalf("numerus 1, got %#v", values)
	}
	if _, ok := values["MainWindow|Gone"]; ok {
		t.Fatalf("obsolete messages must be skipped: %#v", values)
	}
	if _, ok := values["MainWindow|Missing"]; ok {
		t.Fatalf("vanished messages must be skipped: %#v", values)
	}
	if !strings.Contains(contextByKey["MainWindow|File"], "Menu title") {
		t.Fatalf("expected extracomment context, got %q", contextByKey["MainWindow|File"])
	}
	if !strings.Contains(contextByKey["MainWindow|File"], "mainwindow.cpp:42") {
		t.Fatalf("expected location context, got %q", contextByKey["MainWindow|File"])
	}
}

func TestTSFileParserRoutesQtAndJS(t *testing.T) {
	t.Parallel()
	qt, err := (TSFileParser{}).Parse([]byte(qtLinguistSample))
	if err != nil {
		t.Fatalf("parse qt: %v", err)
	}
	if qt["MainWindow|File"] != "File" {
		t.Fatalf("expected Qt route, got %#v", qt)
	}

	js, err := (TSFileParser{}).Parse([]byte(`export default { hello: "Hello" };`))
	if err != nil {
		t.Fatalf("parse js: %v", err)
	}
	if js["hello"] != "Hello" {
		t.Fatalf("expected JS locale route, got %#v", js)
	}
}

func TestMarshalQtLinguistUpdatesTranslationAndLocale(t *testing.T) {
	t.Parallel()
	out, err := MarshalQtLinguist([]byte(qtLinguistSample), map[string]string{
		"MainWindow|File":                  "Datei",
		"MainWindow|Open|verb":             "Öffnen",
		"save.action":                      "Speichern",
		"MainWindow|%n file(s)::numerus.0": "%n Datei",
		"MainWindow|%n file(s)::numerus.1": "%n Dateien",
	}, "en-US", "de-DE")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, `language="de_DE"`) {
		t.Fatalf("expected Qt locale rewrite, got %q", got)
	}
	if !strings.Contains(got, `sourcelanguage="en_US"`) {
		t.Fatalf("expected source locale rewrite, got %q", got)
	}
	if !strings.Contains(got, ">Datei</translation>") {
		t.Fatalf("expected translated File, got %q", got)
	}
	if strings.Contains(got, `type="unfinished"`) {
		t.Fatalf("expected unfinished to be cleared, got %q", got)
	}
	if !strings.Contains(got, ">Öffnen</translation>") {
		t.Fatalf("expected translated Open, got %q", got)
	}
	if !strings.Contains(got, ">Speichern</translation>") {
		t.Fatalf("expected translated Save, got %q", got)
	}
	if !strings.Contains(got, "<numerusform>%n Datei</numerusform>") {
		t.Fatalf("expected numerus 0, got %q", got)
	}
	if !strings.Contains(got, "<numerusform>%n Dateien</numerusform>") {
		t.Fatalf("expected numerus 1, got %q", got)
	}
	if !strings.Contains(got, `type="obsolete"`) || !strings.Contains(got, ">Weg</translation>") {
		t.Fatalf("expected obsolete message preserved, got %q", got)
	}
	if !strings.Contains(got, ">File</source>") {
		t.Fatalf("expected source text preserved, got %q", got)
	}
}

func TestQtLinguistParserReadsRootMessages(t *testing.T) {
	t.Parallel()
	values, _, err := (QtLinguistParser{}).ParseWithContext([]byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="en">
<message id="welcome.root">
    <source>Welcome</source>
    <translation type="unfinished"></translation>
</message>
<message>
    <source>Open</source>
    <translation>Open</translation>
</message>
</TS>`))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if values["welcome.root"] != "Welcome" {
		t.Fatalf("expected root message id, got %#v", values)
	}
	if values["unknown|Open"] != "Open" {
		t.Fatalf("expected unknown-context key, got %#v", values)
	}
}

func TestMarshalQtLinguistUpdatesRootMessages(t *testing.T) {
	t.Parallel()
	out, err := MarshalQtLinguist([]byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="en">
<message id="welcome.root">
    <source>Welcome</source>
    <translation type="unfinished"></translation>
</message>
</TS>`), map[string]string{
		"welcome.root": "Bienvenue",
	}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, ">Bienvenue</translation>") {
		t.Fatalf("expected root-level translation, got %q", got)
	}
}

func TestMarshalQtLinguistResetsContextForRootMessagesAfterContext(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="en">
<context>
    <name>Previous</name>
    <message>
        <source>Save</source>
        <translation type="unfinished"></translation>
    </message>
</context>
<message>
    <source>Open</source>
    <translation type="unfinished"></translation>
</message>
</TS>`)
	values, err := (QtLinguistParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if _, ok := values["unknown|Open"]; !ok {
		t.Fatalf("expected unknown-context key, got %#v", values)
	}
	out, err := MarshalQtLinguist(template, map[string]string{
		"Previous|Save": "Enregistrer",
		"unknown|Open":  "Ouvrir",
	}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, ">Ouvrir</translation>") {
		t.Fatalf("expected root message after context to be translated, got %q", got)
	}
	if !strings.Contains(got, ">Enregistrer</translation>") {
		t.Fatalf("expected context message to be translated, got %q", got)
	}
}

func TestMarshalQtLinguistStagedPreservesUnstagedUnfinished(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="fr">
<context>
    <name>Main</name>
    <message>
        <source>Save</source>
        <translation type="unfinished"></translation>
    </message>
    <message>
        <source>Open</source>
        <translation type="unfinished"></translation>
    </message>
    <message>
        <source>Close</source>
        <translation type="unfinished"></translation>
    </message>
    <message numerus="yes">
        <source>%n file(s)</source>
        <translation type="unfinished">
            <numerusform></numerusform>
            <numerusform></numerusform>
        </translation>
    </message>
</context>
</TS>`)
	values, err := (QtLinguistParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	values["Main|Save"] = "Enregistrer"
	values["Main|Close"] = "Fermer"
	out, err := MarshalQtLinguistStaged(template, values, map[string]string{
		"Main|Save": "Enregistrer",
	}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, "<translation>Enregistrer</translation>") {
		t.Fatalf("expected staged translation to be finished, got %q", got)
	}
	if !strings.Contains(got, "<source>Open</source>\n        <translation type=\"unfinished\"></translation>") {
		t.Fatalf("expected unstaged entry to stay unfinished and empty, got %q", got)
	}
	if strings.Contains(got, ">Open</translation>") {
		t.Fatalf("expected source fallback not to be written, got %q", got)
	}
	if !strings.Contains(got, "<translation>Fermer</translation>") {
		t.Fatalf("expected unstaged real translation to be written, got %q", got)
	}
	if strings.Count(got, `type="unfinished"`) != 2 {
		t.Fatalf("expected unstaged Open and numerus entries to stay unfinished, got %q", got)
	}
	if strings.Contains(got, ">%n file(s)</numerusform>") {
		t.Fatalf("expected numerus source fallback not to be written, got %q", got)
	}
}

func TestMarshalQtLinguistPreservesRichText(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="en">
<context>
    <name>Dialog</name>
    <message>
        <source>Click &lt;b&gt;OK&lt;/b&gt;</source>
        <translation type="unfinished">Click &lt;b&gt;OK&lt;/b&gt;</translation>
    </message>
</context>
</TS>`)
	values, _, err := (QtLinguistParser{}).ParseWithContext(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if values["Dialog|Click <b>OK</b>"] != "Click <b>OK</b>" {
		t.Fatalf("expected decoded rich text, got %#v", values)
	}
	out, err := MarshalQtLinguist(template, map[string]string{
		"Dialog|Click <b>OK</b>": "Klicke <b>OK</b>",
	}, "en", "de")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, "Klicke &lt;b&gt;OK&lt;/b&gt;") {
		t.Fatalf("expected escaped rich-text character data, got %q", got)
	}
	if strings.Contains(got, "<b>OK</b>") {
		t.Fatalf("did not expect literal HTML children, got %q", got)
	}
}

func TestMarshalQtLinguistPreservesByteElements(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="en">
<context>
    <name>Dialog</name>
    <message>
        <source>Hello<byte value="x9"/>world</source>
        <translation type="unfinished">Hello<byte value="x9"/>world</translation>
    </message>
</context>
</TS>`)
	values, _, err := (QtLinguistParser{}).ParseWithContext(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if !strings.Contains(values["Dialog|Hello<byte value=\"x9\"/>world"], `<byte value="x9"/>`) {
		t.Fatalf("expected byte tag in decoded value, got %#v", values)
	}
	out, err := MarshalQtLinguist(template, map[string]string{
		`Dialog|Hello<byte value="x9"/>world`: `Hallo<byte value="x9"/>Welt`,
	}, "en", "de")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, "Hallo") || !strings.Contains(got, "Welt") {
		t.Fatalf("expected translated text around byte, got %q", got)
	}
	if !strings.Contains(got, `<byte value="x9">`) && !strings.Contains(got, `<byte value="x9"/>`) {
		t.Fatalf("expected byte element, got %q", got)
	}
}

func TestQtLinguistHandlesUTF8BOM(t *testing.T) {
	t.Parallel()
	template := []byte("\ufeff<?xml version=\"1.0\" encoding=\"utf-8\"?>\n<TS version=\"2.1\"><context><name>C</name><message><source>Hi</source><translation type=\"unfinished\"></translation></message></context></TS>")
	values, err := (QtLinguistParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if values["C|Hi"] != "Hi" {
		t.Fatalf("expected BOM catalog to parse, got %#v", values)
	}
	out, err := MarshalQtLinguist(template, map[string]string{"C|Hi": "Salut"}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.HasPrefix(got, "\ufeff<?xml") {
		t.Fatalf("expected BOM preserved before declaration, got %q", got)
	}
	if !strings.Contains(got, "<translation>Salut</translation>") {
		t.Fatalf("expected translation written, got %q", got)
	}
}

func TestMarshalQtLinguistPartialNumerusStaysUnfinished(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="fr">
<context>
    <name>Main</name>
    <message numerus="yes">
        <source>%n file(s)</source>
        <translation type="unfinished">
            <numerusform></numerusform>
            <numerusform></numerusform>
        </translation>
    </message>
</context>
</TS>`)
	out, err := MarshalQtLinguist(template, map[string]string{
		"Main|%n file(s)::numerus.0": "%n fichier",
	}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, `<translation type="unfinished"><numerusform>%n fichier</numerusform><numerusform></numerusform></translation>`) {
		t.Fatalf("expected untranslated form left empty and unfinished, got %q", got)
	}
}

func TestQtLinguistSkipsEmptyLeadingLengthVariant(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="de">
<context>
    <name>Main</name>
    <message>
        <source>Preferences</source>
        <translation variants="yes"><lengthvariant></lengthvariant><lengthvariant>Einst.</lengthvariant></translation>
    </message>
    <message numerus="yes">
        <source>%n file(s)</source>
        <translation>
            <numerusform><lengthvariant></lengthvariant><lengthvariant>1 Datei</lengthvariant></numerusform>
            <numerusform><lengthvariant></lengthvariant><lengthvariant>%n Dateien</lengthvariant></numerusform>
        </translation>
    </message>
</context>
</TS>`)
	values, err := (QtLinguistParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if values["Main|Preferences"] != "Einst." {
		t.Fatalf("expected later length variant, got %#v", values)
	}
	if values["Main|%n file(s)::numerus.0"] != "1 Datei" {
		t.Fatalf("expected later numerus length variant, got %#v", values)
	}
	if values["Main|%n file(s)::numerus.1"] != "%n Dateien" {
		t.Fatalf("expected later numerus length variant, got %#v", values)
	}
	out, err := MarshalQtLinguist(template, values, "en", "de")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, `<translation variants="yes"><lengthvariant></lengthvariant><lengthvariant>Einst.</lengthvariant></translation>`) {
		t.Fatalf("expected existing variants preserved, got %q", got)
	}
	if !strings.Contains(got, `<numerusform><lengthvariant></lengthvariant><lengthvariant>1 Datei</lengthvariant></numerusform>`) {
		t.Fatalf("expected existing numerus variants preserved, got %q", got)
	}
}

func TestQtLinguistKeepsUnfinishedWhenPrimaryLengthVariantBlank(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="de">
<context>
    <name>Main</name>
    <message>
        <source>Preferences</source>
        <translation type="unfinished" variants="yes"><lengthvariant></lengthvariant><lengthvariant>Einst.</lengthvariant></translation>
    </message>
    <message numerus="yes">
        <source>%n file(s)</source>
        <translation type="unfinished">
            <numerusform><lengthvariant></lengthvariant><lengthvariant>1 Datei</lengthvariant></numerusform>
            <numerusform>%n Dateien</numerusform>
        </translation>
    </message>
</context>
</TS>`)
	values, err := (QtLinguistParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	out, err := MarshalQtLinguist(template, values, "en", "de")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, `<translation type="unfinished" variants="yes"><lengthvariant></lengthvariant><lengthvariant>Einst.</lengthvariant></translation>`) {
		t.Fatalf("expected unfinished kept for blank primary variant, got %q", got)
	}
	if strings.Count(got, `type="unfinished"`) != 2 {
		t.Fatalf("expected unfinished kept for blank primary numerus variant, got %q", got)
	}
}

func TestQtLinguistPreservesLengthVariants(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="de">
<context>
    <name>Main</name>
    <message>
        <source>Preferences</source>
        <translation variants="yes"><lengthvariant>Einstellungen</lengthvariant><lengthvariant>Einst.</lengthvariant></translation>
    </message>
</context>
</TS>`)
	values, err := (QtLinguistParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if values["Main|Preferences"] != "Einstellungen" {
		t.Fatalf("expected primary length variant, got %#v", values)
	}
	out, err := MarshalQtLinguist(template, values, "en", "de")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(out), `<translation variants="yes"><lengthvariant>Einstellungen</lengthvariant><lengthvariant>Einst.</lengthvariant></translation>`) {
		t.Fatalf("expected unchanged length variants preserved, got %q", out)
	}
	out, err = MarshalQtLinguist(template, map[string]string{"Main|Preferences": "Optionen"}, "en", "de")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(out), `<translation>Optionen</translation>`) {
		t.Fatalf("expected replaced translation without stale variants, got %q", out)
	}
}

func TestQtLinguistIDBasedEmptySource(t *testing.T) {
	t.Parallel()
	template := []byte(`<?xml version="1.0" encoding="utf-8"?>
<TS version="2.1" language="fr">
<context>
    <name>Main</name>
    <message id="app.greeting">
        <source></source>
        <translation>Hello</translation>
    </message>
</context>
</TS>`)
	values, err := (QtLinguistParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if values["app.greeting"] != "Hello" {
		t.Fatalf("expected id-keyed entry, got %#v", values)
	}
	out, err := MarshalQtLinguist(template, map[string]string{"app.greeting": "Bonjour"}, "en", "fr")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	if !strings.Contains(string(out), "<translation>Bonjour</translation>") {
		t.Fatalf("expected id-keyed translation written, got %q", out)
	}
}

func TestLooksLikeQtLinguistTSWithLongPrologue(t *testing.T) {
	t.Parallel()
	content := "<?xml version=\"1.0\"?>\n<!-- " + strings.Repeat("license ", 1000) + "-->\n<TS version=\"2.1\"></TS>"
	if !LooksLikeQtLinguistTS([]byte(content)) {
		t.Fatal("expected detection past a long leading comment")
	}
}

func TestQtLinguistParserRejectsNonTS(t *testing.T) {
	t.Parallel()
	if _, err := (QtLinguistParser{}).Parse([]byte(`export default { a: "b" };`)); err == nil {
		t.Fatal("expected reject")
	}
}
