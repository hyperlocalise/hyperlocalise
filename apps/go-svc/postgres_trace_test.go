package main

import (
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/hyperlocalise/hyperlocalise/internal/postgres"
	"github.com/stretchr/testify/require"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/trace"
)

func TestEditorCatQuerySpansAreChildrenOfHTTPSpan(t *testing.T) {
	testenv.Require(t)

	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	sourceFileID := mustEditorCatSourceFile(t, scope, "a.json")
	mustEditorCatKey(t, scope, sourceFileID, "hello", "Hello")

	recorder := withTestSpanRecorder(t)
	pool, err := postgres.NewPool(t.Context(), os.Getenv(testenv.EnvDatabaseURL))
	require.NoError(t, err)
	t.Cleanup(pool.Close)

	api := &editorCatAPI{
		pool:       tracedPool{inner: pool},
		membership: scope.Membership("admin"),
	}
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: scope.WorkOSUserID}})
	handler := tracingMiddleware(mux)

	req := httptest.NewRequest(
		http.MethodGet,
		scope.OrgPath("/projects/"+scope.ProjectID+"/files/detail/cat?sourcePath=a.json&targetLocale=fr"),
		nil,
	)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	recorderResponse := httptest.NewRecorder()
	handler.ServeHTTP(recorderResponse, req)

	require.Equal(t, http.StatusOK, recorderResponse.Code, recorderResponse.Body.String())
	spans := recorder.Ended()
	var httpSpan sdktrace.ReadOnlySpan
	var querySpans []sdktrace.ReadOnlySpan
	queryLabels := make(map[string]struct{})
	for _, span := range spans {
		if strings.HasPrefix(span.Name(), "GET /v1/orgs/{organizationSlug}/projects/{projectId}/files/detail/cat") {
			httpSpan = span
		} else if span.SpanKind() == trace.SpanKindClient &&
			requireSpanStringAttrIfPresent(span, "db.system.name") == "postgresql" &&
			requireSpanStringAttrIfPresent(span, "db.query.summary") != "" {
			querySpans = append(querySpans, span)
			if queryText, ok := spanStringAttr(span, "db.query.text"); ok {
				queryLabels[queryText] = struct{}{}
			} else if summary, ok := spanStringAttr(span, "db.query.summary"); ok {
				queryLabels[summary] = struct{}{}
			}
		}
	}
	require.NotNil(t, httpSpan, "spans=%v", spans)
	require.NotEmpty(t, querySpans, "spans=%v", spans)
	require.GreaterOrEqual(t, len(queryLabels), 2, "query spans should be distinguishable; spans=%v", querySpans)
	spansByID := make(map[trace.SpanID]sdktrace.ReadOnlySpan, len(spans))
	for _, span := range spans {
		spansByID[span.SpanContext().SpanID()] = span
	}

	for _, querySpan := range querySpans {
		require.Equal(t, httpSpan.SpanContext().TraceID(), querySpan.SpanContext().TraceID())
		parentID := querySpan.Parent().SpanID()
		descendsFromHTTP := false
		seen := make(map[trace.SpanID]struct{})
		for parentID.IsValid() {
			if parentID == httpSpan.SpanContext().SpanID() {
				descendsFromHTTP = true
				break
			}
			if _, ok := seen[parentID]; ok {
				break
			}
			seen[parentID] = struct{}{}
			parent, ok := spansByID[parentID]
			if !ok {
				break
			}
			parentID = parent.Parent().SpanID()
		}
		require.True(t, descendsFromHTTP, "query span %q must descend from HTTP span; spans=%v", querySpan.Name(), spans)
		require.NotEqual(t, "postgres.query", querySpan.Name())
		for _, key := range []string{
			"db.statement",
			"pgx.query.parameters",
			"server.address",
			"server.port",
			"db.user",
			"db.namespace",
			"user.name",
		} {
			_, ok := spanStringAttr(querySpan, key)
			require.False(t, ok, "query span %q must not contain %q", querySpan.Name(), key)
		}
		if queryText, ok := spanStringAttr(querySpan, "db.query.text"); ok {
			require.NotContains(t, queryText, "customer")
			require.NotContains(t, queryText, "secret")
		} else {
			require.NotEmpty(t, requireSpanStringAttr(t, querySpan, "db.query.summary"))
		}
	}
}

func requireSpanStringAttrIfPresent(span sdktrace.ReadOnlySpan, key string) string {
	value, _ := spanStringAttr(span, key)
	return value
}
