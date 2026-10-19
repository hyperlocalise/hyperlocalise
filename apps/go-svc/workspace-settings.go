package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	workspaceSettingsRequestTimeout  = 30 * time.Second
	workspaceSettingsCommitTimeout   = 5 * time.Second
	workspaceSettingsInternalMessage = "An unexpected error occurred"
	organizationsSlugConstraint      = "organizations_slug_key"
)

type workspaceIdentityWorkos interface {
	UpdateOrganizationName(ctx context.Context, workosOrganizationID, name string) error
}

type workspaceSettingsAPI struct {
	pool        dictionaryPool
	membership  organizationMembershipLookup
	workos      workspaceIdentityWorkos
	activityLog activityLogPublisher
}

type workspaceSettingsError struct {
	status        int
	code, message string
	details       any
}

func (e *workspaceSettingsError) Error() string { return e.code }

func workspaceSettingsFailure(status int, code, message string) error {
	return &workspaceSettingsError{status: status, code: code, message: message}
}

func workspaceNotFound() error {
	return workspaceSettingsFailure(http.StatusNotFound, "workspace_not_found", "Workspace not found")
}

type workspaceSettingsRecord struct {
	ID                   string  `json:"id"`
	WorkosOrganizationID string  `json:"workosOrganizationId"`
	Name                 string  `json:"name"`
	Slug                 *string `json:"slug"`
	LifecycleStatus      string  `json:"lifecycleStatus"`
	ArchivedAt           *string `json:"archivedAt"`
	IdentityProvider     string  `json:"identityProvider"`
}

const workspaceSettingsColumns = `id, workos_organization_id, name, slug, lifecycle_status::text, archived_at`

func scanWorkspaceSettingsRecord(row pgx.Row) (workspaceSettingsRecord, error) {
	var record workspaceSettingsRecord
	var archivedAt *time.Time
	err := row.Scan(&record.ID, &record.WorkosOrganizationID, &record.Name, &record.Slug, &record.LifecycleStatus, &archivedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return record, workspaceNotFound()
	}
	if err != nil {
		return record, err
	}
	if archivedAt != nil {
		formatted := formatTeamTime(*archivedAt)
		record.ArchivedAt = &formatted
	}
	record.IdentityProvider = "workos"
	return record, nil
}

func (api *workspaceSettingsAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	path := orgRoutePrefix + "/workspace"
	route := func(pattern string, fn func(*http.Request, organizationActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+path, api.getWorkspace)
	route("PATCH "+path, api.updateWorkspace)
	route("DELETE "+path, api.archiveWorkspace)
}

func (api *workspaceSettingsAPI) handle(fn func(*http.Request, organizationActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeWorkspaceSettingsError(w, r, "origin_guard", workspaceSettingsFailure(http.StatusForbidden, "forbidden", "Cross-origin request rejected"))
			return
		}
		if api.pool == nil {
			writeWorkspaceSettingsError(w, r, "availability", workspaceSettingsFailure(http.StatusServiceUnavailable, "workspace_unavailable", "Workspace settings are unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), workspaceSettingsRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeWorkspaceSettingsError(w, r, "auth", workspaceSettingsFailure(http.StatusUnauthorized, "unauthorized", "Authentication required"))
			return
		}
		actor, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeWorkspaceSettingsError(w, r, "resolve_actor", mapOrganizationAccessError(err, func(status int, code, message string) error {
				return workspaceSettingsFailure(status, code, message)
			}))
			return
		}
		if r.Method == http.MethodPatch {
			r.Body = http.MaxBytesReader(w, r.Body, workspaceBodyLimit)
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeWorkspaceSettingsError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		writeWorkspaceSettingsJSON(r.Context(), w, status, value)
	})
}

func writeWorkspaceSettingsJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		slog.WarnContext(ctx, "workspace_settings_response_write_failed")
	}
}

func writeWorkspaceSettingsError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *workspaceSettingsError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "workspace_settings_request_failed", phase, err)
		failure = &workspaceSettingsError{status: http.StatusInternalServerError, code: "internal_error", message: workspaceSettingsInternalMessage}
	} else {
		logRequestFailure(r, "workspace_settings_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	body := map[string]any{"error": failure.code, "message": failure.message}
	if failure.details != nil {
		body["details"] = failure.details
	}
	writeWorkspaceSettingsJSON(r.Context(), w, failure.status, body)
}

func (api *workspaceSettingsAPI) getWorkspace(r *http.Request, actor organizationActor) (any, int, error) {
	record, err := scanWorkspaceSettingsRecord(api.pool.QueryRow(r.Context(),
		`select `+workspaceSettingsColumns+` from organizations where id=$1`, actor.organizationID))
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"workspace": record}, http.StatusOK, nil
}

func (api *workspaceSettingsAPI) updateWorkspace(r *http.Request, actor organizationActor) (any, int, error) {
	ctx := r.Context()
	body, err := readWorkspaceSettingsBody(r)
	if err != nil {
		return nil, 0, err
	}
	update, issues := validateWorkspaceSettingsUpdate(body)
	if len(issues) > 0 {
		return nil, 0, &workspaceSettingsError{
			status:  http.StatusBadRequest,
			code:    "invalid_workspace_payload",
			message: "Workspace payload is invalid",
			details: map[string]any{"issues": issues},
		}
	}
	if !hasOrganizationCapability(actor.role, "workspace:update") {
		return nil, 0, workspaceSettingsFailure(http.StatusForbidden, "forbidden", "Only workspace admins can update settings")
	}
	if update.slug != nil && *update.slug != r.PathValue("organizationSlug") {
		var conflict bool
		if err := api.pool.QueryRow(ctx,
			`select exists(select 1 from organizations where slug=$1 and id<>$2)`,
			*update.slug, actor.organizationID).Scan(&conflict); err != nil {
			return nil, 0, err
		}
		if conflict {
			return nil, 0, workspaceSlugConflict()
		}
	}

	record, previousName, err := api.applyWorkspaceUpdate(ctx, actor, update)
	if err != nil {
		return nil, 0, err
	}
	if record.Slug == nil {
		return nil, 0, workspaceSettingsFailure(http.StatusBadRequest, "workspace_missing_slug", "Workspace slug is required")
	}

	changedFields := []string{}
	payload := map[string]any{}
	if update.name != nil {
		changedFields = append(changedFields, "name")
		payload["nextName"] = record.Name
		payload["previousName"] = previousName
	}
	if update.slug != nil {
		changedFields = append(changedFields, "slug")
	}
	payload["changedFields"] = changedFields
	api.publishActivity(ctx, activityLogEventInput{
		ActorKind:      "user",
		ActorUserID:    actor.userID,
		EventType:      "workspace_updated",
		OrganizationID: actor.organizationID,
		Payload:        payload,
		TargetID:       actor.organizationID,
		TargetKind:     "organization",
	})
	return map[string]any{
		"workspace":  record,
		"redirectTo": "/org/" + *record.Slug + "/settings/account",
	}, http.StatusOK, nil
}

func workspaceSlugConflict() error {
	return workspaceSettingsFailure(http.StatusConflict, "workspace_slug_conflict", "Workspace slug already exists")
}

func (api *workspaceSettingsAPI) applyWorkspaceUpdate(ctx context.Context, actor organizationActor, update workspaceSettingsUpdate) (workspaceSettingsRecord, string, error) {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return workspaceSettingsRecord{}, "", err
	}
	defer func() { _ = tx.Rollback(context.WithoutCancel(ctx)) }()

	var previousName, lifecycleStatus string
	err = tx.QueryRow(ctx,
		`select name, lifecycle_status::text from organizations where id=$1 for update`,
		actor.organizationID).Scan(&previousName, &lifecycleStatus)
	if errors.Is(err, pgx.ErrNoRows) || err == nil && lifecycleStatus != "active" {
		return workspaceSettingsRecord{}, "", workspaceNotFound()
	}
	if err != nil {
		return workspaceSettingsRecord{}, "", err
	}

	record, err := scanWorkspaceSettingsRecord(tx.QueryRow(ctx, `
        update organizations
        set name=coalesce($2, name), slug=coalesce($3, slug), updated_at=now()
        where id=$1 and lifecycle_status='active'
        returning `+workspaceSettingsColumns,
		actor.organizationID, update.name, update.slug))
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == organizationsSlugConstraint {
			return workspaceSettingsRecord{}, "", workspaceSlugConflict()
		}
		return workspaceSettingsRecord{}, "", err
	}

	if update.name != nil {
		if err := api.syncWorkosOrganizationName(ctx, record.WorkosOrganizationID, *update.name); err != nil {
			slog.WarnContext(ctx, "workspace_settings_workos_sync_failed",
				"organization_id", actor.organizationID,
				"workos_organization_id", record.WorkosOrganizationID,
				"error", err,
			)
			return workspaceSettingsRecord{}, "", workspaceSettingsFailure(http.StatusInternalServerError, "workspace_identity_unavailable", "WorkOS organization identity is unavailable")
		}
	}

	commitCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), workspaceSettingsCommitTimeout)
	defer cancel()
	if err := tx.Commit(commitCtx); err != nil {
		if update.name != nil {
			slog.ErrorContext(ctx, "workspace_settings_commit_failed_after_workos_sync",
				"organization_id", actor.organizationID,
				"workos_organization_id", record.WorkosOrganizationID,
				"error", err,
			)
		}
		return workspaceSettingsRecord{}, "", err
	}
	return record, previousName, nil
}

func (api *workspaceSettingsAPI) syncWorkosOrganizationName(ctx context.Context, workosOrganizationID, name string) error {
	if api.workos == nil {
		return errors.New("workos server integration is not configured")
	}
	return api.workos.UpdateOrganizationName(ctx, workosOrganizationID, name)
}

func (api *workspaceSettingsAPI) archiveWorkspace(r *http.Request, actor organizationActor) (any, int, error) {
	if !hasOrganizationCapability(actor.role, "workspace:update") {
		return nil, 0, workspaceSettingsFailure(http.StatusForbidden, "forbidden", "Only workspace admins can archive workspaces")
	}
	var organizationID string
	err := api.pool.QueryRow(r.Context(), `
        update organizations
        set lifecycle_status='archived', archived_at=now(), updated_at=now()
        where id=$1 and lifecycle_status='active'
        returning id`, actor.organizationID).Scan(&organizationID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, 0, workspaceNotFound()
	}
	if err != nil {
		return nil, 0, err
	}
	api.publishActivity(r.Context(), activityLogEventInput{
		ActorKind:      "user",
		ActorUserID:    actor.userID,
		EventType:      "workspace_archived",
		OrganizationID: organizationID,
		Payload:        map[string]any{"lifecycleStatus": "archived"},
		TargetID:       organizationID,
		TargetKind:     "organization",
	})
	return nil, http.StatusNoContent, nil
}
