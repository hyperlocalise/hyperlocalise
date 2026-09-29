package main

import (
	"context"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestUpdateProjectWriteEnforcesTeamAccessAtWriteTime(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "developer"})
	teamID := scope.MustTeam(t, "toctou-team", "TOCTOU Team", "member")
	scope.MustProject(t, scope.ProjectID, "Original Name")
	_, err := scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, scope.ProjectID, teamID)
	require.NoError(t, err)

	publisher := &recordingActivityLogPublisher{}
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("developer"), activityLog: publisher}
	api.testBeforeUpdateWrite = func() {
		// Simulate the actor's team access being revoked between the
		// preflight read (which passed) and the write.
		_, hookErr := scope.Pool.Exec(context.Background(), `delete from team_memberships where team_id=$1 and user_id=$2`, teamID, scope.UserID)
		require.NoError(t, hookErr)
	}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
		"name": "Renamed While Revoked",
	})
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"project_not_found"`)

	var storedName string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select name from projects where id=$1`, scope.ProjectID).Scan(&storedName))
	require.Equal(t, "Original Name", storedName, "the write must not have applied once access was revoked")

	require.Empty(t, publisher.recorded(), "no activity may be published for a write that affected zero rows")
}

func TestUpdateProjectWriteHandlesConcurrentDelete(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	publisher := &recordingActivityLogPublisher{}
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin"), activityLog: publisher}
	api.testBeforeUpdateWrite = func() {
		_, hookErr := scope.Pool.Exec(context.Background(), `delete from projects where id=$1`, scope.ProjectID)
		require.NoError(t, hookErr)
	}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
		"name": "Renamed After Delete",
	})
	require.Equal(t, http.StatusNotFound, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"project_not_found"`)
	require.Empty(t, publisher.recorded(), "no activity may be published for a write that affected zero rows")
}

func TestUpdateProjectIdentifierRaceMapsToConflict(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	var originalIdentifier string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select identifier from projects where id=$1`, scope.ProjectID).Scan(&originalIdentifier))

	publisher := &recordingActivityLogPublisher{}
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin"), activityLog: publisher}
	otherID := uniqueProjectID("racer_")
	api.testBeforeUpdateWrite = func() {
		// Simulate another concurrent request winning the identifier
		// "RACEID" after this request's own uniqueness preflight already
		// found it free.
		_, hookErr := scope.Pool.Exec(context.Background(), `
			insert into projects (id, organization_id, created_by_user_id, name, identifier, source)
			values ($1,$2,$3,'Racer','RACEID','native')`,
			otherID, scope.OrganizationID, scope.UserID)
		require.NoError(t, hookErr)
	}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
		"identifier": "RACEID",
	})
	require.Equal(t, http.StatusConflict, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"identifier_taken"`)

	var storedIdentifier string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select identifier from projects where id=$1`, scope.ProjectID).Scan(&storedIdentifier))
	require.Equal(t, originalIdentifier, storedIdentifier, "the identifier must not have partially applied")
	require.Empty(t, publisher.recorded(), "no activity may be published for a write that hit a unique violation")
}

func TestUpdateProjectSourcePatchRevalidatesAgainstConcurrentTargetChange(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	seedNativeProjectWithLocales(t, scope, scope.ProjectID, "en", []string{"fr"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	api.testBeforeLocaleLock = func() {
		_, hookErr := scope.Pool.Exec(context.Background(), `update projects set target_locales='["de"]'::jsonb where id=$1`, scope.ProjectID)
		require.NoError(t, hookErr)
	}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
		"sourceLocale": "de",
	})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"source_in_targets"`)

	var sourceLocale string
	var targetLocalesJSON []byte
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select source_locale, target_locales from projects where id=$1`, scope.ProjectID).Scan(&sourceLocale, &targetLocalesJSON))
	require.Equal(t, "en", sourceLocale, "the rejected sourceLocale patch must not have applied")
	var targetLocales []string
	require.NoError(t, json.Unmarshal(targetLocalesJSON, &targetLocales))
	require.Equal(t, []string{"de"}, targetLocales, "the concurrently-committed target change must be preserved")
}

func TestUpdateProjectTargetPatchRevalidatesAgainstConcurrentSourceChange(t *testing.T) {
	testenv.Require(t)
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	seedNativeProjectWithLocales(t, scope, scope.ProjectID, "en", []string{"fr"})
	api := &projectAPI{pool: scope.Pool, membership: scope.Membership("admin")}
	api.testBeforeLocaleLock = func() {
		_, hookErr := scope.Pool.Exec(context.Background(), `update projects set source_locale='de' where id=$1`, scope.ProjectID)
		require.NoError(t, hookErr)
	}

	rec := projectMutationRequest(api, scope, http.MethodPatch, scope.OrgPath("/projects/"+scope.ProjectID), map[string]any{
		"targetLocales": []string{"de"},
	})
	require.Equal(t, http.StatusBadRequest, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"source_in_targets"`)

	var sourceLocale string
	var targetLocalesJSON []byte
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select source_locale, target_locales from projects where id=$1`, scope.ProjectID).Scan(&sourceLocale, &targetLocalesJSON))
	require.Equal(t, "de", sourceLocale, "the concurrently-committed source change must be preserved")
	var targetLocales []string
	require.NoError(t, json.Unmarshal(targetLocalesJSON, &targetLocales))
	require.Equal(t, []string{"fr"}, targetLocales, "the rejected targetLocales patch must not have applied")
}
