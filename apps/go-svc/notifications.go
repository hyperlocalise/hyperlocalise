package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	notificationsRequestTimeout = 30 * time.Second
	notificationsBodyLimit      = 64 << 10
)

type notificationsAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
}

type notificationsActor struct {
	userID, organizationID, role string
}

func (a notificationsActor) canReadAllTeams() bool {
	return a.role == "admin" || a.role == "localization_manager"
}

type notificationsError struct {
	status        int
	code, message string
}

func (e *notificationsError) Error() string { return e.code }

func notificationsFailure(status int, code, message string) error {
	return &notificationsError{status: status, code: code, message: message}
}

func missingNotification() error {
	return notificationsFailure(404, "notification_not_found", "Notification not found")
}

func invalidNotificationID() error {
	return notificationsFailure(400, "invalid_issue_notification_id", "Invalid issue notification id")
}

func notificationsJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "notifications_response_write_failed")
	}
}

func writeNotificationsError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *notificationsError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "notifications_request_failed", phase, err)
		failure = &notificationsError{500, "internal_error", "Internal server error"}
	} else {
		logRequestFailure(r, "notifications_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	notificationsJSON(r.Context(), w, failure.status, map[string]string{"error": failure.code, "message": failure.message})
}

func (api *notificationsAPI) actor(ctx context.Context, claims AuthClaims, slug string) (notificationsActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return notificationsActor{}, mapOrganizationAccessError(err, notificationsFailure)
	}
	return notificationsActor(resolved), nil
}

func (api *notificationsAPI) handle(fn func(*http.Request, notificationsActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if denyBrowserMutation(r) {
			writeNotificationsError(w, r, "origin_guard", notificationsFailure(403, "forbidden", "Cross-origin request denied"))
			return
		}
		if api.pool == nil {
			writeNotificationsError(w, r, "availability", notificationsFailure(503, "notifications_unavailable", "Notifications are unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), notificationsRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeNotificationsError(w, r, "auth", notificationsFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeNotificationsError(w, r, "resolve_actor", err)
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, notificationsBodyLimit)
		value, status, err := fn(r, actor)
		if err != nil {
			writeNotificationsError(w, r, "handle", err)
			return
		}
		if status == http.StatusNoContent {
			w.WriteHeader(status)
			return
		}
		notificationsJSON(r.Context(), w, status, value)
	})
}

func (api *notificationsAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	route := func(pattern string, fn func(*http.Request, notificationsActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+orgRoutePrefix+"/notifications", api.listNotificationsHandler)
	route("GET "+orgRoutePrefix+"/notifications/unread-count", api.unreadCountHandler)
	route("POST "+orgRoutePrefix+"/notifications/read-all", api.readAllHandler)
	route("GET "+orgRoutePrefix+"/notifications/{notificationId}", api.getNotificationHandler)
	route("POST "+orgRoutePrefix+"/notifications/{notificationId}/read", api.markReadHandler)
	route("GET "+orgRoutePrefix+"/notification-preferences", api.getPreferencesHandler)
	route("PUT "+orgRoutePrefix+"/notification-preferences", api.putPreferencesHandler)
	route("GET "+orgRoutePrefix+"/mentions", api.mentionSuggestionsHandler)
}

type notificationListQuery struct {
	unreadOnly bool
	limit      int
	offset     int
}

func invalidNotificationsQuery() error {
	return notificationsFailure(400, "invalid_issue_notifications_query", "Invalid issue notifications query")
}

func parseNotificationListQuery(r *http.Request) (notificationListQuery, error) {
	q := r.URL.Query()
	out := notificationListQuery{limit: 50, offset: 0}
	if raw := strings.TrimSpace(q.Get("unreadOnly")); raw != "" {
		switch raw {
		case "true":
			out.unreadOnly = true
		case "false":
			out.unreadOnly = false
		default:
			return out, invalidNotificationsQuery()
		}
	}
	if raw := strings.TrimSpace(q.Get("limit")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 1 || n > 100 {
			return out, invalidNotificationsQuery()
		}
		out.limit = n
	}
	if raw := strings.TrimSpace(q.Get("offset")); raw != "" {
		n, err := strconv.Atoi(raw)
		if err != nil || n < 0 {
			return out, invalidNotificationsQuery()
		}
		out.offset = n
	}
	return out, nil
}

func (api *notificationsAPI) listNotificationsHandler(r *http.Request, actor notificationsActor) (any, int, error) {
	query, err := parseNotificationListQuery(r)
	if err != nil {
		return nil, 0, err
	}
	orgWide := actor.canReadAllTeams()
	args := []any{actor.organizationID, actor.userID, orgWide}
	where := `n.organization_id = $1 and n.recipient_user_id = $2 and ` + formatQaProjectTeamAccessSQL(3, 2, 1)
	if query.unreadOnly {
		where += " and n.read_at is null"
	}

	var total int
	if err := api.pool.QueryRow(r.Context(),
		`select count(*) from issue_notifications n join projects p on p.id = n.project_id where `+where,
		args...,
	).Scan(&total); err != nil {
		return nil, 0, err
	}

	listArgs := append(append([]any{}, args...), query.limit, query.offset)
	rows, err := api.pool.Query(r.Context(), `
        select n.id, n.organization_id, n.project_id, n.issue_id, n.qa_run_id, n.type, n.payload, n.read_at, n.created_at,
               n.actor_user_id, u.first_name, u.last_name, u.email, u.avatar_url
        from issue_notifications n
        join projects p on p.id = n.project_id
        left join users u on u.id = n.actor_user_id
        where `+where+`
        order by n.created_at desc, n.id desc
        limit $`+strconv.Itoa(len(args)+1)+` offset $`+strconv.Itoa(len(args)+2),
		listArgs...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	notifications := []map[string]any{}
	for rows.Next() {
		notification, err := scanNotificationRow(rows)
		if err != nil {
			return nil, 0, err
		}
		notifications = append(notifications, notification)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}
	return map[string]any{"notifications": notifications, "total": total}, 200, nil
}

func (api *notificationsAPI) unreadCountHandler(r *http.Request, actor notificationsActor) (any, int, error) {
	orgWide := actor.canReadAllTeams()
	var count int
	err := api.pool.QueryRow(r.Context(), `
        select count(*) from issue_notifications n
        join projects p on p.id = n.project_id
        where n.organization_id = $1 and n.recipient_user_id = $2 and `+formatQaProjectTeamAccessSQL(3, 2, 1)+`
        and n.read_at is null`,
		actor.organizationID, actor.userID, orgWide,
	).Scan(&count)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"unreadCount": count}, 200, nil
}

func scanNotificationRow(rows pgx.Rows) (map[string]any, error) {
	var (
		id, organizationID, projectID, notifType       string
		issueID, qaRunID                               *string
		payloadRaw                                     []byte
		readAt                                         *time.Time
		createdAt                                      time.Time
		actorUserID, actorFirst, actorLast, actorEmail *string
		actorAvatar                                    *string
	)
	if err := rows.Scan(
		&id, &organizationID, &projectID, &issueID, &qaRunID, &notifType, &payloadRaw, &readAt, &createdAt,
		&actorUserID, &actorFirst, &actorLast, &actorEmail, &actorAvatar,
	); err != nil {
		return nil, err
	}
	return map[string]any{
		"id":             id,
		"organizationId": organizationID,
		"projectId":      projectID,
		"issueId":        issueID,
		"qaRunId":        qaRunID,
		"type":           notifType,
		"payload":        json.RawMessage(payloadRaw),
		"actor":          formatNotificationActor(actorUserID, actorFirst, actorLast, actorEmail, actorAvatar),
		"readAt":         readAt,
		"createdAt":      createdAt,
	}, nil
}

func formatNotificationActor(userID, first, last, email, avatarURL *string) map[string]any {
	if userID == nil {
		return nil
	}
	display := trimSpaceJoin(stringFromPtr(first), stringFromPtr(last))
	if display == "" {
		display = stringFromPtr(email)
	}
	if display == "" {
		display = *userID
	}
	return map[string]any{
		"userId":      *userID,
		"displayName": display,
		"email":       stringFromPtr(email),
		"avatarUrl":   avatarURL,
	}
}
