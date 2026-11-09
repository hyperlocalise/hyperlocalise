package main

import (
	"context"
	"os"
	"strconv"
	"strings"
	"testing"

	"github.com/aws/aws-lambda-go/events"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/stretchr/testify/require"
)

type matchFixture struct {
	pool           *pgxpool.Pool
	repo           pgMatchRepository
	organizationID string
	projectID      string
	screenshotID   string
	otherShotID    string
}

func newMatchFixture(t *testing.T) matchFixture {
	t.Helper()
	url := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if url == "" {
		t.Skip("set DATABASE_URL to run visual context match database tests")
	}
	ctx := t.Context()
	pool, err := pgxpool.New(ctx, url)
	require.NoError(t, err)
	t.Cleanup(pool.Close)
	require.NoError(t, pool.Ping(ctx))
	suffix := uuid.NewString()
	f := matchFixture{
		pool:           pool,
		repo:           pgMatchRepository{pool: pool},
		organizationID: uuid.NewString(),
		projectID:      "project_" + strings.ReplaceAll(suffix[:8], "-", ""),
	}
	f.exec(t, `insert into organizations (id, workos_organization_id, name, slug, lifecycle_status) values ($1, $2, $3, $4, 'active')`,
		f.organizationID, "org_"+suffix, "Acme "+suffix, "org-"+strings.ReplaceAll(suffix[:12], "-", ""))
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `delete from organizations where id = $1`, f.organizationID)
	})
	f.exec(t, `insert into projects (id, organization_id, name, identifier, source) values ($1, $2, 'Project', $3, 'native')`,
		f.projectID, f.organizationID, "P"+strings.ToUpper(strings.ReplaceAll(suffix, "-", "")[:8]))
	f.screenshotID = f.screenshot(t, "ready")
	f.otherShotID = f.screenshot(t, "ready")
	return f
}

func (f matchFixture) exec(t *testing.T, sql string, args ...any) {
	t.Helper()
	_, err := f.pool.Exec(t.Context(), sql, args...)
	require.NoError(t, err)
}

func (f matchFixture) screenshot(t *testing.T, status string) string {
	t.Helper()
	id := uuid.NewString()
	var storedFileID *string
	if status == "ready" {
		fileID := "file_" + strings.ReplaceAll(uuid.NewString(), "-", "")
		f.exec(t, `insert into stored_files (id, organization_id, project_id, role, source_kind, storage_provider, storage_key, storage_url, filename, content_type, byte_size, sha256)
			values ($1, $2, $3, 'asset', 'editor_upload', 's3', $4, $5, 'shot.png', 'image/png', 10, 'sha')`,
			fileID, f.organizationID, f.projectID, "screens/"+id+".png", "s3://files/screens/"+id+".png")
		storedFileID = &fileID
	}
	f.exec(t, `insert into project_visual_context_screenshots (id, organization_id, project_id, stored_file_id, filename, content_type, object_location, object_key, status)
		values ($1, $2, $3, $4, 'shot.png', 'image/png', 'local', $5, $6)`,
		id, f.organizationID, f.projectID, storedFileID, "screens/"+id+".png", status)
	return id
}

func (f matchFixture) key(t *testing.T, name, sourceText string, hidden bool) string {
	t.Helper()
	id := uuid.NewString()
	f.exec(t, `insert into project_translation_keys (id, organization_id, project_id, key, source_text, normalized_source_text, is_hidden)
		values ($1, $2, $3, $4, $5, lower($5), $6)`, id, f.organizationID, f.projectID, name, sourceText, hidden)
	return id
}

func (f matchFixture) process(t *testing.T, screenshotID, status string, keyIDs []string, overrideDays *int) string {
	t.Helper()
	id := uuid.NewString()
	f.exec(t, `insert into project_visual_context_match_processes (id, organization_id, project_id, screenshot_id, status, translation_key_ids, override_context_older_than_days)
		values ($1, $2, $3, $4, $5, $6::uuid[], $7)`, id, f.organizationID, f.projectID, screenshotID, status, keyIDs, overrideDays)
	return id
}

func (f matchFixture) bind(t *testing.T, screenshotID, keyID, source string, ageDays int) {
	t.Helper()
	f.exec(t, `insert into project_visual_context_bindings (organization_id, project_id, screenshot_id, translation_key_id, marker_left, marker_top, marker_width, marker_height, source, updated_at)
		values ($1, $2, $3, $4, 1, 1, 5, 5, $5, now() - make_interval(days => $6))`, f.organizationID, f.projectID, screenshotID, keyID, source, ageDays)
}

func (f matchFixture) processState(t *testing.T, id string) (status string, attempts int, errorCode *string, checked, bound *int) {
	t.Helper()
	require.NoError(t, f.pool.QueryRow(t.Context(), `select status, attempts, error_code, checked_strings_count, bound_strings_count from project_visual_context_match_processes where id=$1`, id).
		Scan(&status, &attempts, &errorCode, &checked, &bound))
	return status, attempts, errorCode, checked, bound
}

func eventsWith(bodies ...string) events.SQSEvent {
	records := make([]events.SQSMessage, 0, len(bodies))
	for i, body := range bodies {
		records = append(records, events.SQSMessage{MessageId: "m" + strconv.Itoa(i), Body: body})
	}
	return events.SQSEvent{Records: records}
}

func candidateIDs(candidates []matchCandidate) []string {
	ids := make([]string, 0, len(candidates))
	for _, candidate := range candidates {
		ids = append(ids, candidate.KeyID)
	}
	return ids
}

func TestPgMatchRepositoryClaimProcess(t *testing.T) {
	f := newMatchFixture(t)
	keyID := f.key(t, "home.title", "Welcome", false)
	processID := f.process(t, f.screenshotID, "queued", []string{keyID}, nil)

	process, ok, err := f.repo.ClaimProcess(t.Context(), processID)
	require.NoError(t, err)
	require.True(t, ok)
	require.Equal(t, processID, process.ID)
	require.Equal(t, f.organizationID, process.OrganizationID)
	require.Equal(t, f.projectID, process.ProjectID)
	require.Equal(t, f.screenshotID, process.ScreenshotID)
	require.Equal(t, []string{keyID}, process.TranslationKeyIDs)
	require.Nil(t, process.SourceFileID)
	require.Nil(t, process.OverrideDays)
	require.Equal(t, 1, process.Attempts)
	require.Equal(t, "ready", process.ScreenshotStatus)
	require.Equal(t, "local", process.ObjectLocation)
	require.Equal(t, "image/png", process.ContentType)

	process, ok, err = f.repo.ClaimProcess(t.Context(), processID)
	require.NoError(t, err)
	require.True(t, ok)
	require.Equal(t, 2, process.Attempts)

	require.NoError(t, f.repo.FailProcess(t.Context(), processID, errorCodeProcessingFailed))
	_, ok, err = f.repo.ClaimProcess(t.Context(), processID)
	require.NoError(t, err)
	require.False(t, ok)

	_, ok, err = f.repo.ClaimProcess(t.Context(), uuid.NewString())
	require.NoError(t, err)
	require.False(t, ok)

	_, _, err = f.repo.ClaimProcess(t.Context(), "not-a-uuid")
	require.ErrorContains(t, err, "claim match process")
}

func TestPgMatchRepositoryLoadCandidatesAppliesScopeRules(t *testing.T) {
	f := newMatchFixture(t)
	visible := f.key(t, "home.title", "Welcome", false)
	f.key(t, "home.hidden", "Hidden", true)
	f.key(t, "home.divider", " ::: ", false)
	f.key(t, "home.callout", ":::callout-note", false)
	manual := f.key(t, "home.manual", "Manual", false)
	f.bind(t, f.screenshotID, manual, "manual", 0)
	recent := f.key(t, "home.recent", "Recent", false)
	f.bind(t, f.otherShotID, recent, "auto", 1)
	stale := f.key(t, "home.stale", "Stale", false)
	f.bind(t, f.otherShotID, stale, "auto", 30)
	autoHere := f.key(t, "home.auto", "Auto", false)
	f.bind(t, f.screenshotID, autoHere, "auto", 0)

	processID := f.process(t, f.screenshotID, "queued", nil, nil)
	process, ok, err := f.repo.ClaimProcess(t.Context(), processID)
	require.NoError(t, err)
	require.True(t, ok)
	candidates, err := f.repo.LoadCandidates(t.Context(), process, 100)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{visible, autoHere}, candidateIDs(candidates))

	days := 7
	process.OverrideDays = &days
	candidates, err = f.repo.LoadCandidates(t.Context(), process, 100)
	require.NoError(t, err)
	require.ElementsMatch(t, []string{visible, autoHere, stale}, candidateIDs(candidates))

	process.TranslationKeyIDs = []string{stale, manual}
	candidates, err = f.repo.LoadCandidates(t.Context(), process, 100)
	require.NoError(t, err)
	require.Equal(t, []string{stale}, candidateIDs(candidates))

	process.TranslationKeyIDs = nil
	candidates, err = f.repo.LoadCandidates(t.Context(), process, 1)
	require.NoError(t, err)
	require.Len(t, candidates, 1)

	process.OrganizationID = "not-a-uuid"
	_, err = f.repo.LoadCandidates(t.Context(), process, 1)
	require.ErrorContains(t, err, "match candidates")
}

func TestPgMatchRepositoryCompleteProcessKeepsManualBindings(t *testing.T) {
	f := newMatchFixture(t)
	fresh := f.key(t, "cart.title", "Cart", false)
	autoExisting := f.key(t, "cart.total", "Total", false)
	f.bind(t, f.screenshotID, autoExisting, "auto", 0)
	manual := f.key(t, "cart.manual", "Manual", false)
	f.bind(t, f.screenshotID, manual, "manual", 0)
	processID := f.process(t, f.screenshotID, "queued", nil, nil)
	process, ok, err := f.repo.ClaimProcess(t.Context(), processID)
	require.NoError(t, err)
	require.True(t, ok)

	bound, err := f.repo.CompleteProcess(t.Context(), process, 3, []stringMatch{
		{KeyIDs: []string{fresh, autoExisting}, Marker: markerPercent{Left: 10, Top: 20, Width: 30, Height: 5}},
		{KeyIDs: []string{manual}, Marker: markerPercent{Left: 50, Top: 50, Width: 10, Height: 10}},
	})
	require.NoError(t, err)
	require.Equal(t, 2, bound)

	status, attempts, errorCode, checked, boundCount := f.processState(t, processID)
	require.Equal(t, "completed", status)
	require.Equal(t, 1, attempts)
	require.Nil(t, errorCode)
	require.Equal(t, 3, *checked)
	require.Equal(t, 2, *boundCount)

	var left float64
	var source string
	var matchProcess *string
	require.NoError(t, f.pool.QueryRow(t.Context(), `select marker_left, source, match_process_id::text from project_visual_context_bindings where screenshot_id=$1 and translation_key_id=$2`, f.screenshotID, manual).Scan(&left, &source, &matchProcess))
	require.Equal(t, "manual", source)
	require.InDelta(t, 1, left, 0.0001)
	require.Nil(t, matchProcess)

	require.NoError(t, f.pool.QueryRow(t.Context(), `select marker_left, source, match_process_id::text from project_visual_context_bindings where screenshot_id=$1 and translation_key_id=$2`, f.screenshotID, autoExisting).Scan(&left, &source, &matchProcess))
	require.Equal(t, "auto", source)
	require.InDelta(t, 10, left, 0.0001)
	require.Equal(t, processID, *matchProcess)
}

func TestPgMatchRepositoryCompleteWithoutMatchesAndFail(t *testing.T) {
	f := newMatchFixture(t)
	processID := f.process(t, f.screenshotID, "queued", nil, nil)
	process, ok, err := f.repo.ClaimProcess(t.Context(), processID)
	require.NoError(t, err)
	require.True(t, ok)

	bound, err := f.repo.CompleteProcess(t.Context(), process, 0, nil)
	require.NoError(t, err)
	require.Zero(t, bound)
	status, _, _, checked, _ := f.processState(t, processID)
	require.Equal(t, "completed", status)
	require.Zero(t, *checked)

	require.NoError(t, f.repo.FailProcess(t.Context(), processID, errorCodeProcessingFailed))
	status, _, errorCode, _, _ := f.processState(t, processID)
	require.Equal(t, "completed", status)
	require.Nil(t, errorCode)

	queuedID := f.process(t, f.screenshotID, "queued", nil, nil)
	require.NoError(t, f.repo.FailProcess(t.Context(), queuedID, errorCodeScreenshotNotReady))
	status, _, errorCode, _, _ = f.processState(t, queuedID)
	require.Equal(t, "failed", status)
	require.Equal(t, errorCodeScreenshotNotReady, *errorCode)

	require.ErrorContains(t, f.repo.FailProcess(t.Context(), "not-a-uuid", errorCodeProcessingFailed), "fail match process")
	process.ID = "not-a-uuid"
	_, err = f.repo.CompleteProcess(t.Context(), process, 0, nil)
	require.ErrorContains(t, err, "complete match process")
	_, err = f.repo.CompleteProcess(t.Context(), process, 1, []stringMatch{{KeyIDs: []string{"bad"}}})
	require.ErrorContains(t, err, "write auto bindings")
}

func TestHandleRunsMatchWorkerAgainstDatabase(t *testing.T) {
	f := newMatchFixture(t)
	pendingShot := f.screenshot(t, "upload_pending")
	processID := f.process(t, pendingShot, "queued", nil, nil)
	handler := &visualContextMatchHandler{logger: discardLogger(), database: &databaseConnection{pool: f.pool}}

	body := `{"schemaVersion":1,"processId":"` + processID + `"}`
	response, err := handler.Handle(t.Context(), eventsWith(body, body))
	require.NoError(t, err)
	require.Empty(t, response.BatchItemFailures)
	status, attempts, errorCode, _, _ := f.processState(t, processID)
	require.Equal(t, "failed", status)
	require.Equal(t, 1, attempts)
	require.Equal(t, errorCodeScreenshotNotReady, *errorCode)
}
