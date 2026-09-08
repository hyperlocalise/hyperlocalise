package mt

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type amazonRoundTripperFunc func(*http.Request) (*http.Response, error)

func (f amazonRoundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func newAmazonTestClient(t *testing.T, handler http.HandlerFunc) *AmazonClient {
	t.Helper()
	cfg := newTestServer(t, handler)
	cfg.AccessKeyID = "AKIATEST"
	cfg.SecretAccessKey = "test-secret"
	cfg.Region = "us-east-1"
	client, err := NewAmazonClient(cfg)
	require.NoError(t, err)
	return client
}

func decodeAmazonRequest(t *testing.T, r *http.Request) amazonTranslateRequest {
	t.Helper()
	var body amazonTranslateRequest
	require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
	return body
}

func TestNewAmazonClientRequiresAccessKeyID(t *testing.T) {
	client, err := NewAmazonClient(Config{SecretAccessKey: "secret", Region: "us-east-1"})
	require.Nil(t, client)
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestNewAmazonClientRequiresSecretAccessKey(t *testing.T) {
	client, err := NewAmazonClient(Config{AccessKeyID: "AKIATEST", Region: "us-east-1"})
	require.Nil(t, client)
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestNewAmazonClientRequiresRegion(t *testing.T) {
	client, err := NewAmazonClient(Config{AccessKeyID: "AKIATEST", SecretAccessKey: "secret"})
	require.Nil(t, client)
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestNewAmazonClientDoesNotDefaultRegion(t *testing.T) {
	// Region must never be silently defaulted, unlike BaseURL.
	client, err := NewAmazonClient(Config{AccessKeyID: "AKIATEST", SecretAccessKey: "secret", Region: "  "})
	require.Nil(t, client)
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

var amazonAuthHeaderPattern = regexp.MustCompile(
	`^AWS4-HMAC-SHA256 Credential=AKIATEST/\d{8}/us-east-1/translate/aws4_request, ` +
		`SignedHeaders=([a-z0-9;-]+), Signature=[0-9a-f]{64}$`)

func TestAmazonClientTranslateSuccess(t *testing.T) {
	var gotMethod, gotPath, gotContentType, gotTarget, gotAuth, gotDate string
	var gotBody amazonTranslateRequest

	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotMethod = r.Method
		gotPath = r.URL.Path
		gotContentType = r.Header.Get("Content-Type")
		gotTarget = r.Header.Get("X-Amz-Target")
		gotAuth = r.Header.Get("Authorization")
		gotDate = r.Header.Get("X-Amz-Date")
		gotBody = decodeAmazonRequest(t, r)

		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"TranslatedText":"Bonjour"}`))
	})

	resp, err := client.Translate(t.Context(), Request{
		SourceLocale: "en",
		TargetLocale: "fr",
		Sources:      []string{"Hello"},
	})
	require.NoError(t, err)
	require.Equal(t, []string{"Bonjour"}, resp.Translations)

	require.Equal(t, http.MethodPost, gotMethod)
	require.Equal(t, "/", gotPath)
	require.Equal(t, "application/x-amz-json-1.1", gotContentType)
	require.Equal(t, amazonTargetHeader, gotTarget)
	require.Regexp(t, `^\d{8}T\d{6}Z$`, gotDate)
	require.Regexp(t, amazonAuthHeaderPattern, gotAuth)
	require.Equal(t, "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-target",
		amazonAuthHeaderPattern.FindStringSubmatch(gotAuth)[1])

	require.Equal(t, amazonTranslateRequest{Text: "Hello", SourceLanguageCode: "en", TargetLanguageCode: "fr"}, gotBody)
}

func TestAmazonClientTranslateSessionTokenSentAndSigned(t *testing.T) {
	const token = "test-session-token"

	var gotToken, gotAuth string
	cfg := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		gotToken = r.Header.Get("X-Amz-Security-Token")
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"TranslatedText":"Bonjour"}`))
	})
	cfg.AccessKeyID = "AKIATEST"
	cfg.SecretAccessKey = "test-secret"
	cfg.Region = "us-east-1"
	cfg.SessionToken = token
	client, err := NewAmazonClient(cfg)
	require.NoError(t, err)

	_, err = client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"Hello"}})
	require.NoError(t, err)

	require.Equal(t, token, gotToken)
	signedHeaders := amazonAuthHeaderPattern.FindStringSubmatch(gotAuth)
	require.NotNil(t, signedHeaders)
	require.Equal(t, "content-type;host;x-amz-content-sha256;x-amz-date;x-amz-security-token;x-amz-target", signedHeaders[1])
}

func TestAmazonClientTranslateOrderPreservedAcrossMultipleCalls(t *testing.T) {
	sources := []string{"one", "two", "three"}

	var calls int
	var seen []string
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		body := decodeAmazonRequest(t, r)
		seen = append(seen, body.Text)

		w.WriteHeader(http.StatusOK)
		_, _ = fmt.Fprintf(w, `{"TranslatedText":%q}`, body.Text+"-out")
	})

	resp, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: sources})
	require.NoError(t, err)

	require.Equal(t, 3, calls)
	require.Equal(t, sources, seen)
	require.Equal(t, []string{"one-out", "two-out", "three-out"}, resp.Translations)
}

func TestAmazonClientTranslateSourceExceedsByteLimitMakesNoRequest(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("unexpected HTTP call for an over-limit source")
	})

	oversized := strings.Repeat("a", amazonMaxTextBytes+1)
	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{oversized}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestAmazonClientTranslateEmptySourceMakesNoRequest(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("unexpected HTTP call for an empty source")
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi", ""}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestAmazonClientTranslateEmptyInputMakesNoRequest(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Fatal("unexpected HTTP call for empty input")
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: nil})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeValidation, typed.Code)
}

func TestAmazonClientTranslateAuthFailed(t *testing.T) {
	for _, status := range []int{http.StatusUnauthorized, http.StatusForbidden} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"__type":"UnrecognizedClientException","message":"The security token included in the request is invalid."}`))
			})

			_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, ErrorCodeAuthFailed, typed.Code)
			require.Equal(t, status, typed.StatusCode)
		})
	}
}

func TestAmazonClientTranslateAuthFailedAt400(t *testing.T) {
	// Some SigV4 failures are documented at HTTP 400 rather than 401/403.
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"__type":"IncompleteSignatureException","message":"bad signature"}`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeAuthFailed, typed.Code)
}

func TestAmazonClientTranslateUnsupportedLanguagePair(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"__type":"UnsupportedLanguagePairException","Message":"Amazon Translate cannot translate from en to xx."}`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUnsupportedLanguagePair, typed.Code)
	require.Equal(t, http.StatusBadRequest, typed.StatusCode)
}

func TestAmazonClientTranslateUnsupportedLanguagePairViaHeader(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Amzn-Errortype", "com.amazonaws.translate#UnsupportedLanguagePairException:400")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{}`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUnsupportedLanguagePair, typed.Code)
}

func TestAmazonClientTranslateBadRequestNotUnsupportedLanguage(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"__type":"InvalidRequestException","message":"bad request"}`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstream, typed.Code)
}

func TestAmazonClientTranslateRateLimited(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"__type":"TooManyRequestsException","message":"too many requests"}`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeRateLimited, typed.Code)
	require.Equal(t, http.StatusBadRequest, typed.StatusCode)
}

func TestAmazonClientTranslateTextSizeLimitExceededMapsToUpstreamError(t *testing.T) {
	// Size is validated locally, so an upstream size rejection indicates API drift.
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"__type":"TextSizeLimitExceededException","message":"text too long"}`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstream, typed.Code)
}

func TestAmazonClientTranslateUpstreamUnavailable(t *testing.T) {
	for _, status := range []int{http.StatusInternalServerError, http.StatusServiceUnavailable} {
		t.Run(strconv.Itoa(status), func(t *testing.T) {
			client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				_, _ = w.Write([]byte(`{"__type":"InternalServerException","message":"internal error"}`))
			})

			_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
			typed, ok := AsError(err)
			require.True(t, ok)
			require.Equal(t, ErrorCodeUpstreamUnavailable, typed.Code)
		})
	}
}

func TestAmazonClientTranslateRawErrorBodyNotEchoed(t *testing.T) {
	const rawBody = "Internal Server Error: stack trace and sensitive upstream details"

	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(rawBody))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstreamUnavailable, typed.Code)
	require.Equal(t, "Amazon Translate error (500)", typed.Message)
	require.NotContains(t, typed.Message, rawBody)
	require.NotContains(t, err.Error(), rawBody)
}

func TestAmazonClientTranslateInvalidJSONResponse(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`not json`))
	})

	_, err := client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstream, typed.Code)
}

func TestAmazonClientTranslateContextCanceled(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"TranslatedText":"Bonjour"}`))
	})

	ctx, cancel := context.WithCancel(t.Context())
	cancel()

	_, err := client.Translate(ctx, Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	require.Error(t, err)
	require.True(t, errors.Is(err, context.Canceled))
	_, ok := AsError(err)
	require.False(t, ok)
}

func TestAmazonClientTranslateContextDeadlineExceeded(t *testing.T) {
	client := newAmazonTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"TranslatedText":"Bonjour"}`))
	})

	ctx, cancel := context.WithTimeout(t.Context(), time.Millisecond)
	defer cancel()

	_, err := client.Translate(ctx, Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	require.Error(t, err)
	require.True(t, errors.Is(err, context.DeadlineExceeded))
	_, ok := AsError(err)
	require.False(t, ok)
}

func TestAmazonClientTranslateContextCanceledBetweenCalls(t *testing.T) {
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()

	var calls int
	cfg := newTestServer(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		require.Equal(t, 1, calls, "no request should be sent for a source after cancellation")

		body := decodeAmazonRequest(t, r)
		respBody := fmt.Sprintf(`{"TranslatedText":%q}`, body.Text+"-out")
		w.Header().Set("Content-Length", strconv.Itoa(len(respBody)))
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(respBody))
	})
	cfg.AccessKeyID = "AKIATEST"
	cfg.SecretAccessKey = "test-secret"
	cfg.Region = "us-east-1"

	// Cancel after the first response is received on the client. Canceling from
	// the server handler races: the client can start the next source before the
	// handler runs cancel().
	baseTransport := cfg.HTTPClient.Transport
	if baseTransport == nil {
		baseTransport = http.DefaultTransport
	}
	cfg.HTTPClient = &http.Client{
		Transport: amazonRoundTripperFunc(func(req *http.Request) (*http.Response, error) {
			resp, err := baseTransport.RoundTrip(req)
			cancel()
			return resp, err
		}),
	}

	client, err := NewAmazonClient(cfg)
	require.NoError(t, err)

	_, err = client.Translate(ctx, Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"one", "two"}})
	require.Error(t, err)
	require.True(t, errors.Is(err, context.Canceled))
	_, ok := AsError(err)
	require.False(t, ok)
	require.Equal(t, 1, calls)
}

func TestAmazonClientTranslateTransportErrorDoesNotLeakCredentials(t *testing.T) {
	const secret = "super-secret-access-key-12345"
	const token = "super-secret-session-token-67890"

	client, err := NewAmazonClient(Config{
		AccessKeyID:     "AKIATEST",
		SecretAccessKey: secret,
		SessionToken:    token,
		Region:          "us-east-1",
		HTTPClient: &http.Client{
			Transport: amazonRoundTripperFunc(func(req *http.Request) (*http.Response, error) {
				return nil, errors.New("dial tcp: connection refused, auth: " + req.Header.Get("Authorization") + " token: " + req.Header.Get("X-Amz-Security-Token"))
			}),
		},
	})
	require.NoError(t, err)

	_, err = client.Translate(t.Context(), Request{SourceLocale: "en", TargetLocale: "fr", Sources: []string{"hi"}})
	require.Error(t, err)

	typed, ok := AsError(err)
	require.True(t, ok)
	require.Equal(t, ErrorCodeUpstreamUnavailable, typed.Code)
	require.Equal(t, amazonTranslateAction, typed.Path)
	require.NotContains(t, typed.Message, secret)
	require.NotContains(t, typed.Message, token)
	require.NotContains(t, err.Error(), secret)
	require.NotContains(t, err.Error(), token)
}

func TestAmazonLanguageCode(t *testing.T) {
	cases := []struct {
		locale string
		want   string
	}{
		{"en", "en"},
		{"de", "de"},
		{"ja", "ja"},
		{"zh", "zh"},
		{"zh-Hans", "zh"},
		{"zh-CN", "zh"},
		{"zh-Hant", "zh-TW"},
		{"zh-TW", "zh-TW"},
		{"zh-HK", "zh-TW"},
		{"fr", "fr"},
		{"fr-CA", "fr-CA"},
		{"fr-FR", "fr"},
		{"es", "es"},
		{"es-MX", "es-MX"},
		{"es-ES", "es"},
		{"pt", "pt"},
		{"pt-BR", "pt"},
		{"pt-PT", "pt-PT"},
		{"fa", "fa"},
		{"fa-AF", "fa-AF"},
		{"fa-IR", "fa"},
	}
	for _, tc := range cases {
		t.Run(tc.locale, func(t *testing.T) {
			require.Equal(t, tc.want, amazonLanguageCode(tc.locale))
		})
	}
}
