package main

import (
	"context"
	"errors"
	"net/http"
)

func (api *issueSheetAPI) handleOrg(fn func(*http.Request, issueSheetActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeIssueSheetError(w, r, "origin_guard", issueSheetFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeIssueSheetError(w, r, "availability", issueSheetFailure(503, "issue_sheet_unavailable", "Issue sheet service unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), issueSheetRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeIssueSheetError(w, r, "auth", issueSheetFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeIssueSheetError(w, r, "resolve_actor", err)
			return
		}
		if !actor.canRead() {
			writeIssueSheetError(w, r, "authorize", issueSheetFailure(403, "forbidden", "Forbidden"))
			return
		}
		if !api.queriesBoardEnabled(ctx, actor.organizationID) {
			writeIssueSheetError(w, r, "autumn", issueSheetFailure(403, "feature_unavailable", "Queries is not included in your current plan."))
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, issueSheetBodyLimit)
		value, status, err := fn(r, actor)
		if errors.Is(err, errIssueSheetUnmatched) {
			http.NotFound(w, r)
			return
		}
		if err != nil {
			writeIssueSheetError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		issueSheetJSON(r.Context(), w, status, value)
	})
}

func (api *issueSheetAPI) registerOrgRoutes(mux *http.ServeMux, verifier SessionVerifier) {
	route := func(pattern string, fn func(*http.Request, issueSheetActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handleOrg(fn))
	}
	route("GET "+orgRoutePrefix+"/issues", api.listOrgIssuesHandler)
	route("GET "+orgRoutePrefix+"/issue-sheet/search", api.searchOrgIssuesHandler)
	route("GET "+orgRoutePrefix+"/issue-sheet/{issueId}", api.getOrgIssueHandler)
}
