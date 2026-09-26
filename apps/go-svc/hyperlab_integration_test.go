package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func workspaceEntityID(t *testing.T, rec *httptest.ResponseRecorder, root, field string) string {
	t.Helper()
	var body map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	item := body[root].(map[string]any)
	id, ok := item[field].(string)
	require.True(t, ok, "missing %s.%s in %s", root, field, rec.Body.String())
	return id
}

func TestHyperlabLifecycle(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin"})
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	base := scope.OrgPath("/hyperlab")

	rec := workspaceRequest(t, h, scope, http.MethodPost, base+"/flags", `{"key":"checkout.enabled","kind":"config","description":"Checkout toggle"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	configFlagID := workspaceEntityID(t, rec, "flag", "id")

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/flags/"+configFlagID+"/config", `{"value":{"enabled":true}}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/flags/"+configFlagID, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"enabled":true`)

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/flags/"+configFlagID, `{"description":"Updated"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/flags", `{"key":"checkout.experiment","kind":"experiment"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	experimentFlagID := workspaceEntityID(t, rec, "flag", "id")

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/audiences", `{"name":"US shoppers","criterion":{"type":"attribute","name":"country","match":"exact","value":"US"}}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	audienceID := workspaceEntityID(t, rec, "audience", "id")

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/audiences/"+audienceID, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/audiences/"+audienceID, `{"description":"Primary US audience"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	start := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339Nano)
	end := time.Now().UTC().Add(24 * time.Hour).Format(time.RFC3339Nano)
	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/experiments", fmt.Sprintf(`{"name":"Checkout AB","kind":"ab","audienceId":"%s","startAt":"%s","endAt":"%s"}`, audienceID, start, end))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	experimentID := workspaceEntityID(t, rec, "experiment", "id")

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/experiments/"+experimentID, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var experimentBody map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &experimentBody))
	variants := experimentBody["variants"].([]any)
	require.Len(t, variants, 1)
	controlID := variants[0].(map[string]any)["id"].(string)

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/experiments/"+experimentID+"/variants", fmt.Sprintf(`{"key":"treatment","rolloutPercentage":5000,"siblingRollouts":[{"variantId":"%s","rolloutPercentage":5000}]}`, controlID))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	treatmentID := workspaceEntityID(t, rec, "variant", "id")

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/experiments/"+experimentID+"/rollouts", fmt.Sprintf(`{"rollouts":[{"variantId":"%s","rolloutPercentage":4000},{"variantId":"%s","rolloutPercentage":6000}]}`, controlID, treatmentID))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/variants/"+treatmentID, `{"rolloutPercentage":5500}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/assignments", fmt.Sprintf(`{"flagId":"%s","variantId":"%s","payload":{"color":"green"}}`, experimentFlagID, treatmentID))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	assignmentID := workspaceEntityID(t, rec, "assignment", "id")

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/assignments/"+assignmentID, `{"enabled":false}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/assignments", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/keys", `{"name":"Web SDK"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"secret":"hlk_`)
	keyID := workspaceEntityID(t, rec, "key", "id")

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/keys", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/experiments/"+experimentID, `{"name":"Checkout AB v2","status":"active"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/experiments", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/flags", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/audiences", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodDelete, base+"/assignments/"+assignmentID, "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	rec = workspaceRequest(t, h, scope, http.MethodDelete, base+"/variants/"+treatmentID, "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	rec = workspaceRequest(t, h, scope, http.MethodDelete, base+"/experiments/"+experimentID, "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	rec = workspaceRequest(t, h, scope, http.MethodDelete, base+"/flags/"+experimentFlagID, "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	rec = workspaceRequest(t, h, scope, http.MethodDelete, base+"/flags/"+configFlagID, "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	rec = workspaceRequest(t, h, scope, http.MethodDelete, base+"/audiences/"+audienceID, "")
	require.Equal(t, http.StatusNoContent, rec.Code)
	rec = workspaceRequest(t, h, scope, http.MethodDelete, base+"/keys/"+keyID, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"revokedAt"`)

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/flags/"+uuid.NewString(), "")
	require.Equal(t, http.StatusNotFound, rec.Code)
}
