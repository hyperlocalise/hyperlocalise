//go:build cgo_hunspell

package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"path/filepath"
	"sync"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/hunspell"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/spellcheck"
)

var newHunspellDictionary = hunspell.New

type localeHandle struct {
	mu   sync.Mutex
	dict *hunspell.Dictionary
}

type hunspellSpellChecker struct {
	handles map[string]*localeHandle
}

var _ SpellChecker = (*hunspellSpellChecker)(nil)

func newHunspellSpellChecker(dictDir string, registry *spellcheck.Registry) (*hunspellSpellChecker, error) {
	locales := registry.SupportedLocales()
	handles := make(map[string]*localeHandle, len(locales))

	for _, locale := range locales {
		files, err := registry.Resolve(locale)
		if err != nil {
			rollbackHandles(handles)
			return nil, fmt.Errorf("spellcheck: resolve locale %q: %w", locale, err)
		}

		affPath := filepath.Join(dictDir, files.AffFile)
		dicPath := filepath.Join(dictDir, files.DicFile)

		dict, err := newHunspellDictionary(affPath, dicPath)
		if err != nil {
			slog.Warn("spellcheck: dictionary load failed",
				"locale", locale,
				"aff_path", affPath,
				"dic_path", dicPath,
				"error", err,
			)
			rollbackHandles(handles)
			return nil, fmt.Errorf("spellcheck: load dictionary for locale %q: %w", locale, err)
		}

		handles[locale] = &localeHandle{dict: dict}
	}

	return &hunspellSpellChecker{handles: handles}, nil
}

func rollbackHandles(handles map[string]*localeHandle) {
	if err := closeHandles(handles); err != nil {
		slog.Warn("spellcheck: error closing dictionaries during startup rollback", "error", err)
	}
}

func closeHandles(handles map[string]*localeHandle) error {
	var errs []error
	for locale, h := range handles {
		h.mu.Lock()
		err := h.dict.Close()
		h.mu.Unlock()
		if err != nil {
			errs = append(errs, fmt.Errorf("locale %q: %w", locale, err))
		}
	}
	return errors.Join(errs...)
}

func (c *hunspellSpellChecker) Check(ctx context.Context, locale string, words []string) ([]SpellingIssue, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	handle, ok := c.handles[locale]
	if !ok {
		slog.Info("spellcheck: skipping check for unsupported locale",
			"locale", locale,
			"word_count", len(words),
		)
		return nil, fmt.Errorf("%w: %q", spellcheck.ErrUnsupportedLocale, locale)
	}

	words = uniqueWords(words)

	handle.mu.Lock()
	defer handle.mu.Unlock()

	var issues []SpellingIssue
	for _, word := range words {
		if err := ctx.Err(); err != nil {
			return issues, err
		}

		correct, err := handle.dict.Spell(word)
		if err != nil {
			return nil, fmt.Errorf("spellcheck: check locale %q: %w", locale, err)
		}
		if correct {
			continue
		}

		suggestions, err := handle.dict.Suggest(word)
		if err != nil {
			return nil, fmt.Errorf("spellcheck: suggest locale %q: %w", locale, err)
		}
		issues = append(issues, SpellingIssue{Word: word, Suggestions: suggestions})
	}

	return issues, nil
}

func (c *hunspellSpellChecker) Close() error {
	return closeHandles(c.handles)
}

func newSpellChecker(dictDir string) (SpellChecker, func() error, error) {
	registry := spellcheck.LoadRegistry()

	checker, err := newHunspellSpellChecker(dictDir, registry)
	if err != nil {
		return nil, nil, err
	}

	return checker, checker.Close, nil
}
