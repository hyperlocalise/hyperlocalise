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
	checker, err := newHunspellSpellChecker(dictDir, registry)
	if err != nil {
		t.Fatalf("newHunspellSpellChecker() error = %v, want nil", err)
	}
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

	gotB, err := checker.Check(context.Background(), "bb-BB", []string{"hello"})
	if err != nil {
		t.Fatalf("Check(bb-BB) error = %v, want nil", err)
	}
	if len(gotB) != 1 || gotB[0].Word != "hello" {
		t.Errorf("Check(bb-BB, %q) = %+v, want a single issue for %q (malformed dictionary has no usable entries)", "hello", gotB, "hello")
	}
}

func TestNewHunspellSpellCheckerMissingDictionaryFile(t *testing.T) {
	registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
		"xx-YY": {AffFile: "does-not-exist.aff", DicFile: "does-not-exist.dic"},
	})

	_, err := newHunspellSpellChecker(t.TempDir(), registry)
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("newHunspellSpellChecker() error = %v, want error wrapping os.ErrNotExist", err)
	}
}

func TestNewHunspellSpellCheckerInvalidDictionary(t *testing.T) {
	tests := []struct {
		name    string
		dictDir string
	}{
		{name: "declared non-UTF-8 encoding", dictDir: nonUTF8DictDir},
		{name: "missing SET declaration", dictDir: noSetDictDir},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
				"xx-YY": {AffFile: "test.aff", DicFile: "test.dic"},
			})

			_, err := newHunspellSpellChecker(tt.dictDir, registry)
			if err == nil {
				t.Fatal("newHunspellSpellChecker() error = nil, want a clear startup error")
			}
			if !strings.Contains(err.Error(), "xx-YY") {
				t.Errorf("newHunspellSpellChecker() error = %q, want it to mention the failing locale %q", err.Error(), "xx-YY")
			}
		})
	}
}

func TestNewHunspellSpellCheckerClosesAlreadyOpenedHandlesOnFailure(t *testing.T) {
	original := newHunspellDictionary
	t.Cleanup(func() { newHunspellDictionary = original })

	var (
		mu     sync.Mutex
		opened []*hunspell.Dictionary
	)
	syntheticErr := errors.New("synthetic dictionary load failure")

	newHunspellDictionary = func(affPath, dicPath string) (*hunspell.Dictionary, error) {
		if strings.Contains(affPath, "fail") {
			return nil, syntheticErr
		}
		dict, err := original(affPath, dicPath)
		if err != nil {
			return nil, err
		}
		mu.Lock()
		opened = append(opened, dict)
		mu.Unlock()
		return dict, nil
	}

	registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
		"aa-AA": {AffFile: "test.aff", DicFile: "test.dic"},
		"bb-BB": {AffFile: "test.aff", DicFile: "test.dic"},
		"cc-CC": {AffFile: "fail.aff", DicFile: "test.dic"},
	})

	_, err := newHunspellSpellChecker(validDictDir, registry)
	if !errors.Is(err, syntheticErr) {
		t.Fatalf("newHunspellSpellChecker() error = %v, want error wrapping the synthetic failure", err)
	}

	if len(opened) != 2 {
		t.Fatalf("opened %d dictionary handle(s) before the failure, want 2 (aa-AA, bb-BB)", len(opened))
	}
	for i, dict := range opened {
		if _, err := dict.Spell("hello"); !errors.Is(err, hunspell.ErrClosed) {
			t.Errorf("opened dictionary #%d: Spell() after newHunspellSpellChecker() failure error = %v, want hunspell.ErrClosed (newHunspellSpellChecker must close handles it already opened)", i, err)
		}
	}
}

func TestHunspellSpellCheckerCloseIsIdempotentAndClosesEveryHandle(t *testing.T) {
	registry := spellcheck.NewRegistry(map[string]spellcheck.DictionaryFiles{
		"aa-AA": {AffFile: "test.aff", DicFile: "test.dic"},
		"bb-BB": {AffFile: "test.aff", DicFile: "test.dic"},
	})

	checker, err := newHunspellSpellChecker(validDictDir, registry)
	if err != nil {
		t.Fatalf("newHunspellSpellChecker() error = %v, want nil", err)
	}

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

func TestNewSpellCheckerFailsFastWhenDictionariesAreMissing(t *testing.T) {
	checker, closeFn, err := newSpellChecker(t.TempDir())
	if err == nil {
		t.Fatal("newSpellChecker() error = nil, want an error because no real dictionaries exist in an empty directory")
	}
	if checker != nil {
		t.Errorf("newSpellChecker() checker = %v, want nil on error", checker)
	}
	if closeFn != nil {
		t.Error("newSpellChecker() closeFn is non-nil, want nil on error")
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
