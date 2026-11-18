package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/authz"
	"github.com/stretchr/testify/require"
)

func translationsHandler(t *testing.T, p principal, web http.HandlerFunc) http.Handler {
	t.Helper()
	var renderer *translationsRenderer
	if web != nil {
		server := httptest.NewServer(web)
		t.Cleanup(server.Close)
		renderer = &translationsRenderer{baseURL: server.URL, http: server.Client()}
	}
	return newHandlerWithOutbound(authFunc(func(context.Context, string) (principal, error) { return p, nil }),
		&fakeResourceStore{}, nil, withTranslationsRenderer(renderer))
}

func getWithKey(h http.Handler, target string) *httptest.ResponseRecorder {
	r := httptest.NewRequest(http.MethodGet, target, nil)
	r.Header.Set("X-Api-Key", "hl_test")
	return serve(h, r)
}

func TestTranslationsDownloadRoute(t *testing.T) {
	readScopes := authz.EffectivePermissions([]string{"files:read"}, "member")

	t.Run("forwards to the platform with the caller's token and streams the file", func(t *testing.T) {
		h := translationsHandler(t, resourcePrincipal(readScopes...), func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, "/api/v1/projects/proj%2F1/translations/download", r.URL.EscapedPath())
			require.Equal(t, "locales/en.json", r.URL.Query().Get("sourcePath"))
			require.Equal(t, "fr", r.URL.Query().Get("locale"))
			require.Equal(t, "hl_test", r.Header.Get("X-Api-Key"))
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Content-Disposition", "attachment; filename*=UTF-8''en-fr.json")
			w.Header().Set("X-Hyperlocalise-Overflow-Keys", "a,b")
			w.Header().Set("Set-Cookie", "session=leak")
			_, _ = w.Write([]byte(`{"title":"Bonjour"}`))
		})
		w := getWithKey(h, "/v1/projects/proj%2F1/translations/download?sourcePath=+locales/en.json+&locale=fr")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, `{"title":"Bonjour"}`, w.Body.String())
		require.Equal(t, "application/json; charset=utf-8", w.Header().Get("Content-Type"))
		require.Equal(t, "attachment; filename*=UTF-8''en-fr.json", w.Header().Get("Content-Disposition"))
		require.Equal(t, "a,b", w.Header().Get("X-Hyperlocalise-Overflow-Keys"))
		require.Equal(t, "no-store", w.Header().Get("Cache-Control"))
		require.Equal(t, "nosniff", w.Header().Get("X-Content-Type-Options"))
		require.Empty(t, w.Header().Get("Set-Cookie"))
	})

	t.Run("passes the platform's JSON errors through", func(t *testing.T) {
		h := translationsHandler(t, resourcePrincipal(readScopes...), func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnprocessableEntity)
			_, _ = w.Write([]byte(`{"error":"pdf_script_unsupported","message":"No font"}`))
		})
		w := getWithKey(h, "/v1/projects/p/translations/download?sourcePath=a.pdf&locale=th")
		require.Equal(t, http.StatusUnprocessableEntity, w.Code)
		require.JSONEq(t, `{"error":"pdf_script_unsupported","message":"No font"}`, w.Body.String())
	})

	t.Run("hides a gateway failure page", func(t *testing.T) {
		h := translationsHandler(t, resourcePrincipal(readScopes...), func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(http.StatusBadGateway)
			_, _ = w.Write([]byte("<html>bad gateway</html>"))
		})
		w := getWithKey(h, "/v1/projects/p/translations/download?sourcePath=a.json&locale=fr")
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
		require.Contains(t, w.Body.String(), `"error":"translations_download_unavailable"`)
	})

	t.Run("does not follow redirects with the token", func(t *testing.T) {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, "https://elsewhere.example.com/steal", http.StatusFound)
		}))
		t.Cleanup(server.Close)
		client := &http.Client{CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
		h := newHandlerWithOutbound(authFunc(func(context.Context, string) (principal, error) {
			return resourcePrincipal(readScopes...), nil
		}), &fakeResourceStore{}, nil, withTranslationsRenderer(&translationsRenderer{baseURL: server.URL, http: client}))
		w := getWithKey(h, "/v1/projects/p/translations/download?sourcePath=a.json&locale=fr")
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
		require.Empty(t, w.Header().Get("Location"))
	})

	t.Run("checks the query and the scope before forwarding", func(t *testing.T) {
		called := false
		web := func(http.ResponseWriter, *http.Request) { called = true }
		h := translationsHandler(t, resourcePrincipal(readScopes...), web)
		for _, target := range []string{
			"/v1/projects/p/translations/download?locale=fr",
			"/v1/projects/p/translations/download?sourcePath=a.json",
		} {
			w := getWithKey(h, target)
			require.Equal(t, http.StatusBadRequest, w.Code, target)
			require.Contains(t, w.Body.String(), `"error":"invalid_translation_payload"`)
		}
		w := getWithKey(translationsHandler(t, resourcePrincipal(jobReadScopes...), web),
			"/v1/projects/p/translations/download?sourcePath=a.json&locale=fr")
		require.Equal(t, http.StatusForbidden, w.Code)
		require.False(t, called)
	})

	t.Run("unavailable without a web app URL or when it is down", func(t *testing.T) {
		w := getWithKey(translationsHandler(t, resourcePrincipal(readScopes...), nil),
			"/v1/projects/p/translations/download?sourcePath=a.json&locale=fr")
		require.Equal(t, http.StatusServiceUnavailable, w.Code)

		down := httptest.NewServer(http.NotFoundHandler())
		down.Close()
		h := newHandlerWithOutbound(authFunc(func(context.Context, string) (principal, error) {
			return resourcePrincipal(readScopes...), nil
		}), &fakeResourceStore{}, nil, withTranslationsRenderer(&translationsRenderer{baseURL: down.URL, http: http.DefaultClient}))
		w = getWithKey(h, "/v1/projects/p/translations/download?sourcePath=a.json&locale=fr")
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
		require.Contains(t, w.Body.String(), `"error":"translations_download_unavailable"`)
	})
}

func TestTranslationsRendererFromEnv(t *testing.T) {
	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "")
	t.Setenv("HYPERLOCALISE_PUBLIC_APP_URL", "")
	require.Nil(t, newTranslationsRendererFromEnv())

	t.Setenv("HYPERLOCALISE_WEB_INTERNAL_URL", "http://web.internal:3000/")
	renderer := newTranslationsRendererFromEnv()
	require.NotNil(t, renderer)
	require.Equal(t, "http://web.internal:3000", renderer.baseURL)

	client, ok := renderer.http.(*http.Client)
	require.True(t, ok)
	require.ErrorIs(t, client.CheckRedirect(nil, nil), http.ErrUseLastResponse)
}
