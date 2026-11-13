package main

import (
	"context"
	"net/http"
	"strings"
	"time"
)

const sessionOrganizationsRequestTimeout = 30 * time.Second

type sessionOrganizationsAPI struct {
	pool dictionaryPool
}

type sessionOrganization struct {
	ID                   string  `json:"id"`
	Name                 string  `json:"name"`
	Slug                 *string `json:"slug"`
	WorkosOrganizationID string  `json:"workosOrganizationId"`
}

func (api *sessionOrganizationsAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "GET /v1/organizations", http.HandlerFunc(api.list))
}

func (api *sessionOrganizationsAPI) list(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.pool == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{
			"error":   "workspace_unavailable",
			"message": "Organizations are unavailable",
		})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), sessionOrganizationsRequestTimeout)
	defer cancel()
	claims, ok := r.Context().Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{
			"error":   "unauthorized",
			"message": "Authentication required",
		})
		return
	}
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		writeJSON(w, http.StatusOK, map[string]any{"organizations": []sessionOrganization{}})
		return
	}
	organizations, err := listSessionOrganizations(ctx, api.pool, claims.UserID)
	if err != nil {
		logRequestFailure(r, "session_organizations_request_failed", "list", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{
			"error":   "internal_error",
			"message": "An unexpected error occurred",
		})
		return
	}
	if organizations == nil {
		organizations = []sessionOrganization{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"organizations": organizations})
}

func listSessionOrganizations(ctx context.Context, db dictionaryDB, workosUserID string) ([]sessionOrganization, error) {
	rows, err := db.Query(ctx, `select o.id, o.name, o.slug, o.workos_organization_id
        from users u
        join organization_memberships m on m.user_id=u.id
        join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1
        and o.lifecycle_status='active'
        and m.workos_membership_id is not null
        and m.workos_membership_id not in ('', 'replacing')
        and m.workos_membership_id not like 'replacing:%'
        order by o.name`, workosUserID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	organizations := make([]sessionOrganization, 0)
	for rows.Next() {
		var org sessionOrganization
		if err := rows.Scan(&org.ID, &org.Name, &org.Slug, &org.WorkosOrganizationID); err != nil {
			return nil, err
		}
		organizations = append(organizations, org)
	}
	return organizations, rows.Err()
}
