package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeTMSStore struct {
	tmsErr           error
	strings          []translationString
	translations     []translationRecord
	locales          projectLocales
	glossaries       []glossary
	terms            []glossaryTerm
	memories         []translationMemory
	entries          []memoryEntry
	tmsTotal         int
	tmsProjectID     string
	tmsStringID      string
	tmsLocale        string
	stringFilters    stringFilters
	created          stringCreate
	patch            stringPatch
	deleted          bool
	write            translationWrite
	translationQuery translationFilters
	termFilters      glossaryTermFilters
	entryFilters     memoryEntryFilters
}

func (s *fakeTMSStore) getProjectLocales(_ context.Context, _ principal, projectID string) (projectLocales, error) {
	s.tmsProjectID = projectID
	return s.locales, s.tmsErr
}

func (s *fakeTMSStore) listStrings(_ context.Context, _ principal, projectID string, filters stringFilters) ([]translationString, int, error) {
	s.tmsProjectID, s.stringFilters = projectID, filters
	return s.strings, s.tmsTotal, s.tmsErr
}

func (s *fakeTMSStore) getString(_ context.Context, _ principal, projectID, stringID string) (translationString, error) {
	s.tmsProjectID, s.tmsStringID = projectID, stringID
	return translationString{ID: stringID}, s.tmsErr
}

func (s *fakeTMSStore) createString(_ context.Context, _ principal, projectID string, input stringCreate) (translationString, error) {
	s.tmsProjectID, s.created = projectID, input
	return translationString{ID: "string-1", Key: input.Key, SourceText: input.SourceText}, s.tmsErr
}

func (s *fakeTMSStore) updateString(_ context.Context, _ principal, projectID, stringID string, patch stringPatch) (translationString, error) {
	s.tmsProjectID, s.tmsStringID, s.patch = projectID, stringID, patch
	return translationString{ID: stringID}, s.tmsErr
}

func (s *fakeTMSStore) deleteString(_ context.Context, _ principal, projectID, stringID string) error {
	s.tmsProjectID, s.tmsStringID, s.deleted = projectID, stringID, true
	return s.tmsErr
}

func (s *fakeTMSStore) listTranslations(_ context.Context, _ principal, projectID string, filters translationFilters) ([]translationRecord, int, error) {
	s.tmsProjectID, s.translationQuery = projectID, filters
	return s.translations, s.tmsTotal, s.tmsErr
}

func (s *fakeTMSStore) listStringTranslations(_ context.Context, _ principal, projectID, stringID string) ([]translationRecord, error) {
	s.tmsProjectID, s.tmsStringID = projectID, stringID
	return s.translations, s.tmsErr
}

func (s *fakeTMSStore) getStringTranslation(_ context.Context, _ principal, projectID, stringID, locale string) (translationRecord, error) {
	s.tmsProjectID, s.tmsStringID, s.tmsLocale = projectID, stringID, locale
	if s.tmsErr != nil {
		return translationRecord{}, s.tmsErr
	}
	for _, item := range s.translations {
		if item.Locale == locale {
			return item, nil
		}
	}
	return translationRecord{}, errTranslationNotFound
}

func (s *fakeTMSStore) putTranslation(_ context.Context, _ principal, projectID, stringID, locale string, input translationWrite) (translationRecord, error) {
	s.tmsProjectID, s.tmsStringID, s.tmsLocale, s.write = projectID, stringID, locale, input
	return translationRecord{StringID: stringID, Locale: locale, Text: input.Text, Status: input.Status}, s.tmsErr
}

func (s *fakeTMSStore) listGlossaries(context.Context, principal, int, int) ([]glossary, int, error) {
	return s.glossaries, s.tmsTotal, s.tmsErr
}

func (s *fakeTMSStore) getGlossary(_ context.Context, _ principal, id string) (glossary, error) {
	return glossary{ID: id, Locales: []string{}}, s.tmsErr
}

func (s *fakeTMSStore) listGlossaryTerms(_ context.Context, _ principal, _ string, filters glossaryTermFilters) ([]glossaryTerm, int, error) {
	s.termFilters = filters
	return s.terms, s.tmsTotal, s.tmsErr
}

func (s *fakeTMSStore) listMemories(context.Context, principal, int, int) ([]translationMemory, int, error) {
	return s.memories, s.tmsTotal, s.tmsErr
}

func (s *fakeTMSStore) getMemory(_ context.Context, _ principal, id string) (translationMemory, error) {
	return translationMemory{ID: id, Locales: []string{}}, s.tmsErr
}

func (s *fakeTMSStore) listMemoryEntries(_ context.Context, _ principal, _ string, filters memoryEntryFilters) ([]memoryEntry, int, error) {
	s.entryFilters = filters
	return s.entries, s.tmsTotal, s.tmsErr
}

func sendResource(t *testing.T, p principal, store resourceStore, method, target, body string) *httptest.ResponseRecorder {
	t.Helper()
	h := newHandler(authFunc(func(context.Context, string) (principal, error) { return p, nil }), store)
	r := httptest.NewRequest(method, target, strings.NewReader(body))
	r.Header.Set("X-Api-Key", "hl_test")
	if body != "" {
		r.Header.Set("Content-Type", "application/json")
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

var (
	readScopes  = effectivePermissions([]string{"files:read"}, "member")
	writeScopes = effectivePermissions([]string{"files:read", "files:write"}, "developer")
)

func TestProjectLocalesRoute(t *testing.T) {
	store := &fakeResourceStore{}
	store.locales = projectLocales{Locales: []localeProgress{{Locale: "fr", TotalStrings: 4, TranslatedStrings: 2, TranslationProgress: 50}}}
	w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/locales", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, "project-1", store.tmsProjectID)
	require.JSONEq(t, `{"sourceLocale":null,"locales":[{"locale":"fr","totalStrings":4,"translatedStrings":2,"approvedStrings":0,"needsReviewStrings":0,"translationProgress":50,"approvalProgress":0}]}`, w.Body.String())

	store.tmsErr = errProjectNotFound
	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/other-team/locales", "")
	require.Equal(t, http.StatusNotFound, w.Code)
	require.Contains(t, w.Body.String(), "project_not_found")
}

func TestStringRoutes(t *testing.T) {
	t.Run("list parses filters", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.strings = []translationString{{ID: "string-1"}}
		store.tmsTotal = 1
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/strings?search=+hello+&filePath=en.json&includeHidden=true&limit=10", "")
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, stringFilters{Search: "hello", FilePath: "en.json", IncludeHidden: true, Limit: 10}, store.stringFilters)
		require.Contains(t, w.Body.String(), `"pagination":{"offset":0,"limit":10,"total":1}`)

		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/strings?includeHidden=yes", "")
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("create requires write scope", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodPost, "/v1/projects/project-1/strings", `{"key":"a","sourceText":"A"}`)
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Contains(t, w.Body.String(), "strings:write")
	})

	t.Run("create trims input", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost, "/v1/projects/project-1/strings",
			`{"key":" home.title ","sourceText":" Welcome ","context":"  ","maxLength":40,"filePath":"locales/en.json"}`)
		require.Equal(t, http.StatusCreated, w.Code)
		require.Equal(t, "home.title", store.created.Key)
		require.Equal(t, "Welcome", store.created.SourceText)
		require.Nil(t, store.created.Context)
		require.Equal(t, 40, *store.created.MaxLength)
		require.Equal(t, "locales/en.json", *store.created.FilePath)
		require.Contains(t, w.Body.String(), `"string":{"id":"string-1"`)
	})

	t.Run("create rejects invalid bodies", func(t *testing.T) {
		for _, tt := range []struct {
			name, contentType, body string
			status                  int
		}{
			{"missing source", "application/json", `{"key":"a","sourceText":"  "}`, http.StatusBadRequest},
			{"unknown field", "application/json", `{"key":"a","sourceText":"A","extra":1}`, http.StatusBadRequest},
			{"bad max length", "application/json", `{"key":"a","sourceText":"A","maxLength":0}`, http.StatusBadRequest},
			{"trailing data", "application/json", `{"key":"a","sourceText":"A"}{}`, http.StatusBadRequest},
			{"wrong media type", "text/plain", `{"key":"a","sourceText":"A"}`, http.StatusUnsupportedMediaType},
			{"too large", "application/json", `{"key":"a","sourceText":"` + strings.Repeat("x", maxRequestBodyBytes) + `"}`, http.StatusRequestEntityTooLarge},
		} {
			t.Run(tt.name, func(t *testing.T) {
				h := newHandler(authFunc(func(context.Context, string) (principal, error) {
					return resourcePrincipal(writeScopes...), nil
				}), &fakeResourceStore{})
				r := httptest.NewRequest(http.MethodPost, "/v1/projects/project-1/strings", strings.NewReader(tt.body))
				r.Header.Set("X-Api-Key", "hl_test")
				r.Header.Set("Content-Type", tt.contentType)
				w := httptest.NewRecorder()
				h.ServeHTTP(w, r)
				require.Equal(t, tt.status, w.Code)
			})
		}
	})

	t.Run("create maps store conflicts", func(t *testing.T) {
		for err, code := range map[error]string{
			errStringKeyConflict:  "string_key_conflict",
			errProjectNotNative:   "project_not_native",
			errSourceFileNotFound: "invalid_file_path",
		} {
			store := &fakeResourceStore{}
			store.tmsErr = err
			w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost, "/v1/projects/project-1/strings", `{"key":"a","sourceText":"A"}`)
			require.Contains(t, w.Body.String(), code)
		}
	})

	t.Run("patch distinguishes null from omitted", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPatch, "/v1/projects/project-1/strings/string-1", `{"context":null,"hidden":true}`)
		require.Equal(t, http.StatusOK, w.Code)
		require.True(t, store.patch.Context.Set)
		require.Nil(t, store.patch.Context.Value)
		require.False(t, store.patch.MaxLength.Set)
		require.True(t, *store.patch.Hidden)

		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPatch, "/v1/projects/project-1/strings/string-1", `{}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("writes require write scope", func(t *testing.T) {
		store := &fakeResourceStore{}
		for _, tt := range []struct {
			method, path, body string
		}{
			{http.MethodPatch, "/v1/projects/project-1/strings/string-1", `{"hidden":true}`},
			{http.MethodDelete, "/v1/projects/project-1/strings/string-1", ""},
			{http.MethodPut, "/v1/projects/project-1/strings/string-1/translations/fr", `{"text":"x"}`},
		} {
			w := sendResource(t, resourcePrincipal(readScopes...), store, tt.method, tt.path, tt.body)
			require.Equal(t, http.StatusForbidden, w.Code, tt.method)
			require.Contains(t, w.Body.String(), "strings:write")
		}
	})

	t.Run("delete returns no content", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodDelete, "/v1/projects/project-1/strings/string-1", "")
		require.Equal(t, http.StatusNoContent, w.Code)
		require.True(t, store.deleted)
		require.Empty(t, w.Body.String())

		store.tmsErr = errStringNotFound
		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodDelete, "/v1/projects/project-1/strings/missing", "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "string_not_found")
	})

	t.Run("unsupported method", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPut, "/v1/projects/project-1/strings", "")
		require.Equal(t, http.StatusMethodNotAllowed, w.Code)
		require.Equal(t, "GET, HEAD, POST", w.Header().Get("Allow"))
	})
}

func TestTranslationRoutes(t *testing.T) {
	t.Run("put defaults to draft", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPut, "/v1/projects/project-1/strings/string-1/translations/fr-FR", `{"text":"Bonjour"}`)
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, "fr-FR", store.tmsLocale)
		require.Equal(t, translationWrite{Text: "Bonjour", Status: "draft"}, store.write)
		require.Contains(t, w.Body.String(), `"translation":`)
	})

	t.Run("put validates status and text", func(t *testing.T) {
		for _, body := range []string{`{"status":"approved"}`, `{"text":"x","status":"published"}`} {
			w := sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPut, "/v1/projects/project-1/strings/string-1/translations/fr", body)
			require.Equal(t, http.StatusBadRequest, w.Code)
		}
		w := sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPut,
			"/v1/projects/project-1/strings/string-1/translations/fr",
			`{"text":"`+strings.Repeat("x", maxTranslationTextBytes+1)+`"}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("rejects overlong locale", func(t *testing.T) {
		locale := strings.Repeat("f", maxLocaleLength+1)
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodGet,
			"/v1/projects/project-1/strings/string-1/translations/"+locale, "")
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), "invalid_locale")
	})

	t.Run("put maps store rules", func(t *testing.T) {
		for err, status := range map[error]int{
			errSegmentLocked:      http.StatusConflict,
			errLocaleNotInProject: http.StatusBadRequest,
			errTranslationTooLong: http.StatusUnprocessableEntity,
		} {
			store := &fakeResourceStore{}
			store.tmsErr = err
			w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPut, "/v1/projects/project-1/strings/string-1/translations/fr", `{"text":"x","status":"approved"}`)
			require.Equal(t, status, w.Code)
		}
	})

	t.Run("get one locale", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.translations = []translationRecord{{Locale: "de", Text: "Hallo"}, {Locale: "fr", Text: "Bonjour"}}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/strings/string-1/translations/fr", "")
		require.Equal(t, http.StatusOK, w.Code)
		require.Contains(t, w.Body.String(), "Bonjour")

		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/strings/string-1/translations/ja", "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "translation_not_found")
	})

	t.Run("list project translations", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.translations = []translationRecord{}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/translations?locale=fr&status=approved&includeHidden=true", "")
		require.Equal(t, http.StatusOK, w.Code)
		require.Equal(t, translationFilters{Locale: "fr", Status: "approved", IncludeHidden: true, Limit: 50}, store.translationQuery)
		require.Contains(t, w.Body.String(), `"translations":[]`)

		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/translations?status=done", "")
		require.Equal(t, http.StatusBadRequest, w.Code)

		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/translations?includeHidden=yes", "")
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("hides storage failures", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.tmsErr = errors.New("connection reset by peer")
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/project-1/strings/string-1/translations", "")
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
		require.NotContains(t, w.Body.String(), "connection reset")
	})
}

func TestGlossaryAndMemoryRoutes(t *testing.T) {
	store := &fakeResourceStore{}
	store.glossaries = []glossary{}
	w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/glossaries", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.JSONEq(t, `{"glossaries":[],"pagination":{"offset":0,"limit":25,"total":0}}`, w.Body.String())

	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/glossaries/g-1/terms?locale=fr&search=cart", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, glossaryTermFilters{Locale: "fr", Search: "cart", Limit: 50}, store.termFilters)

	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/translation-memories/m-1/entries?sourceLocale=en&targetLocale=fr", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.Equal(t, memoryEntryFilters{SourceLocale: "en", TargetLocale: "fr", Limit: 50}, store.entryFilters)

	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/translation-memories/m-1", "")
	require.Equal(t, http.StatusOK, w.Code)
	require.Contains(t, w.Body.String(), `"translationMemory":{"id":"m-1"`)

	store.tmsErr = errGlossaryNotFound
	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/glossaries/other-team", "")
	require.Equal(t, http.StatusNotFound, w.Code)
	require.Contains(t, w.Body.String(), "glossary_not_found")

	w = sendResource(t, resourcePrincipal("projects:read"), store, http.MethodGet, "/v1/translation-memories", "")
	require.Equal(t, http.StatusForbidden, w.Code)

	w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodPost, "/v1/glossaries", `{}`)
	require.Equal(t, http.StatusMethodNotAllowed, w.Code)
}

func TestNormalizeSourceText(t *testing.T) {
	require.Equal(t, "hello wide world", normalizeSourceText("  Hello\tＷide \n World "))
}
