package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
)

const billingRequestTimeout = 30 * time.Second

type billingAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
	autumn     *autumn.Client
}

type billingError struct {
	status        int
	code, message string
	details       any
}

func (e *billingError) Error() string { return e.code }

func billingFailure(status int, code, message string) error {
	return &billingError{status: status, code: code, message: message}
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
	registerAuthenticated(mux, verifier, "GET "+orgRoutePrefix+"/billing", http.HandlerFunc(api.serveBilling))
	registerAuthenticated(mux, verifier, "GET "+orgRoutePrefix+"/billing/invoices", http.HandlerFunc(api.serveInvoices))
	registerAuthenticated(mux, verifier, "POST "+orgRoutePrefix+"/billing/checkout", http.HandlerFunc(api.serveCheckout))
	registerAuthenticated(mux, verifier, "POST "+orgRoutePrefix+"/billing/portal", http.HandlerFunc(api.servePortal))
	registerAuthenticated(mux, verifier, "POST "+orgRoutePrefix+"/billing/topup", http.HandlerFunc(api.serveTopup))
	registerAuthenticated(mux, verifier, "GET "+orgRoutePrefix+"/billing/resource-usage", http.HandlerFunc(api.serveResourceUsage))
	registerAuthenticated(mux, verifier, "POST "+orgRoutePrefix+"/billing/resource-usage/sync", http.HandlerFunc(api.serveResourceUsageSync))
}

func writeBillingError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *billingError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "billing_request_failed", phase, err)
		failure = &billingError{status: 500, code: "internal_error", message: "Internal server error"}
	} else {
		logRequestFailure(r, "billing_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	body := map[string]any{"error": failure.code, "message": failure.message}
	if failure.details != nil {
		body["details"] = failure.details
	}
	writeJSON(w, failure.status, body)
}

func (api *billingAPI) authorize(w http.ResponseWriter, r *http.Request, capability, forbiddenCode, forbiddenMessage string) (organizationActor, bool) {
	if api.pool == nil {
		writeBillingError(w, r, "availability", billingFailure(503, "billing_unavailable", "Billing is unavailable"))
		return organizationActor{}, false
	}
	claims, ok := r.Context().Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeBillingError(w, r, "auth", billingFailure(401, "unauthorized", "Authentication required"))
		return organizationActor{}, false
	}
	actor, err := resolveOrganizationActor(r.Context(), api.pool, api.membership, claims, r.PathValue("organizationSlug"))
	if err != nil {
		writeBillingError(w, r, "resolve_actor", mapOrganizationAccessError(err, billingFailure))
		return organizationActor{}, false
	}
	if !hasOrganizationCapability(actor.role, capability) {
		writeBillingError(w, r, "capability", billingFailure(403, forbiddenCode, forbiddenMessage))
		return organizationActor{}, false
	}
	return actor, true
}

func (api *billingAPI) serveResourceUsage(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	ctx, cancel := context.WithTimeout(r.Context(), billingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	actor, ok := api.authorize(w, r, "billing:read", "billing_read_forbidden", "Billing settings require workspace admin access")
	if !ok {
		return
	}
	usage, err := countWorkspaceResourceUsage(ctx, api.pool, actor.organizationID)
	if err != nil {
		writeBillingError(w, r, "count", err)
		return
	}
	writeJSON(w, http.StatusOK, workspaceResourceUsageResponse{ResourceUsage: usage})
}

func (api *billingAPI) serveResourceUsageSync(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if denyBrowserMutation(r) {
		writeBillingError(w, r, "origin", billingFailure(403, "forbidden", "Cross-origin request denied"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), billingRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	actor, ok := api.authorize(w, r, "billing:write", "billing_write_forbidden", "Only workspace admins can sync billing usage")
	if !ok {
		return
	}
	syncCtx, syncCancel := context.WithTimeout(context.WithoutCancel(r.Context()), billingSyncTimeout)
	defer syncCancel()
	result, err := syncWorkspaceResourceUsage(syncCtx, api.pool, api.autumn, actor.organizationID)
	if err != nil {
		writeBillingError(w, r, "sync", err)
		return
	}
	if result.Status == workspaceResourceSyncPartialFailed {
		writeBillingError(w, r, "sync", &billingError{
			status:  http.StatusBadGateway,
			code:    "billing_resource_usage_sync_partial_failed",
			message: "One or more billing resource usage features failed to sync",
			details: map[string]any{"syncResult": result},
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"syncResult": result})
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
