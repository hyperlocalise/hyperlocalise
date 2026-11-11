package main

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

type stubVisualContextMatchPublisher struct {
	messages []visualContextMatchMessage
	err      error
}

func (s *stubVisualContextMatchPublisher) Publish(_ context.Context, message visualContextMatchMessage) error {
	s.messages = append(s.messages, message)
	return s.err
}

func TestEditorCatVisualContextMatchUnavailable(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	screenshotID := mustReadyVisualContextScreenshot(t, scope)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{}`)
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
	require.Contains(t, rec.Body.String(), "visual_context_matching_unavailable")
}

func TestEditorCatVisualContextMatchForbiddenForMember(t *testing.T) {
	api, scope := editorCatTestAPI(t, "member")
	api.matchPublisher = &stubVisualContextMatchPublisher{}
	screenshotID := mustReadyVisualContextScreenshot(t, scope)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestEditorCatVisualContextMatchRejectsUnreadyAndUnknownScreenshots(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.matchPublisher = &stubVisualContextMatchPublisher{}

	pendingID := mustPendingVisualContextScreenshot(t, scope)
	pending := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+pendingID+"/match"), `{}`)
	require.Equal(t, http.StatusConflict, pending.Code)
	require.Contains(t, pending.Body.String(), "visual_context_screenshot_not_ready")

	missing := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+uuid.NewString()+"/match"), `{}`)
	require.Equal(t, http.StatusNotFound, missing.Code)
	require.Contains(t, missing.Body.String(), "visual_context_screenshot_not_found")
}

func TestEditorCatVisualContextMatchValidatesScope(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	publisher := &stubVisualContextMatchPublisher{}
	api.matchPublisher = publisher
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	keyID := mustEditorCatKey(t, scope, fileID, "checkout", "Checkout")
	screenshotID := mustReadyVisualContextScreenshot(t, scope)

	both := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{
        "sourcePath":"locales/en.json",
        "externalStringIds":["`+keyID+`"]
    }`)
	require.Equal(t, http.StatusBadRequest, both.Code)
	require.Contains(t, both.Body.String(), "invalid_project_payload")

	override := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{"overrideContextOlderThanDays":0}`)
	require.Equal(t, http.StatusBadRequest, override.Code)

	tooOld := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{"overrideContextOlderThanDays":3651}`)
	require.Equal(t, http.StatusBadRequest, tooOld.Code)

	invalidID := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{"externalStringIds":["not-a-uuid"]}`)
	require.Equal(t, http.StatusNotFound, invalidID.Code)
	require.Contains(t, invalidID.Body.String(), "cat_segment_not_found")

	unknownID := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{"externalStringIds":["`+uuid.NewString()+`"]}`)
	require.Equal(t, http.StatusNotFound, unknownID.Code)

	tooMany := make([]string, visualContextMatchMaxStringIDs+1)
	for i := range tooMany {
		tooMany[i] = `"` + uuid.NewString() + `"`
	}
	limit := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{"externalStringIds":[`+strings.Join(tooMany, ",")+`]}`)
	require.Equal(t, http.StatusBadRequest, limit.Code)

	require.Empty(t, publisher.messages)
}

func TestEditorCatVisualContextMatchQueuesAndLoadsProcess(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	publisher := &stubVisualContextMatchPublisher{}
	api.matchPublisher = publisher
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	keyID := mustEditorCatKey(t, scope, fileID, "checkout", "Checkout")
	screenshotID := mustReadyVisualContextScreenshot(t, scope)

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{
        "sourcePath":"locales/en.json",
        "externalStringIds":[],
        "overrideContextOlderThanDays":30
    }`)
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
	var queued struct {
		Process editorCatVisualContextMatchProcess `json:"process"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &queued))
	require.Equal(t, "queued", queued.Process.Status)
	require.Equal(t, screenshotID, queued.Process.ScreenshotID)
	require.Empty(t, queued.Process.Bindings)
	require.Len(t, publisher.messages, 1)
	require.Equal(t, 1, publisher.messages[0].SchemaVersion)
	require.Equal(t, queued.Process.ID, publisher.messages[0].ProcessID)

	var storedFileID *string
	var storedKeyIDs []string
	var storedDays *int
	err := scope.Pool.QueryRow(t.Context(), `
        select repository_source_file_id, translation_key_ids, override_context_older_than_days
        from project_visual_context_match_processes
        where id=$1`, queued.Process.ID).Scan(&storedFileID, &storedKeyIDs, &storedDays)
	require.NoError(t, err)
	require.NotNil(t, storedFileID)
	require.Equal(t, fileID, *storedFileID)
	require.Nil(t, storedKeyIDs)
	require.Equal(t, 30, *storedDays)

	keys := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+mustReadyVisualContextScreenshot(t, scope)+"/match"), `{
        "externalStringIds":["`+keyID+`", "`+keyID+`"]
    }`)
	require.Equal(t, http.StatusAccepted, keys.Code, keys.Body.String())
	var keyed struct {
		Process editorCatVisualContextMatchProcess `json:"process"`
	}
	require.NoError(t, json.Unmarshal(keys.Body.Bytes(), &keyed))
	err = scope.Pool.QueryRow(t.Context(), `
        select translation_key_ids from project_visual_context_match_processes where id=$1`,
		keyed.Process.ID).Scan(&storedKeyIDs)
	require.NoError(t, err)
	require.Equal(t, []string{keyID}, storedKeyIDs)

	loaded := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/visual-context/processes/"+queued.Process.ID), "")
	require.Equal(t, http.StatusOK, loaded.Code, loaded.Body.String())
	var body struct {
		Process editorCatVisualContextMatchProcess `json:"process"`
	}
	require.NoError(t, json.Unmarshal(loaded.Body.Bytes(), &body))
	require.Equal(t, queued.Process.ID, body.Process.ID)
	require.Equal(t, "queued", body.Process.Status)
	require.Empty(t, body.Process.Bindings)

	duplicate := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{}`)
	require.Equal(t, http.StatusConflict, duplicate.Code)
	require.Contains(t, duplicate.Body.String(), "visual_context_match_in_progress")
}

func TestEditorCatVisualContextMatchMarksEnqueueFailure(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.matchPublisher = &stubVisualContextMatchPublisher{err: errors.New("sqs unavailable")}
	screenshotID := mustReadyVisualContextScreenshot(t, scope)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+screenshotID+"/match"), `{}`)
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
	var body struct {
		Process editorCatVisualContextMatchProcess `json:"process"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Equal(t, "failed", body.Process.Status)
	require.NotNil(t, body.Process.Error)
	require.Equal(t, "enqueue_failed", *body.Process.Error)
}

func TestEditorCatVisualContextMatchProcessNotFound(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	rec := editorCatRequestScope(api, scope, http.MethodGet, editorCatPathFor(scope, "/files/detail/cat/visual-context/processes/"+uuid.NewString()), "")
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), "visual_context_match_process_not_found")
}

func mustReadyVisualContextScreenshot(t *testing.T, scope *testenv.Scope) string {
	t.Helper()
	storedFileID := uuid.NewString()
	screenshotID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into stored_files (
            id, organization_id, project_id, role, source_kind,
            storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256
        ) values ($1, $2, $3, 'source', 'repository_file', 'test', $1, $1, 'shot.png', 'image/png', 10, 'deadbeef')`,
		storedFileID, scope.OrganizationID, scope.ProjectID)
	require.NoError(t, err)
	_, err = scope.Pool.Exec(t.Context(), `
        insert into project_visual_context_screenshots (
            id, organization_id, project_id, stored_file_id, filename, content_type,
            object_location, object_key, status, created_by_user_id
        ) values ($1,$2,$3,$4,'shot.png','image/png','r2-primary',$5,'ready',$6)`,
		screenshotID, scope.OrganizationID, scope.ProjectID, storedFileID, screenshotID, scope.UserID)
	require.NoError(t, err)
	return screenshotID
}

func mustPendingVisualContextScreenshot(t *testing.T, scope *testenv.Scope) string {
	t.Helper()
	screenshotID := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into project_visual_context_screenshots (
            id, organization_id, project_id, filename, content_type,
            object_location, object_key, status, created_by_user_id
        ) values ($1,$2,$3,'shot.png','image/png','r2-primary',$4,'upload_pending',$5)`,
		screenshotID, scope.OrganizationID, scope.ProjectID, screenshotID, scope.UserID)
	require.NoError(t, err)
	return screenshotID
}
