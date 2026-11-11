package main

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/tmscatalog"
	"github.com/stretchr/testify/require"
)

func TestParseLiveProjectID(t *testing.T) {
	t.Parallel()
	got, ok := parseLiveProjectID("ext:crowdin:123")
	if !ok || got.providerKind != "crowdin" || got.externalProjectID != "123" {
		t.Fatalf("parseLiveProjectID = %+v, %v", got, ok)
	}
	if got, ok := parseLiveProjectID("ext:smartling:a:b"); !ok || got.externalProjectID != "a:b" {
		t.Fatalf("ids may hold colons: %+v, %v", got, ok)
	}
	for _, raw := range []string{"proj_1", "ext:unknown:1", "ext:crowdin:", "ext:crowdin"} {
		if _, ok := parseLiveProjectID(raw); ok {
			t.Errorf("parseLiveProjectID(%q) ok, want not live", raw)
		}
	}
}

func TestLiveTMSRequest(t *testing.T) {
	t.Parallel()
	tms := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/tms/jobs", nil)
	require.True(t, liveTMSRequest(tms))

	native := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/projects/proj_1/jobs", nil)
	native.SetPathValue("projectId", "proj_1")
	require.False(t, liveTMSRequest(native))

	liveJob := httptest.NewRequest(http.MethodGet, "/v1/orgs/acme/jobs/ext:crowdin:7:10", nil)
	liveJob.SetPathValue("jobId", "ext:crowdin:7:10")
	require.True(t, liveTMSRequest(liveJob))
}

func TestLiveFileFilenameFallbacks(t *testing.T) {
	t.Parallel()
	now := "2026-01-01T00:00:00Z"
	titled := liveFile("crowdin", "7", tmscatalog.File{SourcePath: "docs/a.md", DisplayName: " Title "}, now)
	require.Equal(t, "Title", titled.Filename)
	require.Equal(t, "synced", titled.Provider.SyncState)
	require.Equal(t, []string{}, titled.Provider.TargetLocales)

	fromPath := liveFile("crowdin", "7", tmscatalog.File{SourcePath: "/docs/en/a.md"}, now)
	require.Equal(t, "a.md", fromPath.Filename)

	slashOnly := liveFile("crowdin", "7", tmscatalog.File{SourcePath: "/"}, now)
	require.Equal(t, "/", slashOnly.Filename)
}

func TestLiveProjectFillsMissingSourceAndTargets(t *testing.T) {
	t.Parallel()
	record := liveProject("org-1", "crowdin", tmscatalog.Project{ExternalID: "7", Name: "App", IsActive: true})
	require.Equal(t, "ext:crowdin:7", record.ID)
	require.Equal(t, "en", *record.SourceLocale)
	require.Equal(t, []string{}, record.TargetLocales)
	require.Equal(t, map[string]any{}, record.Metadata)
	require.Equal(t, "external_tms", record.Source)
	require.Nil(t, record.Identifier)

	keyed := liveProject("org-1", "crowdin", tmscatalog.Project{
		ExternalID: "7",
		Name:       "App",
		IsActive:   true,
		Metadata:   map[string]any{"identifier": " mobile-app "},
	})
	require.Equal(t, "mobile-app", *keyed.Identifier)
}

func TestLiveProviderFailureMapsTimeoutAndTMSErrors(t *testing.T) {
	t.Parallel()
	conn := tmsConnection{ProviderKind: "crowdin", DisplayName: "Crowdin"}
	var timeout *projectError
	require.ErrorAs(t, liveProviderFailure(conn, context.DeadlineExceeded), &timeout)
	require.Equal(t, http.StatusGatewayTimeout, timeout.status)
	require.Equal(t, "tms_timeout", timeout.code)

	wrapped := asProjectFailure(&tmsFailure{status: http.StatusConflict, code: "tms_not_connected", message: "Reconnect Crowdin"})
	var failure *projectError
	require.ErrorAs(t, wrapped, &failure)
	require.Equal(t, http.StatusConflict, failure.status)
	require.Equal(t, "tms_not_connected", failure.code)
	require.Equal(t, context.Canceled, asProjectFailure(context.Canceled))
	require.True(t, errors.Is(asProjectFailure(context.Canceled), context.Canceled))
}

func TestLiveLocaleProgressRowsSumsPhraseCounts(t *testing.T) {
	t.Parallel()
	last := "2026-03-01T00:00:00Z"
	project := tmscatalog.Project{
		ExternalID:     "7",
		Name:           "App",
		TargetLocales:  []string{"fr", "de"},
		LastActivityAt: &last,
	}
	rows := liveLocaleProgressRows(project, map[string][]tmscatalog.FileProgress{
		"fr": {
			{Phrases: tmscatalog.Counts{Total: 10, Translated: 8, Approved: 4}},
			{Phrases: tmscatalog.Counts{Total: 10, Translated: 2, Approved: 1}},
		},
		"de": {},
	})
	require.Len(t, rows, 2)
	require.Equal(t, "fr", rows[0].Locale)
	require.Equal(t, 50, rows[0].TranslationProgress)
	require.Equal(t, 25, rows[0].ApprovalProgress)
	require.Equal(t, localeProgressCounts{Total: 20, Translated: 10, Approved: 5}, rows[0].Phrases)
	require.Equal(t, localeProgressCounts{}, rows[0].Words)
	require.Equal(t, &last, rows[0].LastActivityAt)
	require.Equal(t, "de", rows[1].Locale)
	require.Equal(t, 0, rows[1].TranslationProgress)
	require.Equal(t, localeProgressCounts{}, rows[1].Phrases)
}

func TestLiveTmsHandlersWithoutAConnection(t *testing.T) {
	api, scope := projectTestAPI(t)

	unavailable := projectRequest(api, scope, scope.OrgPath("/tms/projects"))
	require.Equal(t, http.StatusServiceUnavailable, unavailable.Code, unavailable.Body.String())
	require.Contains(t, unavailable.Body.String(), "tms_unavailable")

	liveGetUnavailable := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7"))
	require.Equal(t, http.StatusServiceUnavailable, liveGetUnavailable.Code, liveGetUnavailable.Body.String())
	require.Contains(t, liveGetUnavailable.Body.String(), "tms_unavailable")

	liveProgressUnavailable := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/locale-progress"))
	require.Equal(t, http.StatusServiceUnavailable, liveProgressUnavailable.Code, liveProgressUnavailable.Body.String())

	liveFilesUnavailable := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/files"))
	require.Equal(t, http.StatusServiceUnavailable, liveFilesUnavailable.Code, liveFilesUnavailable.Body.String())

	liveHiddenUnavailable := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/hidden-files"))
	require.Equal(t, http.StatusServiceUnavailable, liveHiddenUnavailable.Code, liveHiddenUnavailable.Body.String())

	liveFiles := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/files?limit=0"))
	require.Equal(t, http.StatusBadRequest, liveFiles.Code, liveFiles.Body.String())
	require.Contains(t, liveFiles.Body.String(), "invalid_project_payload")

	tooLarge := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/files?limit=1001"))
	require.Equal(t, http.StatusBadRequest, tooLarge.Code, tooLarge.Body.String())

	missingLocale := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/file-progress"))
	require.Equal(t, http.StatusBadRequest, missingLocale.Code, missingLocale.Body.String())

	longLocale := projectRequest(api, scope, scope.OrgPath("/projects/ext:crowdin:7/file-progress?locale="+strings.Repeat("a", 33)))
	require.Equal(t, http.StatusBadRequest, longLocale.Code, longLocale.Body.String())

	hiddenNative := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/hidden-files"))
	require.Equal(t, http.StatusOK, hiddenNative.Code, hiddenNative.Body.String())
	require.JSONEq(t, `{"files":[]}`, hiddenNative.Body.String())

	branchesNative := projectRequest(api, scope, scope.OrgPath("/projects/"+scope.ProjectID+"/files/branches"))
	require.Equal(t, http.StatusOK, branchesNative.Code, branchesNative.Body.String())
	require.JSONEq(t, `{"branches":[]}`, branchesNative.Body.String())

	unknownLive := projectRequest(api, scope, scope.OrgPath("/projects/ext:unknown:1/hidden-files"))
	require.Equal(t, http.StatusNotFound, unknownLive.Code, unknownLive.Body.String())
}
