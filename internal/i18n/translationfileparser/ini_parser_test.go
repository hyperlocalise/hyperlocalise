package translationfileparser

import (
	"strings"
	"testing"
)

func TestINIParserParsesSectionsCommentsAndQuotes(t *testing.T) {
	content := []byte(`# Application title
title=Welcome

; Home screen
[Home]
cta = Get started
quoted = "Hello, {name}!"
escaped = "Line one\nLine two"
apostrophe = 'It\'s ready'
inline = Hello there ; translator note
colon: spaced value
`)

	got, contextByKey, err := (INIParser{}).ParseWithContext(content)
	if err != nil {
		t.Fatalf("parse ini: %v", err)
	}

	assertINIValue(t, got, "title", "Welcome")
	assertINIValue(t, got, "Home.cta", "Get started")
	assertINIValue(t, got, "Home.quoted", "Hello, {name}!")
	assertINIValue(t, got, "Home.escaped", "Line one\nLine two")
	assertINIValue(t, got, "Home.apostrophe", "It's ready")
	assertINIValue(t, got, "Home.inline", "Hello there")
	assertINIValue(t, got, "Home.colon", "spaced value")
	if contextByKey["title"] != "Application title" {
		t.Fatalf("unexpected context for title: %#v", contextByKey)
	}
	if contextByKey["Home.cta"] != "Home screen" {
		t.Fatalf("unexpected context for Home.cta: %#v", contextByKey)
	}
}

func TestMarshalINIPreservesTemplateAndAppendsToSections(t *testing.T) {
	template := []byte(`# Application title
title=Welcome
[Home]
cta = Get started
quoted = "Hello"
`)

	got, err := MarshalINI(template, map[string]string{
		"title":       "Bienvenue",
		"Home.cta":    "Commencer",
		"Home.quoted": "Bonjour",
		"Home.extra":  "Encore",
		"a.first":     "Premier",
		"z.last":      "Dernier",
	})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}

	want := `# Application title
title=Bienvenue
[Home]
cta = Commencer
quoted = "Bonjour"
extra=Encore
[a]
first=Premier
[z]
last=Dernier
`
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got:\n%s\nwant:\n%s", got, want)
	}
}

func TestINIParserPreservesUnknownQuotedEscapes(t *testing.T) {
	content := []byte("path=\"C:\\Users\\App\"\nmixed=\"keep \\x and \\\\ slash\"\n")

	got, err := (INIParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse ini: %v", err)
	}
	assertINIValue(t, got, "path", `C:\Users\App`)
	assertINIValue(t, got, "mixed", `keep \x and \ slash`)
}

func TestMarshalINIRoundTripsUnknownQuotedEscapes(t *testing.T) {
	template := []byte("path=\"C:\\Users\\App\"\n")
	got, err := MarshalINI(template, map[string]string{
		"path": `C:\Users\App`,
	})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}
	want := "path=\"C:\\\\Users\\\\App\"\n"
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got: %q\nwant: %q", got, want)
	}

	parsed, err := (INIParser{}).Parse(got)
	if err != nil {
		t.Fatalf("reparse marshaled ini: %v", err)
	}
	assertINIValue(t, parsed, "path", `C:\Users\App`)
}

func TestINIParserAndMarshalHandleUTF8BOM(t *testing.T) {
	template := []byte("\xef\xbb\xbf[Home]\nwelcome=Hello\n")

	got, err := (INIParser{}).Parse(template)
	if err != nil {
		t.Fatalf("parse ini with BOM: %v", err)
	}
	assertINIValue(t, got, "Home.welcome", "Hello")
	if _, ok := got["\ufeffHome.welcome"]; ok {
		t.Fatalf("BOM must not be included in the first key: %#v", got)
	}

	rendered, err := MarshalINI(template, map[string]string{"Home.welcome": "Bonjour"})
	if err != nil {
		t.Fatalf("marshal ini with BOM: %v", err)
	}
	want := "\ufeff[Home]\nwelcome=Bonjour\n"
	if string(rendered) != want {
		t.Fatalf("ini output mismatch\n got: %q\nwant: %q", rendered, want)
	}
}

func TestINIParserRejectsDuplicateKeys(t *testing.T) {
	_, err := (INIParser{}).Parse([]byte("[Home]\ncta=Hello\ncta=Bonjour\n"))
	if err == nil {
		t.Fatal("expected duplicate key error")
	}
	if !strings.Contains(err.Error(), "duplicate ini key") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestINIParserRejectsDuplicateFlattenedKeys(t *testing.T) {
	_, err := (INIParser{}).Parse([]byte("Home.cta=Global\n[Home]\ncta=Section\n"))
	if err == nil {
		t.Fatal("expected duplicate flattened key error")
	}
	if !strings.Contains(err.Error(), `duplicate ini key "Home.cta"`) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestINIParserRejectsUnclosedSection(t *testing.T) {
	_, err := (INIParser{}).Parse([]byte("[Home\ncta=Hello\n"))
	if err == nil {
		t.Fatal("expected unclosed section error")
	}
	if !strings.Contains(err.Error(), "unclosed ini section header") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestINIParserRejectsEmptySectionName(t *testing.T) {
	_, err := (INIParser{}).Parse([]byte("[]\ncta=Hello\n"))
	if err == nil {
		t.Fatal("expected empty section error")
	}
	if !strings.Contains(err.Error(), "section name must not be empty") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestINIParserRejectsUnclosedQuote(t *testing.T) {
	_, err := (INIParser{}).Parse([]byte("title=\"Hello\n"))
	if err == nil {
		t.Fatal("expected unclosed quote error")
	}
	if !strings.Contains(err.Error(), "unclosed ini quoted value") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestINIParserRejectsMissingSeparator(t *testing.T) {
	_, err := (INIParser{}).Parse([]byte("not-an-entry\n"))
	if err == nil {
		t.Fatal("expected missing separator error")
	}
	if !strings.Contains(err.Error(), "must use '=' or ':'") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestINIParserRejectsInvalidUTF8(t *testing.T) {
	_, err := (INIParser{}).Parse([]byte("title=\xff\n"))
	if err == nil {
		t.Fatal("expected invalid UTF-8 error")
	}
	if !strings.Contains(err.Error(), "valid UTF-8") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestINIParserLineNumbersWithCarriageReturn(t *testing.T) {
	content := []byte("key1=val1\rkey1=val2")
	_, err := (INIParser{}).Parse(content)
	if err == nil {
		t.Fatal("expected duplicate key error")
	}
	const want = "line 2: duplicate ini key \"key1\" first defined on line 1"
	if !strings.Contains(err.Error(), want) {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestMarshalINIWritesEmptyUnquotedValue(t *testing.T) {
	template := []byte("title=\n")
	got, err := MarshalINI(template, map[string]string{"title": "Bienvenue"})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}
	want := "title=Bienvenue\n"
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got: %q\nwant: %q", got, want)
	}
}

func TestMarshalINIQuotesValuesThatNeedQuoting(t *testing.T) {
	template := []byte("title=Welcome\n")
	got, err := MarshalINI(template, map[string]string{
		"title": "Hello ; world",
	})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}
	want := "title=\"Hello ; world\"\n"
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got: %q\nwant: %q", got, want)
	}
}

func TestINIParserTreatsInlineCommentAfterEmptyValueAsComment(t *testing.T) {
	content := []byte("title= ; translator note\nempty= # keep hash\nliteral=;not a comment\n")

	got, err := (INIParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse ini: %v", err)
	}
	assertINIValue(t, got, "title", "")
	assertINIValue(t, got, "empty", "")
	assertINIValue(t, got, "literal", ";not a comment")
}

func TestMarshalINIPreservesInlineCommentAfterEmptyValue(t *testing.T) {
	template := []byte("title= ; translator note\n")
	got, err := MarshalINI(template, map[string]string{"title": "Bienvenue"})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}
	want := "title=Bienvenue ; translator note\n"
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got: %q\nwant: %q", got, want)
	}

	parsed, err := (INIParser{}).Parse(got)
	if err != nil {
		t.Fatalf("reparse marshaled ini: %v", err)
	}
	assertINIValue(t, parsed, "title", "Bienvenue")
}

func TestMarshalINIPreservesInlineComments(t *testing.T) {
	template := []byte("title=Welcome ; keep me\n")
	got, err := MarshalINI(template, map[string]string{"title": "Bienvenue"})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}
	want := "title=Bienvenue ; keep me\n"
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got: %q\nwant: %q", got, want)
	}
}

func TestMarshalINIKeepsBOMBeforeInsertedGlobalKeys(t *testing.T) {
	template := []byte("\xef\xbb\xbf[Home]\nwelcome=Hello\n")
	rendered, err := MarshalINI(template, map[string]string{
		"Home.welcome": "Bonjour",
		"title":        "Bienvenue",
	})
	if err != nil {
		t.Fatalf("marshal ini with BOM: %v", err)
	}
	want := "\ufefftitle=Bienvenue\n[Home]\nwelcome=Bonjour\n"
	if string(rendered) != want {
		t.Fatalf("ini output mismatch\n got: %q\nwant: %q", rendered, want)
	}

	parsed, err := (INIParser{}).Parse(rendered)
	if err != nil {
		t.Fatalf("reparse marshaled ini with BOM: %v", err)
	}
	assertINIValue(t, parsed, "title", "Bienvenue")
	assertINIValue(t, parsed, "Home.welcome", "Bonjour")
}

func TestMarshalINIInsertsGlobalKeysBeforeFirstSectionComments(t *testing.T) {
	template := []byte("; Home screen\n[Home]\ncta=Start\n")
	got, err := MarshalINI(template, map[string]string{
		"Home.cta": "Commencer",
		"title":    "Bienvenue",
	})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}
	want := "title=Bienvenue\n; Home screen\n[Home]\ncta=Commencer\n"
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got:\n%s\nwant:\n%s", got, want)
	}

	_, contextByKey, err := (INIParser{}).ParseWithContext(got)
	if err != nil {
		t.Fatalf("reparse marshaled ini: %v", err)
	}
	if contextByKey["Home.cta"] != "Home screen" {
		t.Fatalf("unexpected context after insert: %#v", contextByKey)
	}
	if _, ok := contextByKey["title"]; ok {
		t.Fatalf("title must not inherit the section comment: %#v", contextByKey)
	}
}

func TestMarshalINIAppendsGlobalKeysBeforeFirstSection(t *testing.T) {
	template := []byte("[Home]\ncta=Start\n")
	got, err := MarshalINI(template, map[string]string{
		"Home.cta": "Commencer",
		"title":    "Bienvenue",
	})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}
	want := "title=Bienvenue\n[Home]\ncta=Commencer\n"
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got:\n%s\nwant:\n%s", got, want)
	}
}

func TestMarshalINIUsesLongestExistingSection(t *testing.T) {
	template := []byte("[Software.MyApp]\nName=Contoso\n")
	got, err := MarshalINI(template, map[string]string{
		"Software.MyApp.Name":    "Contoso FR",
		"Software.MyApp.Version": "1.0",
	})
	if err != nil {
		t.Fatalf("marshal ini: %v", err)
	}
	want := "[Software.MyApp]\nName=Contoso FR\nVersion=1.0\n"
	if string(got) != want {
		t.Fatalf("ini output mismatch\n got:\n%s\nwant:\n%s", got, want)
	}
}

func TestINIParserAllowsRepeatedSectionHeaders(t *testing.T) {
	content := []byte("[Home]\ncta=Start\n[Other]\nlabel=X\n[Home]\nfooter=Done\n")
	got, err := (INIParser{}).Parse(content)
	if err != nil {
		t.Fatalf("parse ini: %v", err)
	}
	assertINIValue(t, got, "Home.cta", "Start")
	assertINIValue(t, got, "Home.footer", "Done")
	assertINIValue(t, got, "Other.label", "X")
}

func TestSplitINIKeyPrefersLongestKnownSection(t *testing.T) {
	section, key := splitINIKey("Software.MyApp.Name", []string{"", "Software", "Software.MyApp"})
	if section != "Software.MyApp" || key != "Name" {
		t.Fatalf("splitINIKey = %q, %q", section, key)
	}
}

func assertINIValue(t *testing.T, got map[string]string, key, want string) {
	t.Helper()
	if got[key] != want {
		t.Fatalf("ini key %q = %q, want %q", key, got[key], want)
	}
}
