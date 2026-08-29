//go:build cgo_hunspell

package main

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/hunspell"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
)

var (
	validDictDir     = filepath.Join("internal", "hunspell", "testdata", "valid")
	malformedDictDir = filepath.Join("internal", "hunspell", "testdata", "malformed")
	nonUTF8DictDir   = filepath.Join("internal", "hunspell", "testdata", "non_utf8")
	noSetDictDir     = filepath.Join("internal", "hunspell", "testdata", "no_set")
)

func newTestHunspellChecker(t *testing.T, dictDir string, dictionaries map[string]spellcheck.DictionaryFiles) *hunspellSpellChecker {
	t.Helper()

	registry := spellcheck.NewRegistry(dictionaries)
	checker := newHunspellSpellChecker(dictDir, registry)
	t.Cleanup(func() {
		if err := checker.Close(); err != nil {
			t.Errorf("Close() error = %v, want nil", err)
		}
	})
	return checker
}

func writeFixtureCopy(t *testing.T, dstDir, dstBase, srcDir string) {
	t.Helper()

	for _, ext := range []string{"aff", "dic"} {
		data, err := os.ReadFile(filepath.Join(srcDir, "test."+ext))
		if err != nil {
			t.Fatalf("read fixture: %v", err)
		}
		if err := os.WriteFile(filepath.Join(dstDir, dstBase+"."+ext), data, 0o600); err != nil {
			t.Fatalf("write fixture copy: %v", err)
		}
	}
}

func TestHunspellSpellCheckerCheckSupportedLocale(t *testing.T) {
	checker := newTestHunspellChecker(t, validDictDir, map[string]spellcheck.DictionaryFiles{
		"xx-YY": {AffFile: "test.aff", DicFile: "test.dic"},
	})

	tests := []struct {
		name string
		word string
		want []SpellingIssue
	}{
		{name: "known word has no issues", word: "hello", want: nil},
		{name: "misspelling produces an issue with suggestions", word: "helo", want: []SpellingIssue{{Word: "helo", Suggestions: []string{"hello"}}}},
		{name: "word absent from the dictionary has no suggestions", word: "zzzqqqxxx", want: []SpellingIssue{{Word: "zzzqqqxxx", Suggestions: nil}}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := checker.Check(context.Background(), "xx-YY", []string{tt.word})
			if err != nil {
				t.Fatalf("Check() error = %v, want nil", err)
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("Check(%q) = %+v, want %+v", tt.word, got, tt.want)
			}
		})
	}
}

func TestHunspellSpellCheckerCheckDeduplicatesRepeatedWords(t *testing.T) {
	checker := newTestHunspellChecker(t, validDictDir, map[string]spellcheck.DictionaryFiles{
		"xx-YY": {AffFile: "test.aff", DicFile: "test.dic"},
	})

	got, err := checker.Check(context.Background(), "xx-YY", []string{
		"helo", "hello", "helo", "helo", "zzzqqqxxx", "hello", "zzzqqqxxx",
	})
	if err != nil {
		t.Fatalf("Check() error = %v, want nil", err)
	}

	want := []SpellingIssue{
		{Word: "helo", Suggestions: []string{"hello"}},
		{Word: "zzzqqqxxx", Suggestions: nil},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Check() = %+v, want %+v", got, want)
	}
}

func TestHunspellSpellCheckerCheckUnsupportedLocale(t *testing.T) {
	checker := newTestHunspellChecker(t, validDictDir, map[string]spellcheck.DictionaryFiles{
		"xx-YY": {AffFile: "test.aff", DicFile: "test.dic"},
	})

	_, err := checker.Check(context.Background(), "zz-WW", []string{"hello"})
	if !errors.Is(err, spellcheck.ErrUnsupportedLocale) {
		t.Fatalf("Check() error = %v, want error wrapping spellcheck.ErrUnsupportedLocale", err)
	}
}

func TestHunspellSpellCheckerCheckPropagatesContextCancellation(t *testing.T) {
	checker := newTestHunspellChecker(t, validDictDir, map[string]spellcheck.DictionaryFiles{
		"xx-YY": {AffFile: "test.aff", DicFile: "test.dic"},
	})

	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	_, err := checker.Check(ctx, "xx-YY", []string{"hello"})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Check() error = %v, want error wrapping context.Canceled", err)
	}
}

func TestNewHunspellSpellCheckerPartialLoadFromFixtures(t *testing.T) {
	dir := t.TempDir()
	writeFixtureCopy(t, dir, "locale-ok", validDictDir)
	writeFixtureCopy(t, dir, "locale-bad", noSetDictDir)

	checker := newTestHunspellChecker(t, dir, map[string]spellcheck.DictionaryFiles{
		"aa-AA": {AffFile: "locale-ok.aff", DicFile: "locale-ok.dic"},
		"zz-ZZ": {AffFile: "locale-bad.aff", DicFile: "locale-bad.dic"},
	})

	got, err := checker.Check(context.Background(), "aa-AA", []string{"hello"})
	if err != nil {
		t.Fatalf("Check(aa-AA) error = %v, want nil", err)
	}
	if len(got) != 0 {
		t.Errorf("Check(aa-AA, %q) = %+v, want no issues", "hello", got)
	}

	_, err = checker.Check(context.Background(), "zz-ZZ", []string{"hello"})
	if !errors.Is(err, spellcheck.ErrUnsupportedLocale) {
		t.Fatalf("Check(zz-ZZ) error = %v, want error wrapping spellcheck.ErrUnsupportedLocale", err)
	}
}

func TestHunspellSpellCheckerChecksAreIsolatedPerLocale(t *testing.T) {
	dir := t.TempDir()
	writeFixtureCopy(t, dir, "locale-a", validDictDir)
	writeFixtureCopy(t, dir, "locale-b", malformedDictDir)

	checker := newTestHunspellChecker(t, dir, map[string]spellcheck.DictionaryFiles{
		"aa-AA": {AffFile: "locale-a.aff", DicFile: "locale-a.dic"},
		"bb-BB": {AffFile: "locale-b.aff", DicFile: "locale-b.dic"},
	})

	gotA, err := checker.Check(context.Background(), "aa-AA", []string{"hello"})
	if err != nil {
		t.Fatalf("Check(aa-AA) error = %v, want nil", err)
	}
	if len(gotA) != 0 {
		t.Errorf("Check(aa-AA, %q) = %+v, want no issues (word is in this locale's dictionary)", "hello", gotA)
	}

	_, err = checker.Check(context.Background(), "bb-BB", []string{"hello"})
	if !errors.Is(err, spellcheck.ErrUnsupportedLocale) {
		t.Fatalf("Check(bb-BB) error = %v, want error wrapping spellcheck.ErrUnsupportedLocale (malformed header must skip the locale, not flag every word)", err)
	}
}

func TestNewHunspellSpellCheckerSkipsMissingDictionaryFile(t *testing.T) {
	registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
		"xx-YY": {AffFile: "does-not-exist.aff", DicFile: "does-not-exist.dic"},
	})

	checker := newHunspellSpellChecker(t.TempDir(), registry)
	t.Cleanup(func() {
		if err := checker.Close(); err != nil {
			t.Errorf("Close() error = %v, want nil", err)
		}
	})

	_, err := checker.Check(context.Background(), "xx-YY", []string{"hello"})
	if !errors.Is(err, spellcheck.ErrUnsupportedLocale) {
		t.Fatalf("Check() error = %v, want error wrapping spellcheck.ErrUnsupportedLocale for a locale whose files are missing", err)
	}
}

func TestNewHunspellSpellCheckerLoadsISO88591Dictionary(t *testing.T) {
	checker := newTestHunspellChecker(t, nonUTF8DictDir, map[string]spellcheck.DictionaryFiles{
		"de-DE": {AffFile: "test.aff", DicFile: "test.dic"},
	})

	got, err := checker.Check(context.Background(), "de-DE", []string{"hello"})
	if err != nil {
		t.Fatalf("Check() error = %v, want nil (ISO8859-1 dictionaries are transcoded to UTF-8)", err)
	}
	if len(got) != 0 {
		t.Errorf("Check() = %+v, want no issues for a word present in the ISO8859-1 dictionary", got)
	}
}

func TestNewHunspellSpellCheckerSkipsInvalidDictionary(t *testing.T) {
	unknownDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(unknownDir, "test.aff"), []byte("SET EBCDIC\n"), 0o600); err != nil {
		t.Fatalf("write unknown-encoding aff: %v", err)
	}
	if err := os.WriteFile(filepath.Join(unknownDir, "test.dic"), []byte("1\nhello\n"), 0o600); err != nil {
		t.Fatalf("write unknown-encoding dic: %v", err)
	}

	tests := []struct {
		name    string
		dictDir string
	}{
		{name: "unknown encoding", dictDir: unknownDir},
		{name: "missing SET declaration", dictDir: noSetDictDir},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
				"xx-YY": {AffFile: "test.aff", DicFile: "test.dic"},
			})

			checker := newHunspellSpellChecker(tt.dictDir, registry)
			t.Cleanup(func() {
				if err := checker.Close(); err != nil {
					t.Errorf("Close() error = %v, want nil", err)
				}
			})

			_, err := checker.Check(context.Background(), "xx-YY", []string{"hello"})
			if !errors.Is(err, spellcheck.ErrUnsupportedLocale) {
				t.Fatalf("Check() error = %v, want error wrapping spellcheck.ErrUnsupportedLocale for a locale whose dictionary failed to load", err)
			}
		})
	}
}

func TestNewHunspellSpellCheckerKeepsLoadedLocalesWhenOneFails(t *testing.T) {
	original := newHunspellDictionary
	t.Cleanup(func() { newHunspellDictionary = original })

	syntheticErr := errors.New("synthetic dictionary load failure")

	newHunspellDictionary = func(affPath, dicPath string) (*hunspell.Dictionary, error) {
		if strings.Contains(affPath, "fail") {
			return nil, syntheticErr
		}
		return original(affPath, dicPath)
	}

	registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
		"aa-AA": {AffFile: "test.aff", DicFile: "test.dic"},
		"bb-BB": {AffFile: "test.aff", DicFile: "test.dic"},
		"cc-CC": {AffFile: "fail.aff", DicFile: "test.dic"},
	})

	checker := newHunspellSpellChecker(validDictDir, registry)
	t.Cleanup(func() {
		if err := checker.Close(); err != nil {
			t.Errorf("Close() error = %v, want nil", err)
		}
	})

	got, err := checker.Check(context.Background(), "aa-AA", []string{"hello"})
	if err != nil {
		t.Fatalf("Check(aa-AA) error = %v, want nil (a later locale failure must not drop locales that already loaded)", err)
	}
	if len(got) != 0 {
		t.Errorf("Check(aa-AA, %q) = %+v, want no issues", "hello", got)
	}

	_, err = checker.Check(context.Background(), "cc-CC", []string{"hello"})
	if !errors.Is(err, spellcheck.ErrUnsupportedLocale) {
		t.Fatalf("Check(cc-CC) error = %v, want error wrapping spellcheck.ErrUnsupportedLocale for the failed locale", err)
	}
}

func TestHunspellSpellCheckerCloseIsIdempotentAndClosesEveryHandle(t *testing.T) {
	registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
		"aa-AA": {AffFile: "test.aff", DicFile: "test.dic"},
		"bb-BB": {AffFile: "test.aff", DicFile: "test.dic"},
	})

	checker := newHunspellSpellChecker(validDictDir, registry)

	if err := checker.Close(); err != nil {
		t.Fatalf("first Close() error = %v, want nil", err)
	}
	if err := checker.Close(); err != nil {
		t.Fatalf("second Close() error = %v, want nil (idempotent)", err)
	}

	if _, err := checker.Check(context.Background(), "aa-AA", []string{"hello"}); err == nil {
		t.Error("Check() after Close() error = nil, want a non-nil error since the underlying handle is closed")
	}
}

func TestNewSpellCheckerStartsWhenDictionariesAreMissing(t *testing.T) {
	checker, closeFn, err := newSpellChecker(t.TempDir())
	if err != nil {
		t.Fatalf("newSpellChecker() error = %v, want nil (missing dictionaries must not fail startup)", err)
	}
	if checker == nil {
		t.Fatal("newSpellChecker() checker = nil, want a checker that skips spelling")
	}
	if closeFn == nil {
		t.Fatal("newSpellChecker() closeFn is nil, want a close function")
	}
	t.Cleanup(func() {
		if err := closeFn(); err != nil {
			t.Errorf("closeFn() error = %v, want nil", err)
		}
	})

	_, err = checker.Check(context.Background(), "de-DE", []string{"Hallo"})
	if !errors.Is(err, spellcheck.ErrUnsupportedLocale) {
		t.Fatalf("Check() error = %v, want error wrapping spellcheck.ErrUnsupportedLocale when no dictionaries loaded", err)
	}
}

func TestHunspellSpellCheckerCheckConcurrent(t *testing.T) {
	checker := newTestHunspellChecker(t, validDictDir, map[string]spellcheck.DictionaryFiles{
		"aa-AA": {AffFile: "test.aff", DicFile: "test.dic"},
		"bb-BB": {AffFile: "test.aff", DicFile: "test.dic"},
	})

	locales := []string{"aa-AA", "bb-BB"}
	words := []string{"hello", "helo", "zzzqqqxxx", "apple", "appel"}

	const goroutines = 50
	var wg sync.WaitGroup
	for i := 0; i < goroutines; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			locale := locales[i%len(locales)]
			word := words[i%len(words)]
			if _, err := checker.Check(context.Background(), locale, []string{word}); err != nil {
				t.Errorf("Check(%q, %q) error = %v, want nil", locale, word, err)
			}
		}(i)
	}
	wg.Wait()
}
