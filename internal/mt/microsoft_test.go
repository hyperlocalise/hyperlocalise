package mt

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type microsoftRoundTripperFunc func(*http.Request) (*http.Response, error)

func (f microsoftRoundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newMicrosoftTestClient(t *testing.T, handler http.HandlerFunc) *MicrosoftClient {
	t.Helper()
	cfg := newTestServer(t, handler)
	cfg.SubscriptionKey = "test-key"
	cfg.Region = "westus"
	client, err := NewMicrosoftClient(cfg)
	require.NoError(t, err)
	return client
}

func microsoftSuccessBody(t *testing.T, texts []string, suffix string) []byte {
	t.Helper()
	results := make([]microsoftTranslateResult, len(texts))
	for i, text := range texts {
		results[i].Translations = []struct {
			Text string `json:"text"`
		}{{Text: text + suffix}}
	}
	body, err := json.Marshal(results)
	require.NoError(t, err)
	return body
}

func TestNewMicrosoftClientRequiresSubscriptionKey(t *testing.T) {
	client, err := NewMicrosoftClient(Config{Region: "westus"})
	require.Nil(t, client)
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestNewMicrosoftClientRequiresRegion(t *testing.T) {
	client, err := NewMicrosoftClient(Config{SubscriptionKey: "test-key"})
	require.Nil(t, client)
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestNewMicrosoftClientDefaultsBaseURL(t *testing.T) {
	client, err := NewMicrosoftClient(Config{SubscriptionKey: "test-key", Region: "westus"})
	require.NoError(t, err)
	require.Equal(t, MicrosoftGlobalBaseURL, client.baseURL)
}

func TestMicrosoftClientTranslateSuccess(t *testing.T) {
	var gotMethod, gotPath string
	var gotQuery url.Values
	var gotSubKey, gotRegion, gotContentType string
	var gotBody []microsoftTranslateItem

	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotQuery = r.URL.Query()
		gotSubKey = r.Header.Get("Ocp-Apim-Subscription-Key")
		gotRegion = r.Header.Get("Ocp-Apim-Subscription-Region")
		gotContentType = r.Header.Get("Content-Type")
		require.NoError(t, json.NewDecoder(r.Body).Decode(&gotBody))

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(microsoftSuccessBody(t, []string{"Hello", "Hi"}, "-out"))
	})

	resp, err := client.Translate(t.Context(), Request{
		SourceLocale: "en",
		TargetLocale: "fr",
		Sources:      []string{"Hello", "Hi"},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"Hello-out", "Hi-out"}, resp.Translations)

	require.Equal(t, http.MethodPost, gotMethod)
	require.Equal(t, microsoftTranslatePath, gotPath)
	require.Equal(t, "3.0", gotQuery.Get("api-version"))
	require.Equal(t, "en", gotQuery.Get("from"))
	require.Equal(t, "fr", gotQuery.Get("to"))
	require.Equal(t, "test-key", gotSubKey)
	require.Equal(t, "westus", gotRegion)
	require.Equal(t, "application/json; charset=UTF-8", gotContentType)
	require.Equal(t, []microsoftTranslateItem{{Text: "Hello"}, {Text: "Hi"}}, gotBody)
}

func TestMicrosoftClientTranslateAuthFailed(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = fmt.Fprintf(w, `{"error":{"code":%d001,"message":"Auth failed"}}`, status)
			})

			_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, ErrorCodeAuthFailed, typed.Code)
			require.Equal(t, status, typed.StatusCode)
		})
	}
}

func TestMicrosoftClientTranslateUnsupportedLanguagePair(t *testing.T) {
	for _, code := range []int{400019, 400023, 400035, 400036, 400075} {
		t.Run(strconv.Itoa(code), func(t *testing.T) {
			client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = fmt.Fprintf(w, `{"error":{"code":%d,"message":"bad language"}}`, code)
			})

			_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, ErrorCodeUnsupportedLanguagePair, typed.Code)
			require.Equal(t, http.StatusBadRequest, typed.StatusCode)
		})
	}
}

func TestMicrosoftClientTranslateBadRequestNotUnsupportedLanguage(t *testing.T) {
	// 400079 (custom system doesn't exist) describes the requested custom model,
	// not the language pair, so it must stay ErrorCodeUpstream.
	for _, code := range []int{400074, 400079} {
		t.Run(strconv.Itoa(code), func(t *testing.T) {
			client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusBadRequest)
				_, _ = fmt.Fprintf(w, `{"error":{"code":%d,"message":"bad request"}}`, code)
			})

			_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, ErrorCodeUpstream, typed.Code)
			require.Equal(t, http.StatusBadRequest, typed.StatusCode)
		})
	}
}

func TestMicrosoftClientTranslateRateLimited(t *testing.T) {
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":{"code":429000,"message":"Too many requests"}}`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeRateLimited, typed.Code)
	require.Equal(t, http.StatusTooManyRequests, typed.StatusCode)
}

func TestMicrosoftClientTranslateUpstreamUnavailable(t *testing.T) {
	for _, status := range []int{http.StatusRequestTimeout, http.StatusInternalServerError, http.StatusServiceUnavailable} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = fmt.Fprintf(w, `{"error":{"code":%d000,"message":"unavailable"}}`, status)
			})

			_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, ErrorCodeUpstreamUnavailable, typed.Code)
			require.Equal(t, status, typed.StatusCode)
		})
	}
}

func TestMicrosoftClientTranslateCustomModel(t *testing.T) {
	var gotQuery url.Values
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(microsoftSuccessBody(t, []string{"hi"}, "-out"))
	})
	client.customModel = "my-custom-model"

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	require.NoError(t, err)
	require.Equal(t, "my-custom-model", gotQuery.Get("category"))
	require.False(t, gotQuery.Has("allowFallback"), "allowFallback must not be sent: Azure's default fallback behavior is preserved")
}

func TestMicrosoftClientTranslateNoCustomModelOmitsCategory(t *testing.T) {
	var gotQuery url.Values
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.Query()
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(microsoftSuccessBody(t, []string{"hi"}, "-out"))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	require.NoError(t, err)
	require.False(t, gotQuery.Has("category"))
	require.False(t, gotQuery.Has("allowFallback"))
}

func TestMicrosoftClientTranslateContextCanceled(t *testing.T) {
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[]`))
	})

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := client.Translate(ctx, Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	require.Error(t, err)
	require.True(t, errors.Is(err, context.Canceled))
	_, ok := AsError(err)
	require.False(t, ok)
}

func TestMicrosoftClientTranslateContextDeadlineExceeded(t *testing.T) {
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[]`))
	})

	ctx, cancel := context.WithTimeout(t.Context(), time.Millisecond)
	defer cancel()

	_, err := client.Translate(ctx, Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	require.Error(t, err)
	require.True(t, errors.Is(err, context.DeadlineExceeded))
	_, ok := AsError(err)
	require.False(t, ok)
}

func TestMicrosoftClientTranslateTransportErrorDoesNotLeakCredentials(t *testing.T) {
	const subscriptionKey = "super-secret-microsoft-key-12345"
	const region = "secret-region-slug"

	client, err := NewMicrosoftClient(Config{
		SubscriptionKey: subscriptionKey,
		Region:          region,
		HTTPClient: &http.Client{
			Transport: microsoftRoundTripperFunc(func(req *http.Request) (*http.Response, error) {
				return nil, errors.New("dial tcp: connection refused, headers: " +
					req.Header.Get("Ocp-Apim-Subscription-Key") + " " + req.Header.Get("Ocp-Apim-Subscription-Region"))
			}),
		},
	})
	require.NoError(t, err)

	_, err = client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	require.Error(t, err)

	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstreamUnavailable, typed.Code)
	require.Equal(t, microsoftTranslatePath, typed.Path)
	require.NotContains(t, typed.Message, subscriptionKey)
	require.NotContains(t, typed.Message, region)
	require.NotContains(t, err.Error(), subscriptionKey)
	require.NotContains(t, err.Error(), region)
}

func TestMicrosoftClientTranslateEmptyInputMakesNoRequest(t *testing.T) {
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("unexpected HTTP call for empty input")
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: nil})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestMicrosoftClientTranslateInvalidJSONResponse(t *testing.T) {
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`not json`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstream, typed.Code)
}

func TestMicrosoftClientTranslateResultCountMismatchMapsToUpstreamError(t *testing.T) {
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(microsoftSuccessBody(t, []string{"Bonjour"}, ""))
	})

	_, err := client.Translate(t.Context(), Request{
		SourceLocale: "en",
		TargetLocale: "fr",
		Sources:      []string{"Hello", "Hi"},
	})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstream, typed.Code)
}

func TestMicrosoftClientTranslateEmptyTranslationsArrayMapsToUpstreamError(t *testing.T) {
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[{"translations":[]}]`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstream, typed.Code)
}

func TestMicrosoftClientTranslateOversizedSourceRejectedLocally(t *testing.T) {
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("unexpected HTTP call for oversized source")
	})

	oversized := strings.Repeat("a", microsoftMaxCharsPerText+1)
	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{oversized}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestMicrosoftClientTranslateChunksByElementCount(t *testing.T) {
	sources := make([]string, microsoftMaxTextsPerRequest+1)
	for i := range sources {
		sources[i] = fmt.Sprintf("s%d", i)
	}

	var calls int
	var sizesSeen []int
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body []microsoftTranslateItem
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		sizesSeen = append(sizesSeen, len(body))

		texts := make([]string, len(body))
		for i, item := range body {
			texts[i] = item.Text
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(microsoftSuccessBody(t, texts, "-out"))
	})

	resp, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: sources})
	require.NoError(t, err)
	require.Equal(t, 2, calls)
	require.Equal(t, []int{microsoftMaxTextsPerRequest, 1}, sizesSeen)

	want := make([]string, len(sources))
	for i, s := range sources {
		want[i] = s + "-out"
	}
	require.Equal(t, want, resp.Translations)
}

func TestMicrosoftClientTranslateChunksByCharacterBudget(t *testing.T) {
	big := strings.Repeat("a", 20000)
	sources := []string{big, big, big}

	var calls int
	var charsSeen []int
	client := newMicrosoftTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body []microsoftTranslateItem
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		total := 0
		texts := make([]string, len(body))
		for i, item := range body {
			total += microsoftCharCount(item.Text)
			texts[i] = item.Text
		}
		charsSeen = append(charsSeen, total)
		require.LessOrEqual(t, total, microsoftMaxCharsPerRequest)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write(microsoftSuccessBody(t, texts, "-out"))
	})

	resp, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: sources})
	require.NoError(t, err)
	require.Equal(t, 2, calls)
	require.Equal(t, []int{40000, 20000}, charsSeen)

	want := make([]string, len(sources))
	for i, s := range sources {
		want[i] = s + "-out"
	}
	require.Equal(t, want, resp.Translations)
}

func TestMicrosoftLanguageCode(t *testing.T) {
	cases := []struct {
		locale string
		want   string
	}{
		{"en-US", "en"},
		{"de-DE", "de"},
		{"es-MX", "es"},
		{"pt-BR", "pt"},
		{"pt-PT", "pt-pt"},
		{"fr-CA", "fr-ca"},
		{"fr-FR", "fr"},
		{"zh-CN", "zh-Hans"},
		{"zh-TW", "zh-Hant"},
		{"zh-Hant", "zh-Hant"},
		{"zh-Hans", "zh-Hans"},
		{"sr", "sr-Cyrl"},
		{"sr-Latn", "sr-Latn"},
		{"nb-NO", "nb"},
		{"no", "nb"},
		{"tl", "fil"},
		{"mn", "mn-Cyrl"},
		{"iu", "iu"},
		{"iu-Latn", "iu-Latn"},
		{"tlh-Latn", "tlh-Latn"},
		{"tlh-Piqd", "tlh-Piqd"},
		{"not a locale", "not a locale"},
	}
	for _, tc := range cases {
		t.Run(tc.locale, func(t *testing.T) {
			require.Equal(t, tc.want, microsoftLanguageCode(tc.locale))
		})
	}
}

func TestMicrosoftCharCount(t *testing.T) {
	cases := []struct {
		name string
		s    string
		want int
	}{
		{"empty", "", 0},
		{"ascii", "hello", 5},
		{"bmp multibyte", "héllo", 5},
		{"supplementary plane", "😀", 2},
		{"mixed", "a😀b", 4},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			require.Equal(t, tc.want, microsoftCharCount(tc.s))
		})
	}
}
