package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/activitylog"
	"github.com/jackc/pgx/v5"
	"github.com/workos/workos-go/v10"
)

const activityLogRequestTimeout = 30 * time.Second

var implementedActivityEventTypes = []string{
	"member_invited",
	"member_invite_resent",
	"member_role_changed",
	"member_removed",
	"workspace_updated",
	"personal_access_token_created",
	"personal_access_token_revoked",
	"integration_connected",
	"integration_disconnected",
	"project_created",
	"project_deleted",
	"project_settings_changed",
	"glossary_created",
	"glossary_deleted",
	"glossary_imported",
	"glossary_exported",
	"glossary_project_attached",
	"glossary_project_detached",
	"translation_memory_created",
	"translation_memory_deleted",
	"translation_memory_imported",
	"translation_memory_exported",
	"translation_memory_project_attached",
	"translation_memory_project_detached",
	"translation_memory_action_rejected",
	"job_created",
	"job_cancelled",
	"job_failed",
	"automation_run_started",
	"automation_enabled",
	"automation_disabled",
	"file_uploaded",
	"file_translations_imported",
	"string_segment_approved",
	"string_segment_status_changed",
	"string_segment_hidden",
	"string_segment_unhidden",
	"string_segment_locked",
	"string_segment_unlocked",
	"string_segment_commented",
}

var activityLogRanges = map[string]struct{}{
	"24h": {},
	"7d":  {},
	"30d": {},
	"all": {},
}

type activityLogAPI struct {
	pool       dictionaryPool
	membership func(context.Context, string) (*workos.UserOrganizationMembership, error)
}

type activityLogActor struct {
	userID, organizationID, organizationSlug, role string
}

func (a activityLogActor) canReadActivityLogs() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

type activityLogError struct {
	status        int
	code, message string
}

func (e *activityLogError) Error() string { return e.code }

func activityLogFailure(status int, code, message string) error {
	return &activityLogError{status, code, message}
}

func activityLogJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if value == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "activity_log_response_write_failed")
	}
}

func writeActivityLogError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *activityLogError
	if !errors.As(err, &failure) {
		slog.ErrorContext(r.Context(), "activity_log_request_failed", "phase", phase, "path", r.URL.Path, "error", err.Error())
		failure = &activityLogError{500, "internal_error", "Internal server error"}
	} else if failure.status >= 500 {
		slog.ErrorContext(r.Context(), "activity_log_request_failed", "phase", phase, "path", r.URL.Path, "code", failure.code)
	}
	activityLogJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func formatActivityLogTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func (api *activityLogAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	registerAuthenticated(mux, verifier, "GET "+orgRoutePrefix+"/activity-logs", http.HandlerFunc(api.serveHTTP))
}

func (api *activityLogAPI) actor(ctx context.Context, claims AuthClaims, slug string) (activityLogActor, error) {
	var actor activityLogActor
	actor.organizationSlug = slug
	var membershipID, workosOrg string
	if strings.HasPrefix(claims.UserID, "invited_user_") {
		return actor, activityLogFailure(403, "organization_access_denied", "Organization access denied")
	}
	err := api.pool.QueryRow(ctx, `select u.id, o.id, m.workos_membership_id, o.workos_organization_id
        from users u join organization_memberships m on m.user_id=u.id join organizations o on o.id=m.organization_id
        where u.workos_user_id=$1 and o.slug=$2 and o.lifecycle_status='active'
        and m.workos_membership_id is not null and m.workos_membership_id not in ('', 'replacing')`,
		claims.UserID, slug).Scan(&actor.userID, &actor.organizationID, &membershipID, &workosOrg)
	if errors.Is(err, pgx.ErrNoRows) {
		return actor, activityLogFailure(403, "organization_access_denied", "Organization access denied")
	}
	if err != nil {
		return actor, err
	}
	if api.membership == nil {
		return actor, activityLogFailure(503, "workos_membership_lookup_failed", "WorkOS membership lookup failed")
	}
	member, err := api.membership(ctx, membershipID)
	if err != nil {
		var apiErr *workos.APIError
		if errors.As(err, &apiErr) && apiErr.StatusCode == 404 {
			return actor, activityLogFailure(403, "organization_access_denied", "Organization access denied")
		}
		return actor, activityLogFailure(503, "workos_membership_lookup_failed", "WorkOS membership lookup failed")
	}
	if member == nil || member.ID != membershipID || member.UserID != claims.UserID || member.OrganizationID != workosOrg || member.Status != "active" || member.Role == nil {
		return actor, activityLogFailure(403, "organization_access_denied", "Organization access denied")
	}
	switch member.Role.Slug {
	case "admin", "localization_manager", "member", "developer", "translator", "reviewer":
		actor.role = member.Role.Slug
	default:
		return actor, activityLogFailure(403, "organization_access_denied", "Organization access denied")
	}
	return actor, nil
}

func (api *activityLogAPI) serveHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	if api.pool == nil {
		writeActivityLogError(w, r, "availability", activityLogFailure(503, "activity_log_unavailable", "Activity log is unavailable"))
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), activityLogRequestTimeout)
	defer cancel()
	r = r.WithContext(ctx)
	claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
	if !ok {
		writeActivityLogError(w, r, "auth", activityLogFailure(401, "unauthorized", "Unauthorized"))
		return
	}
	actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
	if err != nil {
		writeActivityLogError(w, r, "resolve_actor", err)
		return
	}
	if !actor.canReadActivityLogs() {
		writeActivityLogError(w, r, "capability", activityLogFailure(403, "activity_logs_read_forbidden", "Activity logs are restricted to workspace operators"))
		return
	}
	query, err := parseActivityLogQuery(r.URL.Query())
	if err != nil {
		writeActivityLogError(w, r, "query", err)
		return
	}
	value, status, err := api.listEvents(ctx, actor, query)
	if err != nil {
		writeActivityLogError(w, r, "handle", err)
		return
	}
	activityLogJSON(ctx, w, status, value)
}

type activityLogActorFilter struct {
	kind   string // system | agent | api_key | user
	userID string
}

type activityLogQuery struct {
	actor      *activityLogActorFilter
	cursor     string
	eventTypes []string
	limit      int
	rangeKey   string
}

type activityLogActorView struct {
	CredentialID *string `json:"credentialId"`
	DisplayName  string  `json:"displayName"`
	Kind         string  `json:"kind"`
	UserID       *string `json:"userId"`
}

type activityLogTargetView struct {
	DisplayName *string `json:"displayName"`
	Href        *string `json:"href"`
	ID          string  `json:"id"`
	Kind        string  `json:"kind"`
}

type activityLogListItem struct {
	Actor     activityLogActorView  `json:"actor"`
	CreatedAt string                `json:"createdAt"`
	EventType string                `json:"eventType"`
	ID        string                `json:"id"`
	Payload   map[string]any        `json:"payload"`
	Target    activityLogTargetView `json:"target"`
}

type activityLogListResult struct {
	ActivityLogs []activityLogListItem  `json:"activityLogs"`
	Actors       []activityLogActorView `json:"actors"`
	NextCursor   *string                `json:"nextCursor"`
}

func parseActivityLogQuery(values url.Values) (activityLogQuery, error) {
	query := activityLogQuery{
		eventTypes: []string{},
		limit:      50,
		rangeKey:   "all",
	}

	if raw := strings.TrimSpace(values.Get("actor")); raw != "" {
		if len(raw) > 160 {
			return query, activityLogFailure(400, "invalid_activity_log_query", "Activity log query is invalid")
		}
		switch {
		case raw == "system" || raw == "agent" || raw == "api_key":
			query.actor = &activityLogActorFilter{kind: raw}
		case strings.HasPrefix(raw, "user:"):
			userID := strings.TrimPrefix(raw, "user:")
			if uuid.Validate(userID) != nil {
				return query, activityLogFailure(400, "invalid_activity_log_query", "Activity log query is invalid")
			}
			query.actor = &activityLogActorFilter{kind: "user", userID: userID}
		default:
			return query, activityLogFailure(400, "invalid_activity_log_query", "Activity log query is invalid")
		}
	}

	if raw := strings.TrimSpace(values.Get("cursor")); raw != "" {
		if len(raw) > 2048 {
			return query, activityLogFailure(400, "invalid_activity_log_query", "Activity log query is invalid")
		}
		query.cursor = raw
	}

	for _, raw := range values["eventTypes"] {
		eventType := strings.TrimSpace(raw)
		if eventType == "" {
			continue
		}
		if !activitylog.IsImplementedEventType(eventType) {
			return query, activityLogFailure(400, "invalid_activity_log_query", "Activity log query is invalid")
		}
		query.eventTypes = append(query.eventTypes, eventType)
	}

	if raw := strings.TrimSpace(values.Get("limit")); raw != "" {
		limit, err := strconv.Atoi(raw)
		if err != nil || limit < 1 || limit > 100 {
			return query, activityLogFailure(400, "invalid_activity_log_query", "Activity log query is invalid")
		}
		query.limit = limit
	}

	if raw := strings.TrimSpace(values.Get("range")); raw != "" {
		if _, ok := activityLogRanges[raw]; !ok {
			return query, activityLogFailure(400, "invalid_activity_log_query", "Activity log query is invalid")
		}
		query.rangeKey = raw
	}

	return query, nil
}

func activityLogFilterFingerprint(query activityLogQuery) (string, error) {
	eventTypes := append([]string(nil), query.eventTypes...)
	sort.Strings(eventTypes)

	var actor any
	if query.actor != nil {
		if query.actor.kind == "user" {
			actor = map[string]string{"kind": "user", "userId": query.actor.userID}
		} else {
			actor = query.actor.kind
		}
	}

	payload, err := json.Marshal(struct {
		Actor      any      `json:"actor"`
		EventTypes []string `json:"eventTypes"`
		ProjectID  any      `json:"projectId"`
		Range      string   `json:"range"`
		SourcePath any      `json:"sourcePath"`
	}{
		Actor:      actor,
		EventTypes: eventTypes,
		ProjectID:  nil,
		Range:      query.rangeKey,
		SourcePath: nil,
	})
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:]), nil
}

type activityLogCursor struct {
	createdAt time.Time
	id        string
}

func encodeActivityLogCursor(cursor activityLogCursor, fingerprint string) string {
	payload, err := json.Marshal(struct {
		CreatedAt         string `json:"createdAt"`
		FilterFingerprint string `json:"filterFingerprint"`
		ID                string `json:"id"`
	}{
		CreatedAt:         formatActivityLogTime(cursor.createdAt),
		FilterFingerprint: fingerprint,
		ID:                cursor.id,
	})
	if err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(payload)
}

func decodeActivityLogCursor(raw, fingerprint string) (activityLogCursor, error) {
	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		return activityLogCursor{}, activityLogFailure(400, "invalid_activity_log_cursor", "Activity log cursor is invalid")
	}
	var payload struct {
		CreatedAt         string `json:"createdAt"`
		FilterFingerprint string `json:"filterFingerprint"`
		ID                string `json:"id"`
	}
	if err := json.Unmarshal(decoded, &payload); err != nil {
		return activityLogCursor{}, activityLogFailure(400, "invalid_activity_log_cursor", "Activity log cursor is invalid")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, payload.CreatedAt)
	if err != nil {
		createdAt, err = time.Parse(time.RFC3339, payload.CreatedAt)
	}
	if err != nil || uuid.Validate(payload.ID) != nil || payload.FilterFingerprint != fingerprint {
		return activityLogCursor{}, activityLogFailure(400, "invalid_activity_log_cursor", "Activity log cursor is invalid")
	}
	return activityLogCursor{createdAt: createdAt, id: payload.ID}, nil
}

func activityLogActorDisplayName(kind string, firstName, lastName *string) string {
	switch kind {
	case "system":
		return "System"
	case "agent":
		return "Agent"
	case "api_key":
		return "API credential"
	default:
		return activityLogPersonName(firstName, lastName)
	}
}

func activityLogPersonName(firstName, lastName *string) string {
	parts := make([]string, 0, 2)
	if firstName != nil && strings.TrimSpace(*firstName) != "" {
		parts = append(parts, strings.TrimSpace(*firstName))
	}
	if lastName != nil && strings.TrimSpace(*lastName) != "" {
		parts = append(parts, strings.TrimSpace(*lastName))
	}
	name := strings.TrimSpace(strings.Join(parts, " "))
	if name == "" {
		return "Deleted user"
	}
	return name
}

func (api *activityLogAPI) listEvents(ctx context.Context, actor activityLogActor, query activityLogQuery) (any, int, error) {
	fingerprint, err := activityLogFilterFingerprint(query)
	if err != nil {
		return nil, 0, err
	}

	var cursor *activityLogCursor
	if query.cursor != "" {
		decoded, err := decodeActivityLogCursor(query.cursor, fingerprint)
		if err != nil {
			return nil, 0, err
		}
		cursor = &decoded
	}

	eventTypes := query.eventTypes
	if len(eventTypes) == 0 {
		eventTypes = implementedActivityEventTypes
	}

	args := []any{actor.organizationID, eventTypes}
	conditions := []string{
		"e.organization_id = $1",
		"e.event_type = any($2::text[])",
	}
	argN := 3

	switch query.rangeKey {
	case "24h":
		conditions = append(conditions, "e.created_at > clock_timestamp() - interval '24 hours'")
	case "7d":
		conditions = append(conditions, "e.created_at > clock_timestamp() - interval '7 days'")
	case "30d":
		conditions = append(conditions, "e.created_at > clock_timestamp() - interval '30 days'")
	}

	if query.actor != nil {
		if query.actor.kind == "user" {
			conditions = append(conditions, "e.actor_kind = 'user'", "e.actor_user_id = $"+strconv.Itoa(argN))
			args = append(args, query.actor.userID)
			argN++
		} else {
			conditions = append(conditions, "e.actor_kind = $"+strconv.Itoa(argN))
			args = append(args, query.actor.kind)
			argN++
		}
	}

	if cursor != nil {
		conditions = append(conditions,
			"(e.created_at < $"+strconv.Itoa(argN)+" or (e.created_at = $"+strconv.Itoa(argN)+" and e.id < $"+strconv.Itoa(argN+1)+"::uuid))")
		args = append(args, cursor.createdAt, cursor.id)
		argN += 2
	}

	args = append(args, query.limit+1)
	limitParam := argN

	rows, err := api.pool.Query(ctx, `
        select e.actor_credential_id, e.actor_kind, e.actor_user_id, e.created_at, e.event_type, e.id,
               e.payload, e.target_id, e.target_kind, u.first_name, u.last_name
        from organization_activity_events e
        left join users u on u.id = e.actor_user_id
        where `+strings.Join(conditions, " and ")+`
        order by e.created_at desc, e.id desc
        limit $`+strconv.Itoa(limitParam), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	type eventRow struct {
		actorCredentialID *string
		actorKind         string
		actorUserID       *string
		createdAt         time.Time
		eventType         string
		id                string
		payload           map[string]any
		targetID          string
		targetKind        string
		userFirstName     *string
		userLastName      *string
	}
	events := make([]eventRow, 0)
	for rows.Next() {
		var row eventRow
		var payloadRaw []byte
		if err := rows.Scan(
			&row.actorCredentialID,
			&row.actorKind,
			&row.actorUserID,
			&row.createdAt,
			&row.eventType,
			&row.id,
			&payloadRaw,
			&row.targetID,
			&row.targetKind,
			&row.userFirstName,
			&row.userLastName,
		); err != nil {
			return nil, 0, err
		}
		row.payload = map[string]any{}
		if len(payloadRaw) > 0 && string(payloadRaw) != "null" {
			_ = json.Unmarshal(payloadRaw, &row.payload)
		}
		events = append(events, row)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	actors, err := api.listActors(ctx, actor.organizationID)
	if err != nil {
		return nil, 0, err
	}

	hasNext := len(events) > query.limit
	page := events
	if hasNext {
		page = events[:query.limit]
	}

	targetInputs := make([]activityLogTargetInput, 0, len(page))
	for _, row := range page {
		targetInputs = append(targetInputs, activityLogTargetInput{
			targetID:   row.targetID,
			targetKind: row.targetKind,
			payload:    row.payload,
		})
	}
	targets, err := api.loadTargetViews(ctx, actor.organizationID, actor.organizationSlug, targetInputs)
	if err != nil {
		return nil, 0, err
	}

	activityLogs := make([]activityLogListItem, 0, len(page))
	for _, row := range page {
		key := activityLogTargetKey(row.targetKind, row.targetID)
		target, ok := targets[key]
		if !ok {
			target = activityLogTargetView{ID: row.targetID, Kind: row.targetKind}
		}
		activityLogs = append(activityLogs, activityLogListItem{
			Actor: activityLogActorView{
				CredentialID: row.actorCredentialID,
				DisplayName:  activityLogActorDisplayName(row.actorKind, row.userFirstName, row.userLastName),
				Kind:         row.actorKind,
				UserID:       row.actorUserID,
			},
			CreatedAt: formatActivityLogTime(row.createdAt),
			EventType: row.eventType,
			ID:        row.id,
			Payload:   row.payload,
			Target:    target,
		})
	}

	var nextCursor *string
	if hasNext && len(page) > 0 {
		last := page[len(page)-1]
		encoded := encodeActivityLogCursor(activityLogCursor{createdAt: last.createdAt, id: last.id}, fingerprint)
		nextCursor = &encoded
	}

	return activityLogListResult{
		ActivityLogs: activityLogs,
		Actors:       actors,
		NextCursor:   nextCursor,
	}, 200, nil
}

func (api *activityLogAPI) listActors(ctx context.Context, organizationID string) ([]activityLogActorView, error) {
	rows, err := api.pool.Query(ctx, `
        select distinct e.actor_user_id, u.first_name, u.last_name
        from organization_activity_events e
        inner join users u on u.id = e.actor_user_id
        where e.organization_id = $1 and e.actor_kind = 'user' and e.actor_user_id is not null`, organizationID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	actors := make([]activityLogActorView, 0)
	for rows.Next() {
		var userID string
		var firstName, lastName *string
		if err := rows.Scan(&userID, &firstName, &lastName); err != nil {
			return nil, err
		}
		id := userID
		actors = append(actors, activityLogActorView{
			CredentialID: nil,
			DisplayName:  activityLogPersonName(firstName, lastName),
			Kind:         "user",
			UserID:       &id,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(actors, func(i, j int) bool {
		return actors[i].DisplayName < actors[j].DisplayName
	})
	return actors, nil
}
