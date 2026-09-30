package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	gosvcvalkey "github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/valkey"
)

const (
	GLOSSARY_READ_CACHE_TIMEOUT   = 100 * time.Millisecond
	GLOSSARY_CACHE_MUTATE_TIMEOUT = time.Second
	GLOSSARY_TERM_COUNT_CACHE_TTL = 10 * time.Minute
	GLOSSARY_COLLECTION_CACHE_TTL = 5 * time.Minute
	GLOSSARY_AUTHORS_CACHE_TTL    = 30 * time.Second
	GLOSSARY_CACHE_BYPASS_TTL     = GLOSSARY_TERM_COUNT_CACHE_TTL + time.Minute
	GLOSSARY_READ_CACHE_MAX_BYTES = 1 << 20
)

var errGlossaryCacheMiss = errors.New("glossary_cache_miss")

type glossaryReadCache interface {
	Get(context.Context, string) (string, error)
	Set(context.Context, string, string, time.Duration) error
	Incr(context.Context, string) (int64, error)
	Del(context.Context, string) error
}

func glossaryRevisionKey(organizationID, glossaryID string) string {
	return "go-svc:glossary:v1:" + organizationID + ":" + glossaryID + ":rev"
}

func glossaryBypassKey(organizationID, glossaryID string) string {
	return "go-svc:glossary:v1:" + organizationID + ":" + glossaryID + ":bypass"
}

func glossaryCacheKey(organizationID, glossaryID string, rev int64, parts ...string) string {
	var b strings.Builder
	b.WriteString("go-svc:glossary:v1:")
	b.WriteString(organizationID)
	b.WriteByte(':')
	b.WriteString(glossaryID)
	b.WriteByte(':')
	b.WriteString(strconv.FormatInt(rev, 10))
	for _, part := range parts {
		b.WriteByte(':')
		b.WriteString(part)
	}
	return b.String()
}

func glossaryQueryDigest(parts ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return hex.EncodeToString(sum[:16])
}

func isGlossaryCacheAbsent(err error) bool {
	return errors.Is(err, errGlossaryCacheMiss) || errors.Is(err, gosvcvalkey.ErrNil)
}

func (api *glossaryAPI) cacheLookup(ctx context.Context, key string, timeout time.Duration) (string, error) {
	if api.readCache == nil {
		return "", errGlossaryCacheMiss
	}
	cacheCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	raw, err := api.readCache.Get(cacheCtx, key)
	if err != nil {
		return "", err
	}
	if len(raw) == 0 || len(raw) > GLOSSARY_READ_CACHE_MAX_BYTES {
		return "", errGlossaryCacheMiss
	}
	return raw, nil
}

func (api *glossaryAPI) cacheGet(ctx context.Context, key string) (string, bool) {
	raw, err := api.cacheLookup(ctx, key, GLOSSARY_READ_CACHE_TIMEOUT)
	if err != nil {
		return "", false
	}
	return raw, true
}

func (api *glossaryAPI) cacheSetTTL(ctx context.Context, key, value string, ttl, timeout time.Duration) error {
	if api.readCache == nil || len(value) == 0 || len(value) > GLOSSARY_READ_CACHE_MAX_BYTES {
		return nil
	}
	cacheCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return api.readCache.Set(cacheCtx, key, value, ttl)
}

func (api *glossaryAPI) cacheSet(ctx context.Context, key, value string, ttl time.Duration) {
	if err := api.cacheSetTTL(ctx, key, value, ttl, GLOSSARY_READ_CACHE_TIMEOUT); err != nil {
		slog.WarnContext(ctx, "glossary_cache_write_failed")
	}
}

func (api *glossaryAPI) glossaryCacheBypassed(ctx context.Context, organizationID, glossaryID string) bool {
	raw, err := api.cacheLookup(ctx, glossaryBypassKey(organizationID, glossaryID), GLOSSARY_READ_CACHE_TIMEOUT)
	if err == nil {
		return raw != ""
	}
	return !isGlossaryCacheAbsent(err)
}

func (api *glossaryAPI) bypassGlossaryCache(ctx context.Context, actor glossaryActor, glossaryID string) {
	if err := api.cacheSetTTL(ctx, glossaryBypassKey(actor.organizationID, glossaryID), "1", GLOSSARY_CACHE_BYPASS_TTL, GLOSSARY_CACHE_MUTATE_TIMEOUT); err != nil {
		slog.WarnContext(ctx, "glossary_cache_bypass_failed")
	}
}

func (api *glossaryAPI) glossaryRevision(ctx context.Context, organizationID, glossaryID string) (int64, bool) {
	if api.readCache == nil || api.glossaryCacheBypassed(ctx, organizationID, glossaryID) {
		return 0, false
	}
	key := glossaryRevisionKey(organizationID, glossaryID)
	raw, err := api.cacheLookup(ctx, key, GLOSSARY_READ_CACHE_TIMEOUT)
	if err == nil {
		rev, parseErr := strconv.ParseInt(raw, 10, 64)
		if parseErr == nil && rev > 0 {
			return rev, true
		}
		return 0, false
	}
	if !isGlossaryCacheAbsent(err) {
		return 0, false
	}
	cacheCtx, cancel := context.WithTimeout(ctx, GLOSSARY_READ_CACHE_TIMEOUT)
	defer cancel()
	rev, incrErr := api.readCache.Incr(cacheCtx, key)
	if incrErr != nil || rev <= 0 {
		return 0, false
	}
	return rev, true
}

func (api *glossaryAPI) bumpGlossaryCache(ctx context.Context, actor glossaryActor, glossaryID string) {
	if api.readCache == nil {
		return
	}
	key := glossaryRevisionKey(actor.organizationID, glossaryID)
	var incrErr error
	for range 2 {
		cacheCtx, cancel := context.WithTimeout(ctx, GLOSSARY_CACHE_MUTATE_TIMEOUT)
		_, incrErr = api.readCache.Incr(cacheCtx, key)
		cancel()
		if incrErr == nil {
			cacheCtx, cancel = context.WithTimeout(ctx, GLOSSARY_CACHE_MUTATE_TIMEOUT)
			if err := api.readCache.Del(cacheCtx, glossaryBypassKey(actor.organizationID, glossaryID)); err != nil && !isGlossaryCacheAbsent(err) {
				slog.WarnContext(ctx, "glossary_cache_bypass_clear_failed")
			}
			cancel()
			return
		}
	}
	slog.WarnContext(ctx, "glossary_cache_bump_failed")
	api.bypassGlossaryCache(ctx, actor, glossaryID)
}

func (api *glossaryAPI) cachedJSON(ctx context.Context, key string, ttl time.Duration, load func() (any, int, error)) (any, int, error) {
	if raw, ok := api.cacheGet(ctx, key); ok {
		var value any
		if json.Unmarshal([]byte(raw), &value) == nil && value != nil {
			return value, 200, nil
		}
	}
	value, status, err := load()
	if err != nil || status != 200 {
		return value, status, err
	}
	payload, marshalErr := json.Marshal(value)
	if marshalErr == nil {
		api.cacheSet(ctx, key, string(payload), ttl)
	}
	return value, status, nil
}

func (api *glossaryAPI) cachedGlossaryJSON(ctx context.Context, actor glossaryActor, glossaryID string, ttl time.Duration, parts []string, load func() (any, int, error)) (any, int, error) {
	rev, ok := api.glossaryRevision(ctx, actor.organizationID, glossaryID)
	if !ok {
		return load()
	}
	return api.cachedJSON(ctx, glossaryCacheKey(actor.organizationID, glossaryID, rev, parts...), ttl, load)
}

func (api *glossaryAPI) cachedGlossaryTermCount(ctx context.Context, actor glossaryActor, glossaryID string) (int, error) {
	rev, ok := api.glossaryRevision(ctx, actor.organizationID, glossaryID)
	if !ok {
		return api.glossaryTermCount(ctx, glossaryID)
	}
	key := glossaryCacheKey(actor.organizationID, glossaryID, rev, "term-count")
	if raw, found := api.cacheGet(ctx, key); found {
		var count int
		if json.Unmarshal([]byte(raw), &count) == nil && count >= 0 {
			return count, nil
		}
	}
	count, err := api.glossaryTermCount(ctx, glossaryID)
	if err != nil {
		return 0, err
	}
	payload, marshalErr := json.Marshal(count)
	if marshalErr == nil {
		api.cacheSet(ctx, key, string(payload), GLOSSARY_TERM_COUNT_CACHE_TTL)
	}
	return count, nil
}

func glossaryPageDigest(r *http.Request) string {
	query := r.URL.Query()
	return glossaryQueryDigest(query.Get("search"), query.Get("cursor"), query.Get("limit"), query.Get("offset"), query.Get("locale"))
}
