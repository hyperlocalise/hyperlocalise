package main

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

const memoryUnitBatchID = "44444444-4444-4444-8444-444444444444"

func memoryUnitDefaultFilters() memoryEntryListFilters {
	return memoryEntryListFilters{Sort: "created_at", SortDir: "desc"}
}

func TestParseMemoryEntryListFilters(t *testing.T) {
	filters, err := parseMemoryEntryListFilters(url.Values{})
	require.NoError(t, err)
	require.Equal(t, memoryUnitDefaultFilters(), filters)

	filters, err = parseMemoryEntryListFilters(url.Values{
		"search":          {"  hello world "},
		"sourceLocale":    {" en_US "},
		"targetLocale":    {"fr_FR"},
		"reviewStatus":    {"approved"},
		"sameAsSource":    {"true"},
		"origin":          {"import"},
		"provider":        {"deepl"},
		"createdByUserId": {strings.ToUpper(memoryUnitUserID)},
		"modifiedFrom":    {"2026-01-01T00:00:00Z"},
		"modifiedTo":      {"2026-01-02T00:00:00.123456Z"},
		"importBatchId":   {strings.ToUpper(memoryUnitBatchID)},
		"sort":            {"updated_at"},
		"sortDir":         {"ASC"},
	})
	require.NoError(t, err)
	require.Equal(t, memoryEntryListFilters{
		Search: "hello world", SourceLocale: "en-US", TargetLocale: "fr-FR", ReviewStatus: "approved",
		SameAsSource: "true", Origin: "import", Provider: "deepl", CreatedByUserID: memoryUnitUserID,
		ModifiedFrom: "2026-01-01T00:00:00Z", ModifiedTo: "2026-01-02T00:00:00.123456Z",
		ImportBatchID: memoryUnitBatchID, Sort: "updated_at", SortDir: "asc",
	}, filters)

	for name, query := range map[string]url.Values{
		"long search":       {"search": {strings.Repeat("a", 201)}},
		"review status":     {"reviewStatus": {"draft"}},
		"same as source":    {"sameAsSource": {"false"}},
		"created by":        {"createdByUserId": {"user_1"}},
		"import batch":      {"importBatchId": {"batch"}},
		"sort":              {"sort": {"source_text"}},
		"sort dir":          {"sortDir": {"up"}},
		"modified from":     {"modifiedFrom": {"2026-01-01"}},
		"modified to":       {"modifiedTo": {"yesterday"}},
		"inverted interval": {"modifiedFrom": {"2026-01-02T00:00:00Z"}, "modifiedTo": {"2026-01-01T00:00:00Z"}},
		// Lexically "." sorts before "Z", so string comparison accepted this.
		"inverted by fractional seconds": {"modifiedFrom": {"2026-01-01T00:00:00.5Z"}, "modifiedTo": {"2026-01-01T00:00:00Z"}},
		// Lexically "2026-01-01" sorts before "2026-01-02", but 01T23:00-05:00 is 02T04:00Z.
		"inverted across time zones": {"modifiedFrom": {"2026-01-01T23:00:00-05:00"}, "modifiedTo": {"2026-01-02T01:00:00Z"}},
	} {
		t.Run(name, func(t *testing.T) {
			_, err := parseMemoryEntryListFilters(query)
			requireMemoryFailure(t, err, http.StatusBadRequest, "invalid_memory_payload")
		})
	}

	_, err = parseMemoryEntryListFilters(url.Values{"search": {strings.Repeat("a", 200)}})
	require.NoError(t, err)

	for name, query := range map[string]url.Values{
		// Lexically "2026-01-02" sorts after "2026-01-01", but 02T01:00+02:00 is 01T23:00Z.
		"earlier instant in a later-looking zone": {"modifiedFrom": {"2026-01-02T01:00:00+02:00"}, "modifiedTo": {"2026-01-01T23:30:00Z"}},
		"same instant in different zones":         {"modifiedFrom": {"2026-01-01T12:00:00+01:00"}, "modifiedTo": {"2026-01-01T11:00:00Z"}},
		"fractional seconds before whole seconds": {"modifiedFrom": {"2026-01-01T00:00:00Z"}, "modifiedTo": {"2026-01-01T00:00:00.000001Z"}},
		"equal bounds": {"modifiedFrom": {"2026-01-01T00:00:00Z"}, "modifiedTo": {"2026-01-01T00:00:00.000Z"}},
	} {
		t.Run(name, func(t *testing.T) {
			filters, err := parseMemoryEntryListFilters(query)
			require.NoError(t, err)
			require.Equal(t, query.Get("modifiedFrom"), filters.ModifiedFrom)
			require.Equal(t, query.Get("modifiedTo"), filters.ModifiedTo)
		})
	}
}

func TestMemoryEntryListWhere(t *testing.T) {
	where, args, err := memoryEntryListWhere(memoryUnitMemoryID, memoryUnitDefaultFilters())
	require.NoError(t, err)
	require.Equal(t, `e.memory_id=$1`, where)
	require.Equal(t, []any{memoryUnitMemoryID}, args)

	where, args, err = memoryEntryListWhere(memoryUnitMemoryID, memoryEntryListFilters{
		SourceLocale: "en-US", TargetLocale: "fr-FR", ReviewStatus: "pending", SameAsSource: "true",
		Origin: "manual", Provider: "deepl", CreatedByUserID: memoryUnitUserID, ImportBatchID: memoryUnitBatchID,
		ModifiedFrom: "2026-01-01T00:00:00Z", ModifiedTo: "2026-01-02T00:00:00Z", Search: "Hello",
	})
	require.NoError(t, err)
	require.Equal(t, `e.memory_id=$1`+
		` and e.source_locale=$2`+
		` and e.target_locale=$3`+
		` and e.review_status=$4`+
		` and e.source_text=e.target_text`+
		` and e.provenance=$5`+
		` and (e.provenance=$6 or e.metadata->>'provider'=$6)`+
		` and e.created_by_user_id=$7::uuid`+
		` and e.import_batch_id=$8::uuid`+
		` and e.updated_at>=$9::timestamptz`+
		` and e.updated_at<=$10::timestamptz`+
		` and (e.external_key=$11 or e.management_search_vector @@ to_tsquery('simple', $12))`, where)
	require.Equal(t, []any{
		memoryUnitMemoryID, "en-US", "fr-FR", "pending", "manual", "deepl", memoryUnitUserID, memoryUnitBatchID,
		"2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z", "Hello", "Hello:*",
	}, args)
}

func TestMemoryEntrySearchWhere(t *testing.T) {
	mixed := "ABCDEF12-3456-4ABC-8DEF-0123456789AB"
	where, args := memoryEntrySearchWhere(mixed, 3)
	require.Equal(t, `e.id=$4::uuid or e.external_key=$5 or e.management_search_vector @@ to_tsquery('simple', $6)`, where)
	require.Equal(t, []any{strings.ToLower(mixed), mixed, "ABCDEF12:* & 3456:* & 4ABC:* & 8DEF:* & 0123456789AB:*"}, args)

	where, args = memoryEntrySearchWhere("&|!", 1)
	require.Equal(t, `e.external_key=$2`, where)
	require.Equal(t, []any{"&|!"}, args)
}

func TestBuildMemoryEntryTsQuery(t *testing.T) {
	for input, want := range map[string]string{
		"":                             "",
		"   ":                          "",
		"&|!():*<>'\"-":                "",
		"hello":                        "hello:*",
		"  Hello\tbig\nworld ":         "Hello:* & big:* & world:*",
		"it's (new) <b>\"quoted\"</b>": "it:* & s:* & new:* & b:* & quoted:* & /b:*",
		"co-op & re:use":               "co:* & op:* & re:* & use:*",
		"café 東京":                      "café:* & 東京:*",
	} {
		require.Equal(t, want, buildMemoryEntryTsQuery(input), input)
	}

	words := make([]string, 60)
	for i := range words {
		words[i] = "w" + itoa(i)
	}
	query := buildMemoryEntryTsQuery(strings.Join(words, " "))
	require.Len(t, strings.Split(query, " & "), 50)
	require.True(t, strings.HasSuffix(query, "w49:*"))
}

func TestMemoryEntryListSortColumn(t *testing.T) {
	require.Equal(t, "e.updated_at", memoryEntryListSortColumn("updated_at"))
	require.Equal(t, "e.created_at", memoryEntryListSortColumn("created_at"))
	require.Equal(t, "e.created_at", memoryEntryListSortColumn(""))
}

func TestHashMemoryEntryListFilters(t *testing.T) {
	base := memoryUnitDefaultFilters()
	hash := hashMemoryEntryListFilters(base)
	require.Len(t, hash, 16)
	require.Equal(t, hash, hashMemoryEntryListFilters(base))

	for name, mutate := range map[string]func(*memoryEntryListFilters){
		"search":    func(f *memoryEntryListFilters) { f.Search = "x" },
		"source":    func(f *memoryEntryListFilters) { f.SourceLocale = "en-US" },
		"target":    func(f *memoryEntryListFilters) { f.TargetLocale = "fr-FR" },
		"review":    func(f *memoryEntryListFilters) { f.ReviewStatus = "pending" },
		"same":      func(f *memoryEntryListFilters) { f.SameAsSource = "true" },
		"origin":    func(f *memoryEntryListFilters) { f.Origin = "manual" },
		"provider":  func(f *memoryEntryListFilters) { f.Provider = "deepl" },
		"creator":   func(f *memoryEntryListFilters) { f.CreatedByUserID = memoryUnitUserID },
		"from":      func(f *memoryEntryListFilters) { f.ModifiedFrom = "2026-01-01T00:00:00Z" },
		"to":        func(f *memoryEntryListFilters) { f.ModifiedTo = "2026-01-01T00:00:00Z" },
		"batch":     func(f *memoryEntryListFilters) { f.ImportBatchID = memoryUnitBatchID },
		"sort":      func(f *memoryEntryListFilters) { f.Sort = "updated_at" },
		"direction": func(f *memoryEntryListFilters) { f.SortDir = "asc" },
	} {
		changed := base
		mutate(&changed)
		require.NotEqual(t, hash, hashMemoryEntryListFilters(changed), name)
	}
}

func TestMemoryEntryListCursorRoundTrip(t *testing.T) {
	filters := memoryEntryListFilters{Search: "hello", Sort: "updated_at", SortDir: "asc"}
	sortValue := "2026-01-02T03:04:05.000000Z"
	cursor := encodeMemoryEntryListCursor(filters, sortValue, memoryUnitEntryID)
	require.NotContains(t, cursor, "=")

	payload, err := decodeMemoryEntryListCursor(cursor, filters)
	require.NoError(t, err)
	require.Equal(t, memoryEntryCursorPayload{
		Sort: "updated_at", Dir: "asc", SortValue: sortValue, ID: memoryUnitEntryID, FilterHash: hashMemoryEntryListFilters(filters),
	}, payload)

	padded := base64.URLEncoding.EncodeToString(mustMemoryCursorJSON(t, payload))
	decoded, err := decodeMemoryEntryListCursor(padded, filters)
	require.NoError(t, err)
	require.Equal(t, payload, decoded)

	payload.SortValue = "2026-01-02T03:04:05+02:00"
	decoded, err = decodeMemoryEntryListCursor(base64.RawURLEncoding.EncodeToString(mustMemoryCursorJSON(t, payload)), filters)
	require.NoError(t, err)
	require.Equal(t, payload, decoded)
}

func TestDecodeMemoryEntryListCursorRejectsTampering(t *testing.T) {
	filters := memoryUnitDefaultFilters()
	valid := memoryEntryCursorPayload{
		Sort: "created_at", Dir: "desc", SortValue: "2026-01-02T03:04:05.000000Z", ID: memoryUnitEntryID, FilterHash: hashMemoryEntryListFilters(filters),
	}
	encode := func(mutate func(*memoryEntryCursorPayload)) string {
		payload := valid
		mutate(&payload)
		return base64.RawURLEncoding.EncodeToString(mustMemoryCursorJSON(t, payload))
	}

	for name, cursor := range map[string]string{
		"not base64":   "%%%",
		"not json":     base64.RawURLEncoding.EncodeToString([]byte("nope")),
		"json array":   base64.RawURLEncoding.EncodeToString([]byte(`[]`)),
		"empty value":  encode(func(p *memoryEntryCursorPayload) { p.SortValue = "" }),
		"bad id":       encode(func(p *memoryEntryCursorPayload) { p.ID = "entry_1" }),
		"sort":         encode(func(p *memoryEntryCursorPayload) { p.Sort = "updated_at" }),
		"direction":    encode(func(p *memoryEntryCursorPayload) { p.Dir = "asc" }),
		"filter hash":  encode(func(p *memoryEntryCursorPayload) { p.FilterHash = "0000000000000000" }),
		"sort value":   encode(func(p *memoryEntryCursorPayload) { p.SortValue = "yesterday" }),
		"date only":    encode(func(p *memoryEntryCursorPayload) { p.SortValue = "2026-01-02" }),
		"other filter": encodeMemoryEntryListCursor(memoryEntryListFilters{Search: "x", Sort: "created_at", SortDir: "desc"}, valid.SortValue, valid.ID),
	} {
		t.Run(name, func(t *testing.T) {
			_, err := decodeMemoryEntryListCursor(cursor, filters)
			requireMemoryFailure(t, err, http.StatusBadRequest, "invalid_cursor")
		})
	}
}

func mustMemoryCursorJSON(t *testing.T, payload memoryEntryCursorPayload) []byte {
	t.Helper()
	raw, err := json.Marshal(payload)
	require.NoError(t, err)
	return raw
}

func TestListMemoryEntriesScripted(t *testing.T) {
	sortValue := "2026-01-02T03:04:05.000000Z"
	listRow := func() []any { return memoryUnitEntryValues("Hello", 1, sortValue) }
	request := func(query string) *http.Request {
		return httptest.NewRequest(http.MethodGet, "/?"+query, nil)
	}

	t.Run("has more returns a cursor", func(t *testing.T) {
		pool := &scriptPool{steps: []dbStep{
			{op: opQuery, table: [][]any{listRow(), listRow(), listRow()}},
			{op: opQueryRow, scan: []any{7}},
		}}
		api := &memoryAPI{pool: pool}
		value, status, err := api.listMemoryEntries(request("limit=2"), memoryUnitNative())
		require.NoError(t, err)
		require.Equal(t, http.StatusOK, status)
		requireScriptDone(t, pool)

		body := value.(map[string]any)
		require.Len(t, body["memoryEntries"], 2)
		require.Equal(t, 7, body["total"])
		require.Equal(t, map[string]any{"limit": 2, "returned": 2, "hasMore": true}, body["pagination"])
		cursor := body["nextCursor"].(*string)
		require.NotNil(t, cursor)
		payload, err := decodeMemoryEntryListCursor(*cursor, memoryUnitDefaultFilters())
		require.NoError(t, err)
		require.Equal(t, sortValue, payload.SortValue)
		require.Equal(t, memoryUnitEntryID, payload.ID)
	})

	t.Run("last page with cursor and invalid limit", func(t *testing.T) {
		filters := memoryEntryListFilters{Sort: "created_at", SortDir: "asc"}
		cursor := encodeMemoryEntryListCursor(filters, sortValue, memoryUnitEntryID)
		pool := &scriptPool{steps: []dbStep{
			{op: opQuery, table: [][]any{listRow()}},
			{op: opQueryRow, scan: []any{1}},
		}}
		api := &memoryAPI{pool: pool}
		value, _, err := api.listMemoryEntries(request("limit=500&offset=10&sortDir=asc&cursor="+cursor), memoryUnitNative())
		require.NoError(t, err)
		body := value.(map[string]any)
		require.Nil(t, body["nextCursor"])
		require.Equal(t, map[string]any{"limit": 50, "returned": 1, "hasMore": false}, body["pagination"])
	})

	t.Run("invalid filters and cursor fail before querying", func(t *testing.T) {
		api := &memoryAPI{pool: &scriptPool{}}
		_, _, err := api.listMemoryEntries(request("sort=bogus"), memoryUnitNative())
		requireMemoryFailure(t, err, http.StatusBadRequest, "invalid_memory_payload")
		_, _, err = api.listMemoryEntries(request("cursor=abc"), memoryUnitNative())
		requireMemoryFailure(t, err, http.StatusBadRequest, "invalid_cursor")
	})

	boom := errors.New("boom")
	for name, steps := range map[string][]dbStep{
		"query": {{op: opQuery, err: boom}},
		"scan":  {{op: opQuery, table: [][]any{{memoryUnitEntryID}}}},
		"rows":  {{op: opQuery, rowsErr: boom}},
		"count": {{op: opQuery}, {op: opQueryRow, err: boom}},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			pool := &scriptPool{steps: steps}
			_, _, err := (&memoryAPI{pool: pool}).listMemoryEntries(request(""), memoryUnitNative())
			require.Error(t, err)
			requireScriptDone(t, pool)
		})
	}
}
