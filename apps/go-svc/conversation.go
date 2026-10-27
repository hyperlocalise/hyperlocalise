package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	conversationsRequestTimeout   = 30 * time.Second
	conversationListDefaultLimit  = 50
	conversationListMaxLimit      = 100
	conversationMessagesLimit     = 50
	conversationProjectIDMaxUnits = 128
	conversationTimeLayout        = "2006-01-02T15:04:05.000Z"
)

var conversationCursorPattern = regexp.MustCompile(`^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:\d{2})?)?)?)?$`)

type conversationAPI struct {
	pool       dictionaryPool
	membership organizationMembershipLookup
}

type conversationActor struct {
	userID, organizationID, role string
}

func (a conversationActor) canReadAllTeams() bool {
	return hasOrganizationCapability(a.role, "teams:write")
}

func (a conversationActor) canRunAIActions() bool {
	return hasOrganizationCapability(a.role, "ai_actions:run")
}

type conversationError struct {
	status        int
	code, message string
}

func (e *conversationError) Error() string { return e.code }

func conversationFailure(status int, code, message string) error {
	return &conversationError{status: status, code: code, message: message}
}

func conversationNotFound() error {
	return conversationFailure(http.StatusNotFound, "not_found", "")
}

func invalidConversationQuery() error {
	return conversationFailure(http.StatusBadRequest, "invalid_query", "")
}

func conversationJSON(ctx context.Context, w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(value); err != nil {
		slog.WarnContext(ctx, "conversation_response_write_failed")
	}
}

func writeConversationError(w http.ResponseWriter, r *http.Request, phase string, err error) {
	var failure *conversationError
	if !errors.As(err, &failure) {
		logRequestFailure(r, "conversation_request_failed", phase, err)
		failure = &conversationError{status: 500, code: "internal_error", message: "Internal server error"}
	} else {
		logRequestFailure(r, "conversation_request_failed", phase, err, "status", failure.status, "code", failure.code)
	}
	body := map[string]string{"error": failure.code}
	if failure.message != "" {
		body["message"] = failure.message
	}
	conversationJSON(r.Context(), w, failure.status, body)
}

func (api *conversationAPI) register(mux *http.ServeMux, verifier SessionVerifier) {
	conversations := orgRoutePrefix + "/conversations"
	conversation := conversations + "/{conversationId}"
	route := func(pattern string, fn func(*http.Request, conversationActor) (any, int, error)) {
		registerAuthenticated(mux, verifier, pattern, api.handle(fn))
	}
	route("GET "+conversations, api.listHandler)
	route("GET "+conversation, api.getHandler)
	route("GET "+conversation+"/messages", api.messagesHandler)
	route("GET "+conversation+"/jobs", api.jobsHandler)
}

func (api *conversationAPI) actor(ctx context.Context, claims AuthClaims, slug string) (conversationActor, error) {
	resolved, err := resolveOrganizationActor(ctx, api.pool, api.membership, claims, slug)
	if err != nil {
		return conversationActor{}, mapOrganizationAccessError(err, conversationFailure)
	}
	return conversationActor(resolved), nil
}

func (api *conversationAPI) handle(fn func(*http.Request, conversationActor) (any, int, error)) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		if api.pool == nil {
			writeConversationError(w, r, "availability", conversationFailure(503, "conversations_unavailable", "Conversations are unavailable"))
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), conversationsRequestTimeout)
		defer cancel()
		r = r.WithContext(ctx)
		claims, ok := ctx.Value(authContextKey{}).(AuthClaims)
		if !ok {
			writeConversationError(w, r, "auth", conversationFailure(401, "unauthorized", "Authentication required"))
			return
		}
		actor, err := api.actor(ctx, claims, r.PathValue("organizationSlug"))
		if err != nil {
			writeConversationError(w, r, "resolve_actor", err)
			return
		}
		value, status, err := fn(r, actor)
		if err != nil {
			writeConversationError(w, r, "handle", err)
			return
		}
		conversationJSON(ctx, w, status, value)
	})
}

func conversationIDParam(r *http.Request) (string, error) {
	id := r.PathValue("conversationId")
	if !apiKeyIDPattern.MatchString(id) {
		return "", conversationNotFound()
	}
	return id, nil
}

type conversationListQuery struct {
	status, projectID string
	cursor            *time.Time
	limit             int
}

func parseConversationListQuery(values url.Values) (conversationListQuery, error) {
	query := conversationListQuery{limit: conversationListDefaultLimit}
	single := func(key string) (string, bool, error) {
		raw, ok := values[key]
		if !ok {
			return "", false, nil
		}
		if len(raw) != 1 {
			return "", false, invalidConversationQuery()
		}
		return raw[0], true, nil
	}

	status, ok, err := single("status")
	if err != nil {
		return query, err
	}
	if ok {
		if status != "active" && status != "archived" {
			return query, invalidConversationQuery()
		}
		query.status = status
	}

	projectID, ok, err := single("projectId")
	if err != nil {
		return query, err
	}
	if ok {
		query.projectID = normalizeDictionaryProjectID(projectID)
		if query.projectID == "" || utf16Length(query.projectID) > conversationProjectIDMaxUnits {
			return query, invalidConversationQuery()
		}
	}

	rawLimit, ok, err := single("limit")
	if err != nil {
		return query, err
	}
	if ok {
		limit := jsNumber(rawLimit)
		if math.IsNaN(limit) || limit != math.Trunc(limit) || limit < 1 || limit > conversationListMaxLimit {
			return query, invalidConversationQuery()
		}
		query.limit = int(limit)
	}

	cursor, ok, err := single("cursor")
	if err != nil {
		return query, err
	}
	if ok {
		query.cursor = parseConversationCursor(cursor)
	}
	return query, nil
}

func parseConversationCursor(raw string) *time.Time {
	match := conversationCursorPattern.FindStringSubmatch(strings.TrimSpace(raw))
	if match == nil {
		return nil
	}
	number := func(value string, fallback int) int {
		if value == "" {
			return fallback
		}
		parsed, _ := strconv.Atoi(value)
		return parsed
	}
	year, month, day := number(match[1], 0), number(match[2], 1), number(match[3], 1)
	hour, minute, second := number(match[4], 0), number(match[5], 0), number(match[6], 0)
	millis := 0
	if fraction := match[7]; fraction != "" {
		millis = number((fraction + "00")[:3], 0)
	}
	if month < 1 || month > 12 || day < 1 || day > 31 || minute > 59 || second > 59 ||
		hour > 24 || (hour == 24 && (minute != 0 || second != 0 || millis != 0)) {
		return nil
	}
	location := time.UTC
	if offset := match[8]; offset != "" && offset != "Z" {
		offsetHours, offsetMinutes := number(offset[1:3], 0), number(offset[4:6], 0)
		if offsetHours > 23 || offsetMinutes > 59 {
			return nil
		}
		seconds := offsetHours*3600 + offsetMinutes*60
		if offset[0] == '-' {
			seconds = -seconds
		}
		location = time.FixedZone("", seconds)
	}
	value := time.Date(year, time.Month(month), day, hour, minute, second, millis*int(time.Millisecond), location).UTC()
	return &value
}

func formatConversationTime(t time.Time) string {
	return t.UTC().Format(conversationTimeLayout)
}

func formatConversationOptionalTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	formatted := formatConversationTime(*t)
	return &formatted
}
