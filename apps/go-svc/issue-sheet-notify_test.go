package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestIssueSheetUpdateIssueNotifiesStatusChanged(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	team := scope.MustTeam(t, "default", "Default", "")
	mustSetProjectTeam(t, scope, scope.ProjectID, team)
	watcher := mustAssignableOrgMember(t, scope, team)
	id, identifier := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Single update title", "open", "", nil)
	_, err := scope.Pool.Exec(t.Context(), `
        insert into issue_sheet_subscriptions (organization_id, project_id, issue_id, user_id)
        values ($1, $2, $3, $4)`, scope.OrganizationID, scope.ProjectID, id, watcher)
	require.NoError(t, err)

	body := bulkActionBody(t, map[string]any{"status": "resolved"})
	req := issueSheetAuthedRequest(http.MethodPatch, issueSheetPath(scope, identifier), body)
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusOK, rec.Code)

	var notified bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select exists(select 1 from issue_notifications where issue_id=$1 and recipient_user_id=$2 and type='status_changed')`,
		id, watcher,
	).Scan(&notified))
	require.True(t, notified)
}

func TestIssueSheetCreateCommentNotifiesMentionedAndWatcher(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	team := scope.MustTeam(t, "default", "Default", "")
	mustSetProjectTeam(t, scope, scope.ProjectID, team)
	mentioned := mustAssignableOrgMember(t, scope, team)
	watcher := mustAssignableOrgMember(t, scope, team)
	id, identifier := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Comment notify", "open", "", nil)
	_, err := scope.Pool.Exec(t.Context(), `
        insert into issue_sheet_subscriptions (organization_id, project_id, issue_id, user_id)
        values ($1, $2, $3, $4)`, scope.OrganizationID, scope.ProjectID, id, watcher)
	require.NoError(t, err)

	payload := bulkActionBody(t, map[string]any{
		"body":             "Hello [@teammate](mention:user:" + mentioned + ")",
		"mentionedUserIds": []string{mentioned},
	})
	req := issueSheetAuthedRequest(http.MethodPost, issueSheetPath(scope, identifier+"/comments"), payload)
	rec := issueSheetServe(api, scope.WorkOSUserID, req)
	require.Equal(t, http.StatusCreated, rec.Code)

	var mentionedNotified bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select exists(select 1 from issue_notifications where issue_id=$1 and recipient_user_id=$2 and type='mentioned')`,
		id, mentioned,
	).Scan(&mentionedNotified))
	require.True(t, mentionedNotified)

	var watcherNotified bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select exists(select 1 from issue_notifications where issue_id=$1 and recipient_user_id=$2 and type='comment')`,
		id, watcher,
	).Scan(&watcherNotified))
	require.True(t, watcherNotified)

	var subscribed bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select exists(select 1 from issue_sheet_subscriptions where issue_id=$1 and user_id=$2)`,
		id, mentioned,
	).Scan(&subscribed))
	require.True(t, subscribed)
}

func TestCommentExcerptTruncatesLongMarkdown(t *testing.T) {
	text := "**Hello** " + strings.Repeat("x", 200)
	excerpt := commentExcerpt(text)
	require.LessOrEqual(t, len([]rune(excerpt)), commentExcerptMaxLength)
	require.Contains(t, excerpt, "Hello")
}

func TestIssueSheetUpdateCommentNotifiesOnlyNewMentions(t *testing.T) {
	api, scope := issueSheetTestAPI(t, true)
	team := scope.MustTeam(t, "default", "Default", "")
	mustSetProjectTeam(t, scope, scope.ProjectID, team)
	firstMention := mustAssignableOrgMember(t, scope, team)
	secondMention := mustAssignableOrgMember(t, scope, team)
	id, identifier := mustOrgIssueFull(t, scope, scope.ProjectID, 1, "Edit mentions", "open", "", nil)

	createBody := bulkActionBody(t, map[string]any{
		"body":             "Ping",
		"mentionedUserIds": []string{firstMention},
	})
	createReq := issueSheetAuthedRequest(http.MethodPost, issueSheetPath(scope, identifier+"/comments"), createBody)
	createRec := issueSheetServe(api, scope.WorkOSUserID, createReq)
	require.Equal(t, http.StatusCreated, createRec.Code)

	var created struct {
		IssueComment struct {
			ID string `json:"id"`
		} `json:"issueComment"`
	}
	require.NoError(t, json.Unmarshal(createRec.Body.Bytes(), &created))
	commentID := created.IssueComment.ID
	require.NotEmpty(t, commentID)

	updateBody := bulkActionBody(t, map[string]any{
		"body":             "Ping again",
		"mentionedUserIds": []string{firstMention, secondMention},
	})
	updateReq := issueSheetAuthedRequest(http.MethodPatch, issueSheetPath(scope, identifier+"/comments/"+commentID), updateBody)
	updateRec := issueSheetServe(api, scope.WorkOSUserID, updateReq)
	require.Equal(t, http.StatusOK, updateRec.Code)

	var secondNotified bool
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select exists(select 1 from issue_notifications where issue_id=$1 and recipient_user_id=$2 and type='mentioned')`,
		id, secondMention,
	).Scan(&secondNotified))
	require.True(t, secondNotified)

	var firstCount int
	require.NoError(t, scope.Pool.QueryRow(t.Context(),
		`select count(*) from issue_notifications where issue_id=$1 and recipient_user_id=$2 and type='mentioned'`,
		id, firstMention,
	).Scan(&firstCount))
	require.Equal(t, 1, firstCount, "re-mentioning an existing user must not create a duplicate mention notification on edit")
}
