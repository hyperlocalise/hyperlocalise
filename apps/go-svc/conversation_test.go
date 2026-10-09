package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/testenv"
	"github.com/stretchr/testify/require"
	"github.com/workos/workos-go/v10"
)

var conversationTestBase = time.Date(2026, 3, 4, 5, 6, 7, 891234000, time.UTC)

type conversationFixture struct {
	api   *conversationAPI
	scope *testenv.Scope
	email string
}

func newConversationFixture(t *testing.T, role string) conversationFixture {
	t.Helper()
	scope := testenv.Seed(t, testenv.Options{Role: role, WithProject: true})
	var email string
	require.NoError(t, scope.Pool.QueryRow(t.Context(), `select email from users where id=$1`, scope.UserID).Scan(&email))
	return conversationFixture{api: &conversationAPI{pool: scope.Pool, membership: scope.Membership(role)}, scope: scope, email: email}
}

func (f conversationFixture) get(t *testing.T, suffix string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	f.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: f.scope.WorkOSUserID}})
	req := httptest.NewRequest(http.MethodGet, f.scope.OrgPath("/conversations"+suffix), nil)
	req.AddCookie(&http.Cookie{Name: workOSSessionCookieName, Value: "session"})
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, req)
	return rec
}

type conversationSeed struct {
	source, title, status string
	projectID             *string
	lastMessageAt         time.Time
	noInbox               bool
}

func mustConversation(t *testing.T, scope *testenv.Scope, seed conversationSeed) string {
	t.Helper()
	if seed.source == "" {
		seed.source = "chat_ui"
	}
	if seed.title == "" {
		seed.title = "Conversation"
	}
	if seed.status == "" {
		seed.status = "active"
	}
	if seed.lastMessageAt.IsZero() {
		seed.lastMessageAt = conversationTestBase
	}
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into interactions (id, organization_id, project_id, source, title, last_message_at, created_at, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7, $7)`,
		id, scope.OrganizationID, seed.projectID, seed.source, seed.title, seed.lastMessageAt, conversationTestBase)
	require.NoError(t, err)
	if !seed.noInbox {
		_, err = scope.Pool.Exec(t.Context(), `
            insert into inbox_items (interaction_id, organization_id, project_id, status) values ($1, $2, $3, $4)`,
			id, scope.OrganizationID, seed.projectID, seed.status)
		require.NoError(t, err)
	}
	return id
}

type conversationMessageSeed struct {
	senderType, text   string
	senderEmail        *string
	parts, attachments *string
	createdAt          time.Time
}

func mustConversationMessage(t *testing.T, scope *testenv.Scope, interactionID string, seed conversationMessageSeed) string {
	t.Helper()
	if seed.senderType == "" {
		seed.senderType = "user"
	}
	if seed.createdAt.IsZero() {
		seed.createdAt = conversationTestBase
	}
	id := uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into interaction_messages (id, interaction_id, sender_type, sender_email, text, parts, attachments, created_at)
        values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8)`,
		id, interactionID, seed.senderType, seed.senderEmail, seed.text, seed.parts, seed.attachments, seed.createdAt)
	require.NoError(t, err)
	return id
}

func mustConversationJob(t *testing.T, scope *testenv.Scope, organizationID, interactionID string, projectID *string, createdAt time.Time) string {
	t.Helper()
	id := "job_" + uuid.NewString()
	_, err := scope.Pool.Exec(t.Context(), `
        insert into jobs (id, organization_id, project_id, kind, status, input_payload, interaction_id, created_at, updated_at)
        values ($1, $2, $3, 'translation', 'queued', '{}'::jsonb, $4, $5, $5)`,
		id, organizationID, projectID, interactionID, createdAt)
	require.NoError(t, err)
	return id
}

func decodeConversationBody(t *testing.T, rec *httptest.ResponseRecorder) map[string]json.RawMessage {
	t.Helper()
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body map[string]json.RawMessage
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	return body
}

func conversationListIDs(t *testing.T, rec *httptest.ResponseRecorder) []string {
	t.Helper()
	var conversations []struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(decodeConversationBody(t, rec)["conversations"], &conversations))
	ids := make([]string, len(conversations))
	for i, conversation := range conversations {
		ids[i] = conversation.ID
	}
	return ids
}

func conversationMessageTexts(t *testing.T, raw json.RawMessage) []string {
	t.Helper()
	var messages []struct {
		Text string `json:"text"`
	}
	require.NoError(t, json.Unmarshal(raw, &messages))
	texts := make([]string, len(messages))
	for i, message := range messages {
		texts[i] = message.Text
	}
	return texts
}

func requireConversationError(t *testing.T, rec *httptest.ResponseRecorder, status int, body string) {
	t.Helper()
	require.Equal(t, status, rec.Code, rec.Body.String())
	require.JSONEq(t, body, rec.Body.String())
}

func TestConversationReadsShape(t *testing.T) {
	f := newConversationFixture(t, "admin")
	projectID := f.scope.ProjectID
	conversationID := mustConversation(t, f.scope, conversationSeed{title: "Translate docs", projectID: &projectID})
	userMessageID := mustConversationMessage(t, f.scope, conversationID, conversationMessageSeed{
		text: "Please translate", senderEmail: ptr("first@example.com"),
		attachments: ptr(`[{"id":"file_1","filename":"en.json","contentType":"application/json","url":"/api/orgs/acme/files/file_1"}]`),
	})
	agentMessageID := mustConversationMessage(t, f.scope, conversationID, conversationMessageSeed{
		senderType: "agent", text: "Done", parts: ptr(`[{"type":"tool-translate","input":{}},{"type":"text","text":"Done"}]`),
		createdAt: conversationTestBase.Add(time.Second),
	})
	translationJobID := mustConversationJob(t, f.scope, f.scope.OrganizationID, conversationID, &projectID, conversationTestBase)
	_, err := f.scope.Pool.Exec(t.Context(), `
        insert into translation_job_details (job_id, type, outcome_kind) values ($1, 'file', 'file_result')`, translationJobID)
	require.NoError(t, err)
	_, err = f.scope.Pool.Exec(t.Context(), `update jobs set status='succeeded', completed_at=$2 where id=$1`,
		translationJobID, conversationTestBase.Add(time.Minute))
	require.NoError(t, err)
	plainJobID := mustConversationJob(t, f.scope, f.scope.OrganizationID, conversationID, nil, conversationTestBase.Add(time.Hour))

	userMessage := fmt.Sprintf(`{"id":%q,"interactionId":%q,"senderType":"user","senderEmail":"first@example.com","text":"Please translate","parts":null,
        "attachments":[{"id":"file_1","filename":"en.json","contentType":"application/json","url":"/api/orgs/acme/files/file_1"}],
        "createdAt":"2026-03-04T05:06:07.891Z"}`, userMessageID, conversationID)
	agentMessage := fmt.Sprintf(`{"id":%q,"interactionId":%q,"senderType":"agent","senderEmail":null,"text":"Done",
        "parts":[{"type":"tool-translate","input":{}},{"type":"text","text":"Done"}],"attachments":null,
        "createdAt":"2026-03-04T05:06:08.891Z"}`, agentMessageID, conversationID)

	require.JSONEq(t, fmt.Sprintf(`{"conversations":[{"id":%q,"title":"Translate docs","source":"chat_ui","status":"active",
        "projectId":%q,"lastMessageAt":"2026-03-04T05:06:07.891Z","createdAt":"2026-03-04T05:06:07.891Z",
        "participantEmail":"first@example.com",
        "lastMessage":{"text":"Done","senderType":"agent","createdAt":"2026-03-04T05:06:08.891Z"}}]}`,
		conversationID, projectID), f.get(t, "").Body.String())

	require.JSONEq(t, fmt.Sprintf(`{"conversation":{"id":%q,"organizationId":%q,"projectId":%q,"source":"chat_ui",
        "title":"Translate docs","sourceThreadId":null,"lastMessageAt":"2026-03-04T05:06:07.891Z",
        "createdAt":"2026-03-04T05:06:07.891Z","updatedAt":"2026-03-04T05:06:07.891Z","status":"active"},
        "messages":[%s,%s]}`, conversationID, f.scope.OrganizationID, projectID, userMessage, agentMessage),
		f.get(t, "/"+conversationID).Body.String())

	require.JSONEq(t, fmt.Sprintf(`{"messages":[%s,%s]}`, userMessage, agentMessage),
		f.get(t, "/"+conversationID+"/messages").Body.String())

	rec := f.get(t, "/"+conversationID+"/jobs")
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.JSONEq(t, fmt.Sprintf(`{"jobs":[
        {"id":%q,"projectId":null,"kind":"translation","type":null,"status":"queued","outcomeKind":null,
         "createdAt":"2026-03-04T06:06:07.891Z","completedAt":null},
        {"id":%q,"projectId":%q,"kind":"translation","type":"file","status":"succeeded","outcomeKind":"file_result",
         "createdAt":"2026-03-04T05:06:07.891Z","completedAt":"2026-03-04T05:07:07.891Z"}]}`,
		plainJobID, translationJobID, projectID), rec.Body.String())
}

func TestConversationReadsAuth(t *testing.T) {
	t.Run("missing session", func(t *testing.T) {
		f := newConversationFixture(t, "admin")
		mux := http.NewServeMux()
		f.api.register(mux, stubSessionVerifier{claims: AuthClaims{UserID: f.scope.WorkOSUserID}})
		rec := httptest.NewRecorder()
		mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, f.scope.OrgPath("/conversations"), nil))
		require.Equal(t, http.StatusUnauthorized, rec.Code)
	})

	t.Run("another organization slug", func(t *testing.T) {
		f := newConversationFixture(t, "admin")
		other := testenv.Seed(t, testenv.Options{Role: "admin"})
		f.scope.Slug = other.Slug
		requireConversationError(t, f.get(t, ""), http.StatusForbidden, `{"error":"organization_access_denied","message":"Organization access denied"}`)
	})

	t.Run("inactive membership", func(t *testing.T) {
		f := newConversationFixture(t, "admin")
		f.api.membership = func(ctx context.Context, id string) (*workos.UserOrganizationMembership, error) {
			member, err := f.scope.Membership("admin")(ctx, id)
			member.Status = "inactive"
			return member, err
		}
		requireConversationError(t, f.get(t, ""), http.StatusForbidden, `{"error":"organization_access_denied","message":"Organization access denied"}`)
	})

	t.Run("membership lookup failure", func(t *testing.T) {
		f := newConversationFixture(t, "admin")
		f.api.membership = func(context.Context, string) (*workos.UserOrganizationMembership, error) {
			return nil, errors.New("workos down")
		}
		requireConversationError(t, f.get(t, ""), http.StatusServiceUnavailable, `{"error":"workos_membership_lookup_failed","message":"Organization membership could not be verified"}`)
	})

	t.Run("unavailable without database", func(t *testing.T) {
		f := newConversationFixture(t, "admin")
		f.api.pool = nil
		requireConversationError(t, f.get(t, ""), http.StatusServiceUnavailable, `{"error":"conversations_unavailable","message":"Conversations are unavailable"}`)
	})
}

func TestConversationReadsTeamAccess(t *testing.T) {
	requireVisible := func(t *testing.T, f conversationFixture, conversationID string, visible bool) {
		t.Helper()
		if visible {
			require.Contains(t, conversationListIDs(t, f.get(t, "")), conversationID)
		} else {
			require.NotContains(t, conversationListIDs(t, f.get(t, "")), conversationID)
		}
		for _, suffix := range []string{"", "/messages", "/jobs"} {
			rec := f.get(t, "/"+conversationID+suffix)
			if visible {
				require.Equal(t, http.StatusOK, rec.Code, "%s: %s", suffix, rec.Body.String())
			} else {
				requireConversationError(t, rec, http.StatusNotFound, `{"error":"not_found"}`)
			}
		}
	}

	t.Run("team-scoped roles need project team membership", func(t *testing.T) {
		f := newConversationFixture(t, "translator")
		defaultProject := f.scope.ProjectID
		onDefault := mustConversation(t, f.scope, conversationSeed{source: "email_agent", projectID: &defaultProject})
		requireVisible(t, f, onDefault, false)
		f.scope.MustTeam(t, "default", "Default", "member")
		requireVisible(t, f, onDefault, true)

		mine := f.scope.MustTeam(t, "mine", "Mine", "member")
		theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
		theirProject := f.scope.MustProject(t, uniqueProjectID("ptheirs"), "Theirs")
		inactiveProject := f.scope.MustProject(t, uniqueProjectID("pinactive"), "Inactive")
		_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, theirProject, theirs)
		require.NoError(t, err)
		_, err = f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2, is_active=false where id=$1`, inactiveProject, mine)
		require.NoError(t, err)
		externalProject := "ext:crowdin:" + uuid.NewString()
		_, err = f.scope.Pool.Exec(t.Context(), `
            insert into projects (id, organization_id, team_id, name, identifier, source, external_provider_kind, external_project_id)
            values ($1, $2, $3, 'Crowdin', $4, 'external_tms', 'crowdin', $5)`,
			externalProject, f.scope.OrganizationID, mine, "PEXT"+strings.ToUpper(uuid.NewString()[:6]), uuid.NewString())
		require.NoError(t, err)

		requireVisible(t, f, mustConversation(t, f.scope, conversationSeed{projectID: &theirProject}), false)
		requireVisible(t, f, mustConversation(t, f.scope, conversationSeed{projectID: &inactiveProject}), true)
		requireVisible(t, f, mustConversation(t, f.scope, conversationSeed{source: "slack_agent", projectID: &externalProject}), true)
	})

	t.Run("owned workspace chats stay visible to their author", func(t *testing.T) {
		f := newConversationFixture(t, "member")
		liveProject := "ext:phrase:" + uuid.NewString()
		ownedUnscoped := mustConversation(t, f.scope, conversationSeed{})
		mustConversationMessage(t, f.scope, ownedUnscoped, conversationMessageSeed{text: "hi", senderEmail: &f.email})
		ownedLive := mustConversation(t, f.scope, conversationSeed{projectID: &liveProject})
		mustConversationMessage(t, f.scope, ownedLive, conversationMessageSeed{text: "hi", senderEmail: &f.email})
		someoneElse := mustConversation(t, f.scope, conversationSeed{})
		mustConversationMessage(t, f.scope, someoneElse, conversationMessageSeed{text: "hi", senderEmail: ptr("other@example.com")})
		agentOnly := mustConversation(t, f.scope, conversationSeed{})
		mustConversationMessage(t, f.scope, agentOnly, conversationMessageSeed{senderType: "agent", text: "hi", senderEmail: &f.email})
		otherSource := mustConversation(t, f.scope, conversationSeed{source: "email_agent"})
		mustConversationMessage(t, f.scope, otherSource, conversationMessageSeed{text: "hi", senderEmail: &f.email})
		localProject := f.scope.ProjectID
		ownedOnLocalProject := mustConversation(t, f.scope, conversationSeed{projectID: &localProject})
		mustConversationMessage(t, f.scope, ownedOnLocalProject, conversationMessageSeed{text: "hi", senderEmail: &f.email})

		requireVisible(t, f, ownedUnscoped, true)
		requireVisible(t, f, ownedLive, true)
		requireVisible(t, f, someoneElse, false)
		requireVisible(t, f, agentOnly, false)
		requireVisible(t, f, otherSource, false)
		requireVisible(t, f, ownedOnLocalProject, false)
	})

	for _, role := range []string{"admin", "localization_manager"} {
		t.Run(role+" reads every team", func(t *testing.T) {
			f := newConversationFixture(t, role)
			theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
			_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, f.scope.ProjectID, theirs)
			require.NoError(t, err)
			projectID := f.scope.ProjectID
			requireVisible(t, f, mustConversation(t, f.scope, conversationSeed{projectID: &projectID}), true)
			requireVisible(t, f, mustConversation(t, f.scope, conversationSeed{source: "github_agent"}), true)
		})
	}

	t.Run("other organizations and missing inbox items stay hidden", func(t *testing.T) {
		f := newConversationFixture(t, "admin")
		other := testenv.Seed(t, testenv.Options{Role: "admin"})
		requireVisible(t, f, mustConversation(t, other, conversationSeed{}), false)
		requireVisible(t, f, mustConversation(t, f.scope, conversationSeed{noInbox: true}), false)
		requireVisible(t, f, uuid.NewString(), false)
	})
}

func TestConversationListFiltersAndPagination(t *testing.T) {
	f := newConversationFixture(t, "admin")
	projectID := f.scope.ProjectID
	at := func(minutes int) time.Time { return conversationTestBase.Add(time.Duration(minutes) * time.Minute) }
	oldest := mustConversation(t, f.scope, conversationSeed{lastMessageAt: at(1)})
	archived := mustConversation(t, f.scope, conversationSeed{lastMessageAt: at(2), status: "archived", projectID: &projectID})
	middle := mustConversation(t, f.scope, conversationSeed{lastMessageAt: at(3), projectID: &projectID})
	newest := mustConversation(t, f.scope, conversationSeed{lastMessageAt: at(4)})

	require.Equal(t, []string{newest, middle, archived, oldest}, conversationListIDs(t, f.get(t, "")))
	require.Equal(t, []string{archived}, conversationListIDs(t, f.get(t, "?status=archived")))
	require.Equal(t, []string{newest, middle, oldest}, conversationListIDs(t, f.get(t, "?status=active")))
	require.Equal(t, []string{middle, archived}, conversationListIDs(t, f.get(t, "?projectId="+url.QueryEscape(url.PathEscape(" "+projectID)))))
	require.Empty(t, conversationListIDs(t, f.get(t, "?projectId=missing")))
	require.Equal(t, []string{newest, middle, archived, oldest}, conversationListIDs(t, f.get(t, "?cursor=not-a-date")))

	var page struct {
		Conversations []struct {
			ID            string `json:"id"`
			LastMessageAt string `json:"lastMessageAt"`
		} `json:"conversations"`
	}
	require.NoError(t, json.Unmarshal(f.get(t, "?limit=2").Body.Bytes(), &page))
	require.Len(t, page.Conversations, 2)
	require.Equal(t, newest, page.Conversations[0].ID)
	cursor := page.Conversations[1].LastMessageAt
	require.Equal(t, "2026-03-04T05:09:07.891Z", cursor)
	require.Equal(t, []string{archived, oldest}, conversationListIDs(t, f.get(t, "?limit=2&cursor="+url.QueryEscape(cursor))))

	require.Equal(t, []string{archived, oldest}, conversationListIDs(t, f.get(t, "?cursor="+url.QueryEscape("2026-03-04T05:09:07.891999Z"))))
	require.Equal(t, []string{middle, archived, oldest}, conversationListIDs(t, f.get(t, "?cursor="+url.QueryEscape("2026-03-04T05:09:07.892Z"))))

	for _, query := range []string{"?limit=0", "?limit=101", "?status=open", "?projectId=", "?cursor=a&cursor=b"} {
		requireConversationError(t, f.get(t, query), http.StatusBadRequest, `{"error":"invalid_query"}`)
	}
}

func TestConversationListParticipantAndLastMessage(t *testing.T) {
	f := newConversationFixture(t, "admin")
	at := func(seconds int) time.Time { return conversationTestBase.Add(time.Duration(seconds) * time.Second) }
	thread := mustConversation(t, f.scope, conversationSeed{lastMessageAt: at(30)})
	mustConversationMessage(t, f.scope, thread, conversationMessageSeed{senderType: "agent", text: "greeting", createdAt: at(1)})
	mustConversationMessage(t, f.scope, thread, conversationMessageSeed{text: "first", senderEmail: ptr("first@example.com"), createdAt: at(2)})
	mustConversationMessage(t, f.scope, thread, conversationMessageSeed{text: "second", senderEmail: ptr("second@example.com"), createdAt: at(3)})
	mustConversationMessage(t, f.scope, thread, conversationMessageSeed{senderType: "agent", text: "latest", createdAt: at(4)})
	agentOnly := mustConversation(t, f.scope, conversationSeed{lastMessageAt: at(20)})
	mustConversationMessage(t, f.scope, agentOnly, conversationMessageSeed{senderType: "agent", text: "only agent", createdAt: at(1)})
	empty := mustConversation(t, f.scope, conversationSeed{lastMessageAt: at(10)})

	var body struct {
		Conversations []struct {
			ID               string          `json:"id"`
			ParticipantEmail *string         `json:"participantEmail"`
			LastMessage      json.RawMessage `json:"lastMessage"`
		} `json:"conversations"`
	}
	require.NoError(t, json.Unmarshal(f.get(t, "").Body.Bytes(), &body))
	require.Len(t, body.Conversations, 3)
	require.Equal(t, thread, body.Conversations[0].ID)
	require.Equal(t, ptr("first@example.com"), body.Conversations[0].ParticipantEmail)
	require.JSONEq(t, `{"text":"latest","senderType":"agent","createdAt":"2026-03-04T05:06:11.891Z"}`, string(body.Conversations[0].LastMessage))
	require.Equal(t, agentOnly, body.Conversations[1].ID)
	require.Nil(t, body.Conversations[1].ParticipantEmail)
	require.JSONEq(t, `{"text":"only agent","senderType":"agent","createdAt":"2026-03-04T05:06:08.891Z"}`, string(body.Conversations[1].LastMessage))
	require.Equal(t, empty, body.Conversations[2].ID)
	require.Nil(t, body.Conversations[2].ParticipantEmail)
	require.JSONEq(t, `null`, string(body.Conversations[2].LastMessage))
}

func TestConversationMessageOrderingAndLimit(t *testing.T) {
	f := newConversationFixture(t, "admin")
	seed := func(count int) (string, []string) {
		conversationID := mustConversation(t, f.scope, conversationSeed{})
		texts := make([]string, count)
		for i := range count {
			texts[i] = fmt.Sprintf("message %02d", i)
		}
		for i := count - 1; i >= 0; i-- {
			mustConversationMessage(t, f.scope, conversationID, conversationMessageSeed{
				text: texts[i], senderEmail: &f.email, createdAt: conversationTestBase.Add(time.Duration(i) * time.Second),
			})
		}
		return conversationID, texts
	}

	conversationID, texts := seed(60)
	require.Equal(t, texts, conversationMessageTexts(t, decodeConversationBody(t, f.get(t, "/"+conversationID))["messages"]))
	require.Equal(t, texts[10:], conversationMessageTexts(t, decodeConversationBody(t, f.get(t, "/"+conversationID+"/messages"))["messages"]))

	conversationID, texts = seed(50)
	require.Equal(t, texts, conversationMessageTexts(t, decodeConversationBody(t, f.get(t, "/"+conversationID+"/messages"))["messages"]))

	conversationID, texts = seed(3)
	require.Equal(t, texts, conversationMessageTexts(t, decodeConversationBody(t, f.get(t, "/"+conversationID+"/messages"))["messages"]))

	conversationID, _ = seed(0)
	require.JSONEq(t, `{"messages":[]}`, f.get(t, "/"+conversationID+"/messages").Body.String())
}

func TestConversationReadsSanitizeByRole(t *testing.T) {
	const parts = `[{"type":"reasoning","text":"secret plan"},{"type":"text","text":"visible"},{"type":7,"text":"malformed"}]`
	for _, tt := range []struct {
		role, text string
		parts      string
	}{
		{"member", "visible", `[{"type":"text","text":"visible"}]`},
		{"translator", "secret plan\nvisible", parts},
	} {
		t.Run(tt.role, func(t *testing.T) {
			f := newConversationFixture(t, tt.role)
			conversationID := mustConversation(t, f.scope, conversationSeed{})
			mustConversationMessage(t, f.scope, conversationID, conversationMessageSeed{text: "hello", senderEmail: &f.email})
			mustConversationMessage(t, f.scope, conversationID, conversationMessageSeed{
				senderType: "agent", text: "secret plan\nvisible", parts: ptr(parts), createdAt: conversationTestBase.Add(time.Second),
			})

			for _, suffix := range []string{"", "/messages"} {
				var body struct {
					Messages []struct {
						Text  string          `json:"text"`
						Parts json.RawMessage `json:"parts"`
					} `json:"messages"`
				}
				require.NoError(t, json.Unmarshal(f.get(t, "/"+conversationID+suffix).Body.Bytes(), &body))
				require.Len(t, body.Messages, 2)
				require.Equal(t, "hello", body.Messages[0].Text)
				require.Equal(t, tt.text, body.Messages[1].Text)
				require.JSONEq(t, tt.parts, string(body.Messages[1].Parts))
			}

			var list struct {
				Conversations []struct {
					LastMessage conversationLastMessage `json:"lastMessage"`
				} `json:"conversations"`
			}
			require.NoError(t, json.Unmarshal(f.get(t, "").Body.Bytes(), &list))
			require.Len(t, list.Conversations, 1)
			require.Equal(t, tt.text, list.Conversations[0].LastMessage.Text)
		})
	}
}

func TestConversationJobsScope(t *testing.T) {
	f := newConversationFixture(t, "translator")
	f.scope.MustTeam(t, "default", "Default", "member")
	visibleProject := f.scope.ProjectID
	conversationID := mustConversation(t, f.scope, conversationSeed{projectID: &visibleProject})

	theirs := f.scope.MustTeam(t, "theirs", "Theirs", "")
	hiddenProject := f.scope.MustProject(t, uniqueProjectID("phidden"), "Hidden")
	_, err := f.scope.Pool.Exec(t.Context(), `update projects set team_id=$2 where id=$1`, hiddenProject, theirs)
	require.NoError(t, err)

	older := mustConversationJob(t, f.scope, f.scope.OrganizationID, conversationID, &visibleProject, conversationTestBase)
	newer := mustConversationJob(t, f.scope, f.scope.OrganizationID, conversationID, &hiddenProject, conversationTestBase.Add(time.Minute))
	other := testenv.Seed(t, testenv.Options{Role: "admin"})
	mustConversationJob(t, other, other.OrganizationID, conversationID, nil, conversationTestBase.Add(time.Hour))
	mustConversationJob(t, f.scope, f.scope.OrganizationID, mustConversation(t, f.scope, conversationSeed{projectID: &visibleProject}), nil, conversationTestBase)

	var body struct {
		Jobs []struct {
			ID string `json:"id"`
		} `json:"jobs"`
	}
	require.NoError(t, json.Unmarshal(f.get(t, "/"+conversationID+"/jobs").Body.Bytes(), &body))
	require.Len(t, body.Jobs, 2)
	require.Equal(t, newer, body.Jobs[0].ID)
	require.Equal(t, older, body.Jobs[1].ID)
}

func TestConversationReadsValidation(t *testing.T) {
	f := newConversationFixture(t, "admin")
	for _, suffix := range []string{"/not-a-uuid", "/not-a-uuid/messages", "/not-a-uuid/jobs", "/3f2b8c1e-4d5a-9b6c-8d7e-9f0a1b2c3d4e"} {
		requireConversationError(t, f.get(t, suffix), http.StatusNotFound, `{"error":"not_found"}`)
	}
}
