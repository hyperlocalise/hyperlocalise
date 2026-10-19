package translationfileparser

import (
	"strings"
	"testing"
)

func TestPOParserPOTFallsBackToMsgid(t *testing.T) {
	content := []byte(`msgid ""
msgstr ""
"Language: en\n"

msgid "Hello"
msgstr ""

msgid "item"
msgid_plural "items"
msgstr[0] ""
msgstr[1] ""
`)
	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["Hello"] != "Hello" {
		t.Fatalf("singular fallback = %q", got["Hello"])
	}
	if got["item||one"] != "item" || got["item||other"] != "items" {
		t.Fatalf("plural fallback = %+v", got)
	}
}

func TestPOParserCrowdinSourceKeySkipsEmptyMsgstr(t *testing.T) {
	content := []byte(`msgid ""
msgstr ""
"X-Crowdin-SourceKey: msgstr\n"

msgid "HELLO"
msgstr ""

msgid "WORLD"
msgstr "World"
`)
	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if _, ok := got["HELLO"]; ok {
		t.Fatalf("empty msgstr should be skipped when X-Crowdin-SourceKey is msgstr, got %+v", got)
	}
	if got["WORLD"] != "World" {
		t.Fatalf("populated msgstr = %+v", got)
	}
}

func TestPOParserCommentsBecomeEntryContext(t *testing.T) {
	content := []byte(`#. extracted note
# translator note
#: src/app.py:12
#, c-format
msgid "Hello"
msgstr "Hello"
`)
	_, ctx, err := (POFileParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if ctx["Hello"] != "extracted note\ntranslator note" {
		t.Fatalf("context = %q", ctx["Hello"])
	}
}

func TestPOParserSkipsObsoleteEntries(t *testing.T) {
	content := []byte(`#~ msgid "old"
#~ msgstr "vieil"

msgid "new"
msgstr "New"
`)
	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if len(got) != 1 || got["new"] != "New" {
		t.Fatalf("got %+v", got)
	}
}

func TestPOParserUsesHeaderPluralCategories(t *testing.T) {
	content := []byte(`msgid ""
msgstr ""
"Language: pl\n"
"Plural-Forms: nplurals=4; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : n%100>=10 && n%100<=20 ? 2 : 3);\n"

msgid "%d file"
msgid_plural "%d files"
msgstr[0] "1 plik"
msgstr[1] "2 pliki"
msgstr[2] "5 plików"
msgstr[3] "1,5 pliku"
`)
	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	want := map[string]string{
		"%d file||one":   "1 plik",
		"%d file||few":   "2 pliki",
		"%d file||many":  "5 plików",
		"%d file||other": "1,5 pliku",
	}
	for key, value := range want {
		if got[key] != value {
			t.Fatalf("key %q = %q, want %q (all %+v)", key, got[key], value, got)
		}
	}
	if len(got) != len(want) {
		t.Fatalf("got %+v", got)
	}
}

func TestPOParserCroatianPluralLastSlotIsOther(t *testing.T) {
	content := []byte(`msgid ""
msgstr ""
"Language: hr\n"
"Plural-Forms: nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);\n"

msgid "%d file"
msgid_plural "%d files"
msgstr[0] "1 datoteka"
msgstr[1] "2 datoteke"
msgstr[2] "5 datoteka"
`)
	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["%d file||one"] != "1 datoteka" || got["%d file||few"] != "2 datoteke" || got["%d file||other"] != "5 datoteka" {
		t.Fatalf("got %+v", got)
	}
	if _, ok := got["%d file||many"]; ok {
		t.Fatalf("croatian last slot must be other, got %+v", got)
	}
}

func TestPOParserEnglishCatalogKeepsRussianPluralFormula(t *testing.T) {
	content := []byte(`msgid ""
msgstr ""
"Language: en\n"
"Plural-Forms: nplurals=3; plural=(n%10==1 && n%100!=11 ? 0 : n%10>=2 && n%10<=4 && (n%100<10 || n%100>=20) ? 1 : 2);\n"

msgid "%d file"
msgid_plural "%d files"
msgstr[0] "one"
msgstr[1] "few"
msgstr[2] "many"
`)
	got, err := (POFileParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	if got["%d file||one"] != "one" || got["%d file||few"] != "few" || got["%d file||many"] != "many" {
		t.Fatalf("formula should win over English, got %+v", got)
	}
	if _, ok := got["%d file||other"]; ok {
		t.Fatalf("english catalog must not relabel the russian slot, got %+v", got)
	}
}

func TestMarshalPOFileClearsFuzzyWhenReplacing(t *testing.T) {
	template := []byte(`#, fuzzy, c-format
msgid "hello"
msgstr "Hello"
`)
	out, err := MarshalPOFile(template, map[string]string{"hello": "Bonjour"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	content := string(out)
	if strings.Contains(content, "fuzzy") {
		t.Fatalf("expected fuzzy flag removed, got %q", content)
	}
	if !strings.Contains(content, "#, c-format") || !strings.Contains(content, `msgstr "Bonjour"`) {
		t.Fatalf("expected remaining flag and translation, got %q", content)
	}
}

func TestMarshalPOFileUsesMsgctxtKey(t *testing.T) {
	template := []byte(`msgctxt "nav"
msgid "home"
msgstr "Home"

msgctxt "hero"
msgid "home"
msgstr "Home"
`)
	out, err := MarshalPOFile(template, map[string]string{
		"nav||home":  "Accueil",
		"hero||home": "Bienvenue",
	})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	content := string(out)
	if strings.Count(content, `msgstr "Accueil"`) != 1 || strings.Count(content, `msgstr "Bienvenue"`) != 1 {
		t.Fatalf("context-specific replacements missing: %q", content)
	}
}

func TestMarshalPOFileExpandsArabicPluralsAndHeader(t *testing.T) {
	template := []byte(`msgid ""
msgstr ""
"Language: en\n"
"Plural-Forms: nplurals=2; plural=(n != 1);\n"
"Project-Id-Version: demo\n"

msgid "item"
msgid_plural "items"
msgstr[0] "item"
msgstr[1] "items"
`)
	out, err := MarshalPOFileForLocale(template, map[string]string{
		"item||one":   "article",
		"item||other": "articles",
	}, "ar")
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	content := string(out)
	for _, want := range []string{
		`"Language: ar\n"`,
		"nplurals=6;",
		`"Project-Id-Version: demo\n"`,
		`msgstr[0] "articles"`,
		`msgstr[1] "article"`,
		`msgstr[2] "articles"`,
		`msgstr[3] "articles"`,
		`msgstr[4] "articles"`,
		`msgstr[5] "articles"`,
	} {
		if !strings.Contains(content, want) {
			t.Fatalf("missing %q in %q", want, content)
		}
	}
}

func TestStrategyParsesPOT(t *testing.T) {
	got, err := NewDefaultStrategy().Parse("messages.pot", []byte("msgid \"Save\"\nmsgstr \"\"\n"))
	if err != nil {
		t.Fatalf("parse pot: %v", err)
	}
	if got["Save"] != "Save" {
		t.Fatalf("got %+v", got)
	}
}
