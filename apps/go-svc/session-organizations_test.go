package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
)

func sessionOrganizationsRequest(api *sessionOrganizationsAPI, claims AuthClaims, cookie bool) *httptest.ResponseRecorder {
	mux := http.NewServeMux()
	api.register(mux, stubSessionVerifier{claims: claims})
	req := httptest.NewRequest(http.MethodGet, "/v1/organizations", nil)
	if cookie {
		req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	}
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

func TestSessionOrganizationsList(t *testing.T) {
	t.Run("unauthenticated", func(t *testing.T) {
		rec := sessionOrganizationsRequest(&sessionOrganizationsAPI{}, AuthClaims{}, false)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("unconfigured database", func(t *testing.T) {
		rec := sessionOrganizationsRequest(&sessionOrganizationsAPI{}, AuthClaims{UserID: "user_1"}, true)
		require.Equal(t, http.StatusServiceUnavailable, rec.Code)
		require.Contains(t, rec.Body.String(), "workspace_unavailable")
	})

	t.Run("invited placeholder returns empty list", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		rec := sessionOrganizationsRequest(&sessionOrganizationsAPI{pool: scope.Pool}, AuthClaims{UserID: "invited_user_123"}, true)
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"organizations":[]}`, rec.Body.String())
	})

	t.Run("lists active memberships and skips archived or replacing", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		otherUser := testenv.Seed(t, testenv.Options{Role: "admin"})
		archivedID := uuid.NewString()
		replacingID := uuid.NewString()
		secondID := uuid.NewString()
		suffix := uuid.NewString()[:8]
		secondWorkos := "org_" + uuid.NewString()
		secondSlug := "bravo-" + suffix
		_, err := scope.Pool.Exec(t.Context(), `
            insert into organizations (id, workos_organization_id, name, slug, lifecycle_status)
            values
                ($1, $2, 'Archived Co', $3, 'archived'),
                ($4, $5, 'Replacing Co', $6, 'active'),
                ($7, $8, 'Bravo Co', $9, 'active')`,
			archivedID, "org_archived_"+suffix, "archived-"+suffix, replacingID, "org_replacing_"+suffix, "replacing-"+suffix, secondID, secondWorkos, secondSlug)
		require.NoError(t, err)
		t.Cleanup(func() {
			_, _ = scope.Pool.Exec(t.Context(), `delete from organizations where id in ($1, $2, $3)`, archivedID, replacingID, secondID)
		})
		_, err = scope.Pool.Exec(t.Context(), `
            insert into organization_memberships (organization_id, user_id, workos_membership_id, role)
            values
                ($1, $2, 'om_archived', 'admin'),
                ($3, $2, 'replacing', 'admin'),
                ($4, $2, 'om_bravo', 'member')`,
			archivedID, scope.UserID, replacingID, secondID)
		require.NoError(t, err)

		rec := sessionOrganizationsRequest(&sessionOrganizationsAPI{pool: scope.Pool}, AuthClaims{UserID: scope.WorkOSUserID}, true)
		require.Equal(t, http.StatusOK, rec.Code)

		var body struct {
			Organizations []sessionOrganization `json:"organizations"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Len(t, body.Organizations, 2)
		require.Equal(t, scope.OrganizationID, body.Organizations[0].ID)
		require.Equal(t, scope.WorkOSOrganizationID, body.Organizations[0].WorkosOrganizationID)
		require.NotNil(t, body.Organizations[0].Slug)
		require.Equal(t, scope.Slug, *body.Organizations[0].Slug)
		require.Equal(t, secondID, body.Organizations[1].ID)
		require.Equal(t, secondWorkos, body.Organizations[1].WorkosOrganizationID)
		require.NotNil(t, body.Organizations[1].Slug)
		require.Equal(t, secondSlug, *body.Organizations[1].Slug)

		other := sessionOrganizationsRequest(&sessionOrganizationsAPI{pool: otherUser.Pool}, AuthClaims{UserID: otherUser.WorkOSUserID}, true)
		require.Equal(t, http.StatusOK, other.Code)
		var otherBody struct {
			Organizations []sessionOrganization `json:"organizations"`
		}
		require.NoError(t, json.Unmarshal(other.Body.Bytes(), &otherBody))
		require.Len(t, otherBody.Organizations, 1)
		require.Equal(t, otherUser.OrganizationID, otherBody.Organizations[0].ID)
	})

	t.Run("unknown user returns empty list", func(t *testing.T) {
		scope := testenv.Seed(t, testenv.Options{Role: "admin"})
		rec := sessionOrganizationsRequest(&sessionOrganizationsAPI{pool: scope.Pool}, AuthClaims{UserID: "user_missing"}, true)
		require.Equal(t, http.StatusOK, rec.Code)
		require.JSONEq(t, `{"organizations":[]}`, rec.Body.String())
	})

	t.Run("verifier error is unauthorized", func(t *testing.T) {
		mux := http.NewServeMux()
		(&sessionOrganizationsAPI{}).register(mux, stubSessionVerifier{err: errors.New("invalid_session")})
		req := httptest.NewRequest(http.MethodGet, "/v1/organizations", nil)
		req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, req)
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})
}
