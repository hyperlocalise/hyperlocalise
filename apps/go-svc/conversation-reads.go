package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// $1: organization ID, $2: org-wide access, $3: user ID.
var conversationAccessSQL = `i.organization_id = $1 and (
            $2
            or exists (
                select 1 from projects p
                where p.id = i.project_id and p.organization_id = $1
                    and ` + formatQaProjectTeamAccessSQL(2, 3, 1) + `
            )
            or (
                i.source = 'chat_ui'
                and (i.project_id is null or i.project_id like 'ext:%')
                and exists (
                    select 1 from interaction_messages m
                    where m.interaction_id = i.id and m.sender_type = 'user'
                        and m.sender_email = (select u.email from users u where u.id = $3)
                )
            )
        )`

const conversationMessageColumnsSQL = `m.id::text, m.interaction_id::text, m.sender_type::text, m.sender_email,
            m.text, m.parts, m.attachments, m.created_at`

type conversationDetail struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	ProjectID      *string `json:"projectId"`
	Source         string  `json:"source"`
	Title          string  `json:"title"`
	SourceThreadID *string `json:"sourceThreadId"`
	LastMessageAt  string  `json:"lastMessageAt"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
	Status         string  `json:"status"`
}

type conversationSummary struct {
	ID               string                   `json:"id"`
	Title            string                   `json:"title"`
	Source           string                   `json:"source"`
	Status           string                   `json:"status"`
	ProjectID        *string                  `json:"projectId"`
	LastMessageAt    string                   `json:"lastMessageAt"`
	CreatedAt        string                   `json:"createdAt"`
	ParticipantEmail *string                  `json:"participantEmail"`
	LastMessage      *conversationLastMessage `json:"lastMessage"`
}

type conversationJob struct {
	ID          string  `json:"id"`
	ProjectID   *string `json:"projectId"`
	Kind        string  `json:"kind"`
	Type        *string `json:"type"`
	Status      string  `json:"status"`
	OutcomeKind *string `json:"outcomeKind"`
	CreatedAt   string  `json:"createdAt"`
	CompletedAt *string `json:"completedAt"`
}

func conversationAccessArgs(actor conversationActor) []any {
	return []any{actor.organizationID, actor.canReadAllTeams(), actor.userID}
}

func (api *conversationAPI) loadAccessibleConversation(ctx context.Context, actor conversationActor, conversationID string) (conversationDetail, error) {
	var detail conversationDetail
	var lastMessageAt, createdAt, updatedAt time.Time
	err := api.pool.QueryRow(ctx, `
        select i.id::text, i.organization_id::text, i.project_id, i.source::text, i.title, i.source_thread_id,
            i.last_message_at, i.created_at, i.updated_at, b.status::text
        from interactions i
        join inbox_items b on b.interaction_id = i.id
        where i.id = $4 and `+conversationAccessSQL+`
        limit 1`,
		append(conversationAccessArgs(actor), conversationID)...,
	).Scan(&detail.ID, &detail.OrganizationID, &detail.ProjectID, &detail.Source, &detail.Title, &detail.SourceThreadID,
		&lastMessageAt, &createdAt, &updatedAt, &detail.Status)
	if errors.Is(err, pgx.ErrNoRows) {
		return conversationDetail{}, conversationNotFound()
	}
	if err != nil {
		return conversationDetail{}, fmt.Errorf("load conversation: %w", err)
	}
	detail.LastMessageAt = formatConversationTime(lastMessageAt)
	detail.CreatedAt = formatConversationTime(createdAt)
	detail.UpdatedAt = formatConversationTime(updatedAt)
	return detail, nil
}

func (api *conversationAPI) accessibleConversationParam(r *http.Request, actor conversationActor) (conversationDetail, error) {
	conversationID, err := conversationIDParam(r)
	if err != nil {
		return conversationDetail{}, err
	}
	return api.loadAccessibleConversation(r.Context(), actor, conversationID)
}

func scanConversationMessages(rows pgx.Rows) ([]conversationMessage, error) {
	defer rows.Close()
	messages := []conversationMessage{}
	for rows.Next() {
		var message conversationMessage
		var parts, attachments []byte
		var createdAt time.Time
		if err := rows.Scan(&message.ID, &message.InteractionID, &message.SenderType, &message.SenderEmail,
			&message.Text, &parts, &attachments, &createdAt); err != nil {
			return nil, err
		}
		message.Parts = parts
		message.Attachments = attachments
		message.CreatedAt = formatConversationTime(createdAt)
		messages = append(messages, message)
	}
	return messages, rows.Err()
}

func (api *conversationAPI) getHandler(r *http.Request, actor conversationActor) (any, int, error) {
	conversation, err := api.accessibleConversationParam(r, actor)
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(r.Context(), `
        select `+conversationMessageColumnsSQL+`
        from interaction_messages m
        where m.interaction_id = $1
        order by m.created_at`,
		conversation.ID)
	if err != nil {
		return nil, 0, fmt.Errorf("list conversation messages: %w", err)
	}
	messages, err := scanConversationMessages(rows)
	if err != nil {
		return nil, 0, fmt.Errorf("scan conversation messages: %w", err)
	}
	return map[string]any{
		"conversation": conversation,
		"messages":     sanitizeConversationMessages(messages, actor.canRunAIActions()),
	}, http.StatusOK, nil
}

func (api *conversationAPI) messagesHandler(r *http.Request, actor conversationActor) (any, int, error) {
	conversation, err := api.accessibleConversationParam(r, actor)
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(r.Context(), `
        select `+conversationMessageColumnsSQL+`
        from interaction_messages m
        where m.interaction_id = $1
        order by m.created_at desc
        limit $2`,
		conversation.ID, conversationMessagesLimit)
	if err != nil {
		return nil, 0, fmt.Errorf("list recent conversation messages: %w", err)
	}
	messages, err := scanConversationMessages(rows)
	if err != nil {
		return nil, 0, fmt.Errorf("scan recent conversation messages: %w", err)
	}
	slices.Reverse(messages)
	return map[string]any{"messages": sanitizeConversationMessages(messages, actor.canRunAIActions())}, http.StatusOK, nil
}

func (api *conversationAPI) jobsHandler(r *http.Request, actor conversationActor) (any, int, error) {
	conversation, err := api.accessibleConversationParam(r, actor)
	if err != nil {
		return nil, 0, err
	}
	rows, err := api.pool.Query(r.Context(), `
        select j.id, j.project_id, j.kind::text, t.type::text, j.status::text, t.outcome_kind::text,
            j.created_at, j.completed_at
        from jobs j
        left join translation_job_details t on t.job_id = j.id
        where j.organization_id = $1 and j.interaction_id = $2
        order by j.created_at desc`,
		actor.organizationID, conversation.ID)
	if err != nil {
		return nil, 0, fmt.Errorf("list conversation jobs: %w", err)
	}
	defer rows.Close()
	jobs := []conversationJob{}
	for rows.Next() {
		var job conversationJob
		var createdAt time.Time
		var completedAt *time.Time
		if err := rows.Scan(&job.ID, &job.ProjectID, &job.Kind, &job.Type, &job.Status, &job.OutcomeKind,
			&createdAt, &completedAt); err != nil {
			return nil, 0, fmt.Errorf("scan conversation job: %w", err)
		}
		job.CreatedAt = formatConversationTime(createdAt)
		job.CompletedAt = formatConversationOptionalTime(completedAt)
		jobs = append(jobs, job)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate conversation jobs: %w", err)
	}
	return map[string]any{"jobs": jobs}, http.StatusOK, nil
}

func (api *conversationAPI) listHandler(r *http.Request, actor conversationActor) (any, int, error) {
	query, err := parseConversationListQuery(r.URL.Query())
	if err != nil {
		return nil, 0, err
	}
	args := conversationAccessArgs(actor)
	conditions := []string{conversationAccessSQL}
	add := func(format string, value any) {
		args = append(args, value)
		conditions = append(conditions, fmt.Sprintf(format, len(args)))
	}
	if query.status != "" {
		add("b.status = $%d", query.status)
	}
	if query.projectID != "" {
		add("i.project_id = $%d", query.projectID)
	}
	if query.cursor != nil {
		add("i.last_message_at < $%d", *query.cursor)
	}
	args = append(args, query.limit)

	rows, err := api.pool.Query(r.Context(), `
        select c.id::text, c.title, c.source, c.status, c.project_id, c.last_message_at, c.created_at,
            first_user.sender_email,
            last_message.id::text, last_message.sender_type::text, last_message.text, last_message.parts,
            last_message.created_at
        from (
            select i.id, i.title, i.source::text as source, b.status::text as status, i.project_id,
                i.last_message_at, i.created_at
            from inbox_items b
            join interactions i on b.interaction_id = i.id
            where `+strings.Join(conditions, "\n                and ")+`
            order by i.last_message_at desc
            limit $`+strconv.Itoa(len(args))+`
        ) c
        left join lateral (
            select m.id, m.sender_type, m.text, m.parts, m.created_at
            from interaction_messages m
            where m.interaction_id = c.id
            order by m.created_at desc
            limit 1
        ) last_message on true
        left join lateral (
            select m.sender_email
            from interaction_messages m
            where m.interaction_id = c.id and m.sender_type = 'user'
            order by m.created_at
            limit 1
        ) first_user on true
        order by c.last_message_at desc`,
		args...)
	if err != nil {
		return nil, 0, fmt.Errorf("list conversations: %w", err)
	}
	defer rows.Close()
	canRunAIActions := actor.canRunAIActions()
	conversations := []conversationSummary{}
	for rows.Next() {
		var summary conversationSummary
		var lastMessageAt, createdAt time.Time
		var lastID, lastSenderType, lastText *string
		var lastParts []byte
		var lastCreatedAt *time.Time
		if err := rows.Scan(&summary.ID, &summary.Title, &summary.Source, &summary.Status, &summary.ProjectID,
			&lastMessageAt, &createdAt, &summary.ParticipantEmail,
			&lastID, &lastSenderType, &lastText, &lastParts, &lastCreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scan conversation: %w", err)
		}
		summary.LastMessageAt = formatConversationTime(lastMessageAt)
		summary.CreatedAt = formatConversationTime(createdAt)
		if lastID != nil && lastSenderType != nil && lastText != nil && lastCreatedAt != nil {
			summary.LastMessage = sanitizeConversationLastMessage(&conversationMessage{
				SenderType: *lastSenderType,
				Text:       *lastText,
				Parts:      json.RawMessage(lastParts),
				CreatedAt:  formatConversationTime(*lastCreatedAt),
			}, canRunAIActions)
		}
		conversations = append(conversations, summary)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterate conversations: %w", err)
	}
	return map[string]any{"conversations": conversations}, http.StatusOK, nil
}
