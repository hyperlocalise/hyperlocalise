package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"
)

const (
	GLOSSARY_READ_CACHE_TIMEOUT   = 100 * time.Millisecond
	GLOSSARY_TERM_COUNT_CACHE_TTL = 10 * time.Minute
	GLOSSARY_COLLECTION_CACHE_TTL = 5 * time.Minute
	GLOSSARY_AUTHORS_CACHE_TTL    = 30 * time.Second
	GLOSSARY_READ_CACHE_MAX_BYTES = 1 << 20
)

type glossaryReadCache interface {
	Get(context.Context, string) (string, error)
	Set(context.Context, string, string, time.Duration) error
	Incr(context.Context, string) (int64, error)
}

func glossaryRevisionKey(organizationID, glossaryID string) string {
	return "go-svc:glossary:v1:" + organizationID + ":" + glossaryID + ":rev"
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

func (api *glossaryAPI) cacheGet(ctx context.Context, key string) (string, bool) {
	if api.readCache == nil {
		return "", false
	}
	cacheCtx, cancel := context.WithTimeout(ctx, GLOSSARY_READ_CACHE_TIMEOUT)
	defer cancel()
	raw, err := api.readCache.Get(cacheCtx, key)
	if err != nil || len(raw) == 0 || len(raw) > GLOSSARY_READ_CACHE_MAX_BYTES {
		return "", false
	}
	return raw, true
}

func (api *glossaryAPI) cacheSet(ctx context.Context, key, value string, ttl time.Duration) {
	if api.readCache == nil || len(value) == 0 || len(value) > GLOSSARY_READ_CACHE_MAX_BYTES {
		return
	}
	cacheCtx, cancel := context.WithTimeout(ctx, GLOSSARY_READ_CACHE_TIMEOUT)
	defer cancel()
	if err := api.readCache.Set(cacheCtx, key, value, ttl); err != nil {
		slog.WarnContext(ctx, "glossary_cache_write_failed")
	}
}

func (api *glossaryAPI) glossaryRevision(ctx context.Context, organizationID, glossaryID string) int64 {
	raw, ok := api.cacheGet(ctx, glossaryRevisionKey(organizationID, glossaryID))
	if !ok {
		return 0
	}
	rev, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || rev < 0 {
		return 0
	}
	return rev
}

func (api *glossaryAPI) bumpGlossaryCache(ctx context.Context, actor glossaryActor, glossaryID string) {
	if api.readCache == nil {
		return
	}
	cacheCtx, cancel := context.WithTimeout(ctx, GLOSSARY_READ_CACHE_TIMEOUT)
	defer cancel()
	if _, err := api.readCache.Incr(cacheCtx, glossaryRevisionKey(actor.organizationID, glossaryID)); err != nil {
		slog.WarnContext(ctx, "glossary_cache_bump_failed")
	}
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
	rev := api.glossaryRevision(ctx, actor.organizationID, glossaryID)
	return api.cachedJSON(ctx, glossaryCacheKey(actor.organizationID, glossaryID, rev, parts...), ttl, load)
}

func (api *glossaryAPI) cachedGlossaryTermCount(ctx context.Context, actor glossaryActor, glossaryID string) (int, error) {
	rev := api.glossaryRevision(ctx, actor.organizationID, glossaryID)
	key := glossaryCacheKey(actor.organizationID, glossaryID, rev, "term-count")
	if raw, ok := api.cacheGet(ctx, key); ok {
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
