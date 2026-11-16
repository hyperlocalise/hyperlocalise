package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/experiment"
	"github.com/hyperlocalise/hyperlocalise/internal/ota"
	"github.com/stretchr/testify/require"
)

type memoryOtaLookup struct {
	releases map[string]*ota.Release
}

func (m memoryOtaLookup) LatestUnrevoked(_ context.Context, hash string) (*ota.Release, error) {
	release, ok := m.releases[hash]
	if !ok {
		return nil, ota.ErrNotFound
	}
	return release, nil
}

func TestPublicOtaFormat(t *testing.T) {
	require.Equal(t, "android-xml", publicOtaFormat("android_xml"))
	require.Equal(t, "android-xml", publicOtaFormat("android-xml"))
	require.Equal(t, "ios-strings", publicOtaFormat("ios_strings"))
	require.Equal(t, "json", publicOtaFormat("json"))
	require.Equal(t, "json", publicOtaFormat("unknown"))
}

func TestPublicOTAConsumerRoutes(t *testing.T) {
	hash := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	manifest, err := json.Marshal(map[string]any{"schema_version": 1, "format": "json"})
	require.NoError(t, err)
	h := newHandlerWithOutbound(
		authFunc(func(context.Context, string) (principal, error) {
			t.Fatal("OTA consumer routes do not authenticate")
			return principal{}, nil
		}),
		nil,
		nil,
		withOTA(ota.NewHandler(memoryOtaLookup{releases: map[string]*ota.Release{
			hash: {
				Manifest: manifest,
				Format:   "json",
				Contents: map[string]map[string]string{"fr-FR": {"messages.json": `{"hi":"bonjour"}`}},
			},
		}})),
	)

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/"+hash+"/manifest.json", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"schema_version":1`)
	require.Equal(t, "public, max-age=3600", rec.Header().Get("Cache-Control"))

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/"+hash+"/content/fr-FR/messages.json", nil))
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, `{"hi":"bonjour"}`, rec.Body.String())

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/ota/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb/manifest.json", nil))
	require.Equal(t, http.StatusNotFound, rec.Code)
	require.Empty(t, rec.Body.String())
}

func TestPublicOFREPConsumerRoute(t *testing.T) {
	store := experiment.NewMemoryStore("org-1")
	store.AddKey("hlk_test")
	store.SetFlags([]experiment.FlagRecord{
		{ID: "f-exp", Key: "checkout-cta", Kind: "experiment"},
	})
	store.SetRows([]experiment.EvalRow{{
		FlagID: "f-exp", ExperimentID: "exp-1", Seed: 1, VariantKey: "treatment",
		AllocStart: 0, AllocEnd: 9999, Enabled: true, Payload: []byte(`true`),
	}})
	store.SetOtaBindings([]experiment.OtaBinding{{
		FlagKey: "checkout-cta", VariantKey: "treatment",
		Hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Branch: "main", Format: "json",
	}})
	h := newHandlerWithOutbound(
		authFunc(func(context.Context, string) (principal, error) {
			t.Fatal("OFREP uses Hyperlab client keys, not PATs")
			return principal{}, nil
		}),
		nil,
		nil,
		withOFREP(experiment.NewOFREPHandler(store)),
	)

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/ofrep/v1/evaluate/flags/checkout-cta", bytes.NewBufferString(`{"context":{"targetingKey":"u1"}}`))
	req.Header.Set("X-API-Key", "hlk_test")
	h.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)
	require.Contains(t, rec.Body.String(), `"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"`)
}

func sendOTA(t *testing.T, p principal, store resourceStore, method, target string, options ...handlerOption) *httptest.ResponseRecorder {
	t.Helper()
	h := newHandlerWithOutbound(authFunc(func(context.Context, string) (principal, error) { return p, nil }), store, nil, options...)
	r := httptest.NewRequest(method, target, nil)
	r.Header.Set("X-Api-Key", "hl_test")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	return w
}

func TestProjectOtaDistributionRoutes(t *testing.T) {
	readScopes := effectivePermissions([]string{"files:read"}, "member")

	t.Run("needs files:read", func(t *testing.T) {
		w := sendOTA(t, resourcePrincipal(jobReadScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/projects/project-1/ota-distributions")
		require.Equal(t, http.StatusForbidden, w.Code)
		require.Contains(t, w.Body.String(), `"error":"forbidden"`)
	})

	t.Run("missing project", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.err = errProjectNotFound
		w := sendOTA(t, resourcePrincipal(readScopes...), store, http.MethodGet, "/v1/projects/missing/ota-distributions")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), `"error":"project_not_found"`)
	})

	t.Run("unavailable without a pool", func(t *testing.T) {
		w := sendOTA(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/projects/project-1/ota-distributions")
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
		require.Contains(t, w.Body.String(), `"error":"service_unavailable"`)
	})

	t.Run("rejects other methods", func(t *testing.T) {
		w := sendOTA(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/projects/project-1/ota-distributions")
		require.Equal(t, http.StatusMethodNotAllowed, w.Code)
		require.Equal(t, "GET, HEAD", w.Header().Get("Allow"))
	})
}

func TestProjectOtaDistributionsDatabase(t *testing.T) {
	f := newDBFixture(t)
	ctx := t.Context()
	p := f.actor
	p.Permissions = effectivePermissions([]string{"files:read"}, "admin")

	insertPack := func(t *testing.T, projectID, name, format, branch string) (id, hash string) {
		t.Helper()
		hash = strings.ReplaceAll(uuid.NewString(), "-", "")
		require.NoError(t, f.pool.QueryRow(ctx, `INSERT INTO ota_distributions
			(organization_id, project_id, name, public_hash, format, branch_name)
			VALUES ($1, $2, $3, $4, $5::ota_distribution_format, $6) RETURNING id::text`,
			f.actor.OrganizationID, projectID, name, hash, format, branch).Scan(&id))
		return id, hash
	}

	liveID, liveHash := insertPack(t, f.project, "Checkout XML", "android_xml", "release")
	revokedID, revokedHash := insertPack(t, f.project, "Old pack", "json", "main")
	f.exec(t, `UPDATE ota_distributions SET revoked_at = now() WHERE id = $1`, revokedID)

	otherProject := "project_" + strings.ReplaceAll(uuid.NewString()[:8], "-", "")
	f.exec(t, `INSERT INTO projects (id, organization_id, created_by_user_id, name, identifier, source, source_locale, target_locales)
		VALUES ($1, $2, $3, 'Other', $4, 'native', 'en', '["fr"]'::jsonb)`,
		otherProject, f.actor.OrganizationID, f.actor.UserID, "O"+strings.ToUpper(uuid.NewString()[:7]))
	_, otherHash := insertPack(t, otherProject, "Other pack", "ios_strings", "main")

	foreign := newDBFixture(t)
	_, foreignHash := func() (string, string) {
		hash := strings.ReplaceAll(uuid.NewString(), "-", "")
		var id string
		require.NoError(t, foreign.pool.QueryRow(ctx, `INSERT INTO ota_distributions
			(organization_id, project_id, name, public_hash, format, branch_name)
			VALUES ($1, $2, 'Foreign', $3, 'json', 'main') RETURNING id::text`,
			foreign.actor.OrganizationID, foreign.project, hash).Scan(&id))
		return id, hash
	}()

	get := func(t *testing.T, actor principal, projectID string) *httptest.ResponseRecorder {
		t.Helper()
		return sendOTA(t, actor, f.store, http.MethodGet, "/v1/projects/"+projectID+"/ota-distributions", withPostgresConsumers(f.pool))
	}

	t.Run("lists this project's packs and hides the rest", func(t *testing.T) {
		w := get(t, p, f.project)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		var body struct {
			Distributions []publicOtaDistribution `json:"distributions"`
		}
		require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
		require.Len(t, body.Distributions, 2)

		byID := map[string]publicOtaDistribution{}
		for _, item := range body.Distributions {
			byID[item.ID] = item
		}
		live := byID[liveID]
		require.Equal(t, "Checkout XML", live.Name)
		require.Equal(t, liveHash, live.PublicHash)
		require.Equal(t, "release", live.BranchName)
		require.Equal(t, "android-xml", live.Format)
		require.NotNil(t, live.ManifestURL)
		require.Equal(t, "https://public-api.hyperlocalise.com/ota/"+liveHash+"/manifest.json", *live.ManifestURL)
		require.Nil(t, live.RevokedAt)

		revoked := byID[revokedID]
		require.Equal(t, revokedHash, revoked.PublicHash)
		require.Equal(t, "json", revoked.Format)
		require.Nil(t, revoked.ManifestURL)
		require.NotNil(t, revoked.RevokedAt)

		require.NotContains(t, w.Body.String(), otherHash)
		require.NotContains(t, w.Body.String(), foreignHash)
	})

	t.Run("members without project access see no pack", func(t *testing.T) {
		outsider := f.member(t, "translator")
		outsider.Permissions = effectivePermissions([]string{"files:read"}, "translator")
		w := get(t, outsider, f.project)
		require.Equal(t, http.StatusNotFound, w.Code, w.Body.String())
		require.Contains(t, w.Body.String(), `"error":"project_not_found"`)
	})

	t.Run("unknown project", func(t *testing.T) {
		w := get(t, p, "project_missing")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), `"error":"project_not_found"`)
	})
}
