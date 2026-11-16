package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func TestHyperlabPublicOtaFormat(t *testing.T) {
	require.Equal(t, "android-xml", publicOtaFormat("android_xml"))
	require.Equal(t, "ios-strings", publicOtaFormat("ios-strings"))
	require.Equal(t, "json", publicOtaFormat(""))
}

func TestOtaBindingsByVariantEmpty(t *testing.T) {
	h := &handler{}
	out, err := h.otaBindingsByVariant(context.Background(), "org", nil)
	require.NoError(t, err)
	require.Empty(t, out)
}

func insertHyperlabDistribution(t *testing.T, scope *testenv.Scope, name, format, branch string, revoked bool) (id, hash string) {
	t.Helper()
	hash = strings.ReplaceAll(uuid.NewString(), "-", "")
	query := `insert into ota_distributions
		(organization_id, project_id, name, public_hash, format, branch_name, revoked_at)
		values ($1, $2, $3, $4, $5::ota_distribution_format, $6, `
	if revoked {
		query += `now()) returning id::text`
	} else {
		query += `null) returning id::text`
	}
	require.NoError(t, scope.Pool.QueryRow(t.Context(), query,
		scope.OrganizationID, scope.ProjectID, name, hash, format, branch).Scan(&id))
	return id, hash
}

func TestHyperlabOtaDistributionHTTP(t *testing.T) {
	scope := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	h := workspaceHandler(scope, "admin", stubWorkspaceFlags{enabled: true})
	base := scope.OrgPath("/hyperlab")

	liveID, liveHash := insertHyperlabDistribution(t, scope, "Checkout XML", "android_xml", "release", false)
	_, revokedHash := insertHyperlabDistribution(t, scope, "Old pack", "json", "main", true)

	other := testenv.Seed(t, testenv.Options{Role: "admin", WithProject: true})
	_, foreignHash := insertHyperlabDistribution(t, other, "Foreign", "ios_strings", "main", false)

	rec := workspaceRequest(t, h, scope, http.MethodGet, base+"/ota-distributions", "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var listed struct {
		Distributions []map[string]any `json:"distributions"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &listed))
	require.Len(t, listed.Distributions, 1)
	require.Equal(t, liveID, listed.Distributions[0]["id"])
	require.Equal(t, liveHash, listed.Distributions[0]["hash"])
	require.Equal(t, "android-xml", listed.Distributions[0]["format"])
	require.Equal(t, "release", listed.Distributions[0]["branch"])
	require.Equal(t, scope.ProjectID, listed.Distributions[0]["projectId"])
	require.NotContains(t, rec.Body.String(), revokedHash)
	require.NotContains(t, rec.Body.String(), foreignHash)

	rec = workspaceRequest(t, h, scope, http.MethodPost, base+"/experiments", `{"name":"Checkout AB","kind":"ab"}`)
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	experimentID := workspaceEntityID(t, rec, "experiment", "id")
	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/experiments/"+experimentID, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var experimentBody map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &experimentBody))
	controlID := experimentBody["variants"].([]any)[0].(map[string]any)["id"].(string)

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/variants/"+controlID+"/ota", `{"distributionId":"not-a-uuid"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), `"error":"invalid_variant_ota_payload"`)

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/variants/"+controlID+"/ota",
		fmt.Sprintf(`{"distributionId":"%s"}`, uuid.NewString()))
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), `"error":"ota_distribution_not_found"`)

	revokedID, _ := insertHyperlabDistribution(t, scope, "Revoked bind", "json", "main", true)
	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/variants/"+controlID+"/ota",
		fmt.Sprintf(`{"distributionId":"%s"}`, revokedID))
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), `"error":"ota_distribution_not_found"`)

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/variants/"+uuid.NewString()+"/ota",
		fmt.Sprintf(`{"distributionId":"%s"}`, liveID))
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Contains(t, rec.Body.String(), `"error":"variant_not_found"`)

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/variants/"+controlID+"/ota",
		fmt.Sprintf(`{"distributionId":"%s"}`, liveID))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.JSONEq(t, fmt.Sprintf(`{"ota":{"distributionId":"%s","hash":"%s","branch":"release","format":"android-xml","name":"Checkout XML"}}`,
		liveID, liveHash), rec.Body.String())

	replacementID, replacementHash := insertHyperlabDistribution(t, scope, "JSON pack", "json", "main", false)
	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/variants/"+controlID+"/ota",
		fmt.Sprintf(`{"distributionId":"%s"}`, replacementID))
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), replacementHash)

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/experiments/"+experimentID, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &experimentBody))
	variant := experimentBody["variants"].([]any)[0].(map[string]any)
	ota := variant["ota"].(map[string]any)
	require.Equal(t, replacementID, ota["distributionId"])
	require.Equal(t, replacementHash, ota["hash"])
	require.Equal(t, "json", ota["format"])

	rec = workspaceRequest(t, h, scope, http.MethodPut, base+"/variants/"+controlID+"/ota", `{"distributionId":null}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.JSONEq(t, `{"ota":null}`, rec.Body.String())

	rec = workspaceRequest(t, h, scope, http.MethodGet, base+"/experiments/"+experimentID, "")
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	require.Contains(t, rec.Body.String(), `"ota":null`)
}
