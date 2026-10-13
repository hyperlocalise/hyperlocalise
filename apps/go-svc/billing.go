package main

import (
	"context"
	"errors"
	"net/http"
	"time"
)

const billingRequestTimeout = 30 * time.Second

type billingAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
}

type billingError struct {
	status        int
	code, message string
}

func (e *billingError) Error() string { return e.code }

func billingFailure(status int, code, message string) error {
	return &billingError{status, code, message}
}

type workspaceResourceUsage struct {
	Seats        int `json:"seats"`
	Projects     int `json:"projects"`
	Automations  int `json:"automations"`
	Integrations int `json:"integrations"`
}

type workspaceResourceUsageResponse struct {
	ResourceUsage workspaceResourceUsage `json:"resourceUsage"`
}

func (api *billingAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "GET "+orgRoutePrefix+"/billing/resource-usage", http.HandlerFunc(api.serveResourceUsage))
}

func writeBillingError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *billingError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "billing_request_failed", phase, err)
		failure = &billingError{500, "internal_error", "Internal server error"}
	} else {
		logRequestFailure(r, "billing_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	writeJSON(w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *billingAPI) serveResourceUsage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.pool == nil {
		writeBillingError(w, r, "availability", billingFailure(503, "billing_unavailable", "Billing is unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), billingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeBillingError(w, r, "auth", billingFailure(401, "unauthorized", "Authentication required"))
		return
	}
	actor, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, r.PathValue("organizationSlug"))
	if err != nil {
		writeBillingError(w, r, "resolve_actor", mapOrganizationAccessError(err, billingFailure))
		return
	}
	if !hasOrganizationCapability(actor.role, "billing:read") {
		writeBillingError(w, r, "capability", billingFailure(403, "billing_read_forbidden", "Billing settings require workspace admin access"))
		return
	}
	usage, err := countWorkspaceResourceUsage(ctx, api.pool, actor.organizationID)
	if err != nil {
		writeBillingError(w, r, "count", err)
		return
	}
	writeJSON(w, http.StatusOK, workspaceResourceUsageResponse{ResourceUsage: usage})
}

func countWorkspaceResourceUsage(ctx context.Context, db dictionaryDB, organizationID string) (workspaceResourceUsage, error) {
	var usage workspaceResourceUsage
	err := db.QueryRow(ctx, `
        select
            (select count(*)::int from organization_memberships where organization_id=$1),
            (select count(*)::int from projects where organization_id=$1 and is_active=true),
            (select count(*)::int from workspace_automations where organization_id=$1 and status <> 'archived'),
            (select count(*)::int from organization_external_tms_provider_credentials where organization_id=$1)
                + (select count(*)::int from github_installations where organization_id=$1)
                + (select count(*)::int from contentful_connections where organization_id=$1 and enabled=true)
                + (select count(*)::int from connectors where organization_id=$1 and enabled=true)`,
		organizationID).Scan(&usage.Seats, &usage.Projects, &usage.Automations, &usage.Integrations)
	return usage, err
}
