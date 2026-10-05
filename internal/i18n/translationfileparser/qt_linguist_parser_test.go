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
	out, err := MarshalQtLinguist(template, map[string]string{
		"Dialog|Click <b>OK</b>": "Klicke <b>OK</b>",
	}, "en", "de")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	if !strings.Contains(got, "Klicke") || !strings.Contains(got, "OK") {
		t.Fatalf("expected rich-text translation, got %q", got)
	}
}

func TestQtLinguistParserRejectsNonTS(t *testing.T) {
	t.Parallel()
	if _, err := (QtLinguistParser{}).Parse([]byte(`export default { a: "b" };`)); err == nil {
		t.Fatal("expected reject")
	}
}
