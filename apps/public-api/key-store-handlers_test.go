package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type fakeKeyStore struct {
	keyErr         error
	bulk           stringBulkUpdate
	selection      stringSelector
	reviewLocales  []string
	reviewChange   reviewChange
	jobLocale      string
	keyStoreCalled string
}

func (s *fakeKeyStore) bulkUpdateStrings(_ context.Context, _ principal, _ string, input stringBulkUpdate) (int, error) {
	s.bulk, s.keyStoreCalled = input, "bulk"
	return 2, s.keyErr
}

func (s *fakeKeyStore) reviewTranslations(_ context.Context, _ principal, _ string, sel stringSelector, locales []string, change reviewChange) (int, error) {
	s.selection, s.reviewLocales, s.reviewChange, s.keyStoreCalled = sel, locales, change, "review"
	return 3, s.keyErr
}

func (s *fakeKeyStore) listJobStrings(context.Context, principal, string, int, int) ([]translationString, int, error) {
	return []translationString{}, 0, s.keyErr
}

func (s *fakeKeyStore) addJobStrings(_ context.Context, _ principal, _ string, sel stringSelector) (int, error) {
	s.selection, s.keyStoreCalled = sel, "add"
	return 1, s.keyErr
}

func (s *fakeKeyStore) removeJobStrings(_ context.Context, _ principal, _ string, sel stringSelector) (int, error) {
	s.selection, s.keyStoreCalled = sel, "remove"
	return 1, s.keyErr
}

func (s *fakeKeyStore) jobLocales(context.Context, principal, string) ([]jobLocaleProgress, error) {
	return []jobLocaleProgress{{Locale: "fr"}}, s.keyErr
}

func (s *fakeKeyStore) addJobLocale(_ context.Context, _ principal, _, locale string) ([]jobLocaleProgress, error) {
	s.jobLocale = locale
	return []jobLocaleProgress{{Locale: locale}}, s.keyErr
}

func (s *fakeKeyStore) removeJobLocale(_ context.Context, _ principal, _, locale string) ([]jobLocaleProgress, error) {
	s.jobLocale = locale
	return []jobLocaleProgress{}, s.keyErr
}

const validStringID = "9f1f3d5e-4a61-4c4e-9f43-0d6a1c3b2a10"

// keyDetailsPrincipal is a key with strings:write held by someone in the given role.
func keyDetailsPrincipal(role string) principal {
	p := resourcePrincipal(writeScopes...)
	p.Role = role
	return p
}

func TestStringsBulkUpdateRoute(t *testing.T) {
	target := "/v1/projects/project-1/strings/bulk-update"

	t.Run("adds tags and sets a link", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, keyDetailsPrincipal("developer"), store, http.MethodPost, target,
			`{"keys":["home.title"],"addTags":["checkout"],"designUrl":" https://figma.com/file/x "}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.JSONEq(t, `{"updated":2}`, w.Body.String())
		require.Equal(t, []string{"home.title"}, store.bulk.Select.Keys)
		require.Equal(t, "https://figma.com/file/x", *store.bulk.DesignURL.Value)
	})

	t.Run("clears a link", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, keyDetailsPrincipal("developer"), store, http.MethodPost, target, `{"tags":["old"],"designUrl":null}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.True(t, store.bulk.DesignURL.Set)
		require.Nil(t, store.bulk.DesignURL.Value)
	})

	t.Run("rejects bad bodies", func(t *testing.T) {
		for _, body := range []string{
			`{"keys":["a"]}`,
			`{"addTags":["x"]}`,
			`{"keys":["a"],"stringIds":["` + validStringID + `"],"addTags":["x"]}`,
			`{"stringIds":["nope"],"addTags":["x"]}`,
			`{"keys":["a"],"addTags":["has space"]}`,
			`{"keys":["a"],"designUrl":"javascript:alert(1)"}`,
			`{"keys":["a"],"designUrl":""}`,
		} {
			w := sendResource(t, keyDetailsPrincipal("developer"), &fakeResourceStore{}, http.MethodPost, target, body)
			require.Equal(t, http.StatusBadRequest, w.Code, body)
		}
	})

	t.Run("needs strings:write and maps no match", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodPost, target, `{"keys":["a"],"addTags":["x"]}`)
		require.Equal(t, http.StatusForbidden, w.Code)
		store := &fakeResourceStore{}
		store.keyErr = errNoStringsMatched
		w = sendResource(t, keyDetailsPrincipal("developer"), store, http.MethodPost, target, `{"keys":["a"],"addTags":["x"]}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), "no_strings_matched")
	})

	t.Run("leaves tags and links to the roles that manage strings", func(t *testing.T) {
		for _, role := range []string{"translator", "reviewer"} {
			w := sendResource(t, keyDetailsPrincipal(role), &fakeResourceStore{}, http.MethodPost, target, `{"keys":["a"],"addTags":["x"]}`)
			require.Equal(t, http.StatusForbidden, w.Code, role)
		}
	})

	t.Run("accepts a selection larger than the default JSON body", func(t *testing.T) {
		keys := make([]string, maxSelectedStrings)
		for i := range keys {
			keys[i] = fmt.Sprintf("%s-%d", strings.Repeat("k", 280), i)
		}
		payload, err := json.Marshal(map[string]any{"keys": keys, "addTags": []string{"x"}})
		require.NoError(t, err)
		require.Greater(t, len(payload), maxRequestBodyBytes)
		store := &fakeResourceStore{}
		w := sendResource(t, keyDetailsPrincipal("developer"), store, http.MethodPost, target, string(payload))
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Len(t, store.bulk.Select.Keys, maxSelectedStrings)
	})
}

func TestTranslationReviewRoutes(t *testing.T) {
	for path, change := range map[string]reviewChange{"approve": reviewApprove, "send-to-review": reviewSendToReview} {
		target := "/v1/projects/project-1/translations/" + path
		t.Run(path, func(t *testing.T) {
			store := &fakeResourceStore{}
			w := sendResource(t, resourcePrincipal(approveScopes...), store, http.MethodPost, target, `{"tags":["release-7"],"locales":["fr"]}`)
			require.Equal(t, http.StatusOK, w.Code, w.Body.String())
			require.JSONEq(t, `{"updated":3}`, w.Body.String())
			require.Equal(t, change, store.reviewChange)
			require.Equal(t, []string{"release-7"}, store.selection.Tags)
			require.Equal(t, []string{"fr"}, store.reviewLocales)

			// As in the app: only reviewing roles approve; everyone who edits may send back.
			for _, role := range []string{"developer", "translator"} {
				scopes := effectivePermissions([]string{"files:read", "files:write"}, role)
				w := sendResource(t, resourcePrincipal(scopes...), &fakeResourceStore{}, http.MethodPost, target, `{"keys":["a"]}`)
				want := http.StatusOK
				if change == reviewApprove {
					want = http.StatusForbidden
				}
				require.Equal(t, want, w.Code, role)
			}
			w = sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodPost, target, `{"keys":["a"]}`)
			require.Equal(t, http.StatusForbidden, w.Code, "a read-only key")
			w = sendResource(t, resourcePrincipal(approveScopes...), &fakeResourceStore{}, http.MethodPost, target, `{}`)
			require.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

var keyJobScopes = effectivePermissions([]string{"jobs:read", "jobs:write"}, "translator")

func TestKeyJobRoutes(t *testing.T) {
	t.Run("adds and removes strings", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(keyJobScopes...), store, http.MethodPost, "/v1/jobs/job-1/strings", `{"tags":["release-7"]}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "add", store.keyStoreCalled)
		w = sendResource(t, resourcePrincipal(keyJobScopes...), store, http.MethodDelete, "/v1/jobs/job-1/strings", `{"keys":["a"]}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "remove", store.keyStoreCalled)
		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodPost, "/v1/jobs/job-1/strings", `{"keys":["a"]}`)
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("lists strings and locales", func(t *testing.T) {
		withStrings := effectivePermissions([]string{"jobs:read", "files:read"}, "translator")
		for _, target := range []string{"/v1/jobs/job-1/strings", "/v1/jobs/job-1/locales"} {
			w := sendResource(t, resourcePrincipal(withStrings...), &fakeResourceStore{}, http.MethodGet, target, "")
			require.Equal(t, http.StatusOK, w.Code, target)
		}
		w := sendResource(t, resourcePrincipal(keyJobScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/jobs/job-1/strings", "")
		require.Equal(t, http.StatusForbidden, w.Code, "a jobs-only key reads no string text")
		w = sendResource(t, resourcePrincipal(keyJobScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/jobs/job-1/locales", "")
		require.Equal(t, http.StatusOK, w.Code)
	})

	t.Run("adds and removes a locale", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(keyJobScopes...), store, http.MethodPost, "/v1/jobs/job-1/locales", `{"locale":" de "}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "de", store.jobLocale)
		w = sendResource(t, resourcePrincipal(keyJobScopes...), store, http.MethodDelete, "/v1/jobs/job-1/locales/fr", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "fr", store.jobLocale)
	})

	t.Run("maps key job errors", func(t *testing.T) {
		for err, status := range map[error]int{
			errNotKeyJob:          http.StatusConflict,
			errKeyJobClosed:       http.StatusConflict,
			errKeyJobNeedsStrings: http.StatusConflict,
			errJobNotFound:        http.StatusNotFound,
			errLocaleNotInProject: http.StatusBadRequest,
		} {
			store := &fakeResourceStore{}
			store.keyErr = err
			w := sendResource(t, resourcePrincipal(keyJobScopes...), store, http.MethodPost, "/v1/jobs/job-1/strings", `{"keys":["a"]}`)
			require.Equal(t, status, w.Code, err.Error())
		}
	})
}
