package main

import (
	"reflect"
	"sort"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func parseBackTestKeys(t *testing.T, sourcePath, source string, targets map[string]string) ([]editorCatParseBackKey, []string) {
	t.Helper()
	parsed, err := translationfileparser.NewDefaultStrategy().Parse(sourcePath, []byte(source))
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	names := make([]string, 0, len(parsed))
	for key := range parsed {
		names = append(names, key)
	}
	sort.Strings(names)
	keys := make([]editorCatParseBackKey, len(names))
	for i, name := range names {
		keys[i] = editorCatParseBackKey{id: "id-" + name, key: name, target: targets[parsed[name]]}
	}
	return keys, names
}

func TestMapParsedDocumentToKeysMapsTranslatedMarkdownByStructure(t *testing.T) {
	keys, names := parseBackTestKeys(t, "docs/guide.md", "# Getting started\n\nInstall the CLI.\n", map[string]string{"Install the CLI.": "Installez la CLI."})
	if len(names) != 2 {
		t.Fatalf("expected heading and paragraph keys, got %v", names)
	}
	edited, err := translationfileparser.NewDefaultStrategy().Parse("docs/guide.md", []byte("# Premiers pas\n\nInstallez la CLI.\n"))
	if err != nil {
		t.Fatalf("parse edited: %v", err)
	}

	result := mapParsedDocumentToKeys(edited, keys)

	if len(result.Unmapped) != 0 {
		t.Fatalf("unexpected unmapped edits: %+v", result.Unmapped)
	}
	if len(result.Changes) != 1 || result.Changes[0].TargetText != "Premiers pas" {
		t.Fatalf("expected only the heading to change, got %+v", result.Changes)
	}
}

func TestMapParsedDocumentToKeysMapsTranslatedHTMLByPath(t *testing.T) {
	keys, _ := parseBackTestKeys(t, "site/index.html", "<h1>Pricing</h1><p>Start free.</p>", nil)
	edited, err := translationfileparser.NewDefaultStrategy().Parse("site/index.html", []byte("<h1>Tarifs</h1><p>Commencez gratuitement.</p>"))
	if err != nil {
		t.Fatalf("parse edited: %v", err)
	}

	result := mapParsedDocumentToKeys(edited, keys)

	if len(result.Changes) != 2 || len(result.Unmapped) != 0 {
		t.Fatalf("expected both elements to map, got %+v", result)
	}
}

func TestMapParsedDocumentToKeysReportsWhatItCannotMap(t *testing.T) {
	keys := []editorCatParseBackKey{
		{id: "a", key: "md.p", target: "Bonjour."},
		{id: "b", key: srx.SpanKey("md.p.2", 0), target: "Un."},
		{id: "c", key: srx.SpanKey("md.p.2", 1), target: "Deux."},
		{id: "d", key: "md.p.3", target: "Trois."},
	}
	parsed := map[string]string{
		"md.p":   "Bonjour.",
		"md.p.2": "Un.  Autre.",
		"md.h1":  "Nouveau titre",
	}

	result := mapParsedDocumentToKeys(parsed, keys)

	if len(result.Changes) != 0 {
		t.Fatalf("expected no changes, got %+v", result.Changes)
	}
	want := []editorCatDocumentUnmapped{
		{Key: "md.h1", Text: "Nouveau titre", Reason: editorCatParseBackUnknownKey},
		{Key: "md.p.2", Text: "Un.  Autre.", Reason: editorCatParseBackSentences},
		{Key: "md.p.3", Reason: editorCatParseBackMissing},
	}
	if !reflect.DeepEqual(result.Unmapped, want) {
		t.Fatalf("unmapped = %+v, want %+v", result.Unmapped, want)
	}
}

func TestMapParsedDocumentToKeysSkipsUnchangedSplitParagraphs(t *testing.T) {
	keys := []editorCatParseBackKey{
		{id: "b", key: srx.SpanKey("md.p", 1), target: "Deux."},
		{id: "a", key: srx.SpanKey("md.p", 0), target: "Un."},
	}

	result := mapParsedDocumentToKeys(map[string]string{"md.p": "Un.\nDeux."}, keys)

	if len(result.Changes) != 0 || len(result.Unmapped) != 0 {
		t.Fatalf("expected an unchanged paragraph, got %+v", result)
	}
}

func TestMapParsedDocumentToKeysIgnoresUntouchedUntranslatedParagraphs(t *testing.T) {
	source := "# Getting started\n\nInstall the CLI.\n\nRun the setup.\n"
	keys, _ := parseBackTestKeys(t, "docs/guide.md", source, nil)
	parsedSource, err := translationfileparser.NewDefaultStrategy().Parse("docs/guide.md", []byte(source))
	if err != nil {
		t.Fatalf("parse source: %v", err)
	}
	// parseBackKeys falls back to the source text when a key has no translation yet.
	for i := range keys {
		keys[i].target = parsedSource[keys[i].key]
	}
	edited, err := translationfileparser.NewDefaultStrategy().Parse("docs/guide.md", []byte("# Premiers pas\n\nInstall the CLI.\n\nRun the setup.\n"))
	if err != nil {
		t.Fatalf("parse edited: %v", err)
	}

	result := mapParsedDocumentToKeys(edited, keys)

	if len(result.Unmapped) != 0 {
		t.Fatalf("unexpected unmapped edits: %+v", result.Unmapped)
	}
	if len(result.Changes) != 1 || result.Changes[0].TargetText != "Premiers pas" {
		t.Fatalf("expected only the edited heading to change, got %+v", result.Changes)
	}
}

func TestIsEditorCatParseBackPathAcceptsDocumentAliases(t *testing.T) {
	for _, sourcePath := range []string{"docs/guide.md", "docs/guide.MDX", "docs/notes.markdown", "docs/notes.mkd", "site/index.html", "site/legacy.HTM"} {
		if !isEditorCatParseBackPath(sourcePath) {
			t.Errorf("expected %s to map back to segments", sourcePath)
		}
	}
	for _, sourcePath := range []string{"docs/guide.adoc", "slides/deck.pptx", "locales/en.json"} {
		if isEditorCatParseBackPath(sourcePath) {
			t.Errorf("expected %s not to map back to segments", sourcePath)
		}
	}
}
