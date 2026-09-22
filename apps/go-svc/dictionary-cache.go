package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"strconv"
	"strings"
	"time"
)

const (
	DICTIONARY_WORDS_CACHE_TTL       = 10 * time.Minute
	DICTIONARY_WORDS_CACHE_TIMEOUT   = 100 * time.Millisecond
	DICTIONARY_WORDS_CACHE_MAX_BYTES = dictionaryMaxResolvedBytes
)

type dictionaryWordsCache interface {
	Get(context.Context, string) (string, error)
	Set(context.Context, string, string, time.Duration) error
}

func resolvedDictionaryCacheKey(organizationID, projectID, locale string, dictionaries []dictionaryRecord) string {
	parts := []string{strconv.Quote(organizationID), strconv.Quote(projectID), strconv.Quote(locale)}
	// Preserve SQL precedence (priority, attachment creation time, dictionary ID).
	// Sorting only the versions would miss changes to duplicate-word winners.
	for _, d := range dictionaries {
		priority := ""
		if d.Priority != nil {
			priority = strconv.Itoa(*d.Priority)
		}
		parts = append(parts, strconv.Quote(d.ID), strconv.Itoa(d.WordsVersion), priority)
	}
	digest := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return "go-svc:dictionary-words:v1:" + hex.EncodeToString(digest[:])
}

func (api *dictionaryAPI) cachedResolvedWords(ctx context.Context, actor dictionaryActor, projectID, locale string, dictionaries []dictionaryRecord) (any, int, error) {
	key := resolvedDictionaryCacheKey(actor.organizationID, projectID, locale, dictionaries)
	cacheCtx, cancel := context.WithTimeout(ctx, DICTIONARY_WORDS_CACHE_TIMEOUT)
	raw, err := api.wordsCache.Get(cacheCtx, key)
	cancel()
	if err == nil && len(raw) <= DICTIONARY_WORDS_CACHE_MAX_BYTES {
		var words []string
		if json.Unmarshal([]byte(raw), &words) == nil && words != nil && len(words) <= dictionaryMaxResolvedWords {
			return resolvedDictionaryResponse(locale, dictionaries, words), 200, nil
		}
	}

	// Reload versions and words in one snapshot on a miss. Otherwise a concurrent
	// edit could populate a cache key with a different version's word set.
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return nil, 0, err
	}
	defer func() { _ = tx.Rollback(ctx) }() // Harmless after commit.
	if _, err := tx.Exec(ctx, "set transaction isolation level repeatable read read only"); err != nil {
		return nil, 0, err
	}
	dictionaries, err = loadProjectDictionaries(ctx, tx, actor, projectID, true)
	if err != nil {
		return nil, 0, err
	}
	words, err := loadResolvedDictionaryWords(ctx, tx, actor, projectID, locale)
	if err != nil {
		return nil, 0, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, 0, err
	}
	key = resolvedDictionaryCacheKey(actor.organizationID, projectID, locale, dictionaries)
	payload, err := json.Marshal(words)
	if err == nil && len(payload) <= DICTIONARY_WORDS_CACHE_MAX_BYTES {
		cacheCtx, cancel := context.WithTimeout(ctx, DICTIONARY_WORDS_CACHE_TIMEOUT)
		if err := api.wordsCache.Set(cacheCtx, key, string(payload), DICTIONARY_WORDS_CACHE_TTL); err != nil {
			// Avoid logging keys, words, credentials, or provider error text.
			slog.WarnContext(ctx, "dictionary_words_cache_write_failed")
		}
		cancel()
	}
	return resolvedDictionaryResponse(locale, dictionaries, words), 200, nil
}
