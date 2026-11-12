package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const maxWebhookEndpointsPerOrganization = 20

var (
	errWebhookEndpointNotFound       = fmt.Errorf("%w: webhook endpoint", errResourceNotFound)
	errWebhookEndpointLimitReached   = errors.New("webhook endpoint limit reached")
	errWebhookURLInvalid             = errors.New("webhook url invalid")
	errWebhookProjectNotFound        = errors.New("webhook project not found")
	errWebhookSecretEncryptionFailed = errors.New("webhook secret encryption failed")
)

var jobChangeEventTypes = []string{
	"job.created",
	"job.status_changed",
	"job.assignee_changed",
	"job.due_date_changed",
	"job.details_changed",
}

type webhookEndpoint struct {
	ID                  string    `json:"id"`
	URL                 string    `json:"url"`
	Description         *string   `json:"description"`
	EventTypes          []string  `json:"eventTypes"`
	ProjectID           *string   `json:"projectId"`
	Enabled             bool      `json:"enabled"`
	DisabledReason      *string   `json:"disabledReason"`
	ConsecutiveFailures int       `json:"consecutiveFailures"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`
}

type webhookDelivery struct {
	ID                 string     `json:"id"`
	EventID            *string    `json:"eventId"`
	EventType          string     `json:"eventType"`
	Status             string     `json:"status"`
	AttemptCount       int        `json:"attemptCount"`
	LastResponseStatus *int       `json:"lastResponseStatus"`
	LastError          *string    `json:"lastError"`
	LastAttemptAt      *time.Time `json:"lastAttemptAt"`
	NextAttemptAt      *time.Time `json:"nextAttemptAt"`
	CreatedAt          time.Time  `json:"createdAt"`
}

type webhookCreate struct {
	URL         string
	Description *string
	EventTypes  []string
	ProjectID   *string
}

type webhookPatch struct {
	URL         *string
	Description optionalString
	EventTypes  *[]string
	ProjectID   optionalString
	Enabled     *bool
}

type createdWebhookEndpoint struct {
	Endpoint webhookEndpoint
	Secret   string
}

const webhookEndpointColumns = `
	id, url, description, event_types, project_id, disabled_at, disabled_reason,
	consecutive_failures, created_at, updated_at`

func (s *postgresStore) listWebhookEndpoints(ctx context.Context, actor principal) ([]webhookEndpoint, error) {
	rows, err := s.pool.Query(ctx, `SELECT `+webhookEndpointColumns+`
		FROM webhook_endpoints
		WHERE organization_id = $1
		ORDER BY created_at DESC`, actor.OrganizationID)
	if err != nil {
		return nil, fmt.Errorf("list webhook endpoints: %w", err)
	}
	defer rows.Close()
	items := make([]webhookEndpoint, 0)
	for rows.Next() {
		item, scanErr := scanWebhookEndpoint(rows)
		if scanErr != nil {
			return nil, scanErr
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate webhook endpoints: %w", err)
	}
	return items, nil
}

func (s *postgresStore) createWebhookEndpoint(ctx context.Context, actor principal, input webhookCreate) (createdWebhookEndpoint, error) {
	if input.EventTypes == nil {
		input.EventTypes = []string{}
	}
	projectID, err := s.resolveWebhookProjectID(ctx, actor.OrganizationID, input.ProjectID)
	if err != nil {
		return createdWebhookEndpoint{}, err
	}
	secret, err := generateWebhookSecret()
	if err != nil {
		return createdWebhookEndpoint{}, err
	}
	encrypted, err := encryptWebhookSecret(secret)
	if err != nil {
		return createdWebhookEndpoint{}, err
	}
	eventTypes, err := json.Marshal(input.EventTypes)
	if err != nil {
		return createdWebhookEndpoint{}, fmt.Errorf("encode webhook event types: %w", err)
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return createdWebhookEndpoint{}, fmt.Errorf("begin webhook create: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var count int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM webhook_endpoints WHERE organization_id = $1`,
		actor.OrganizationID).Scan(&count); err != nil {
		return createdWebhookEndpoint{}, fmt.Errorf("count webhook endpoints: %w", err)
	}
	if count >= maxWebhookEndpointsPerOrganization {
		return createdWebhookEndpoint{}, errWebhookEndpointLimitReached
	}

	row := tx.QueryRow(ctx, `INSERT INTO webhook_endpoints
		(organization_id, url, description, event_types, project_id, secret, created_by_user_id)
		VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)
		RETURNING `+webhookEndpointColumns,
		actor.OrganizationID, input.URL, input.Description, string(eventTypes), projectID, string(encrypted), actor.UserID)
	item, err := scanWebhookEndpoint(row)
	if err != nil {
		return createdWebhookEndpoint{}, fmt.Errorf("insert webhook endpoint: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return createdWebhookEndpoint{}, fmt.Errorf("commit webhook create: %w", err)
	}
	return createdWebhookEndpoint{Endpoint: item, Secret: secret}, nil
}

func (s *postgresStore) updateWebhookEndpoint(ctx context.Context, actor principal, endpointID string, patch webhookPatch) (webhookEndpoint, error) {
	existing, err := s.getWebhookEndpoint(ctx, actor, endpointID)
	if err != nil {
		return webhookEndpoint{}, err
	}

	url := existing.URL
	if patch.URL != nil {
		url = *patch.URL
	}
	description := existing.Description
	if patch.Description.Set {
		description = patch.Description.Value
	}
	eventTypes := existing.EventTypes
	if patch.EventTypes != nil {
		eventTypes = *patch.EventTypes
	}
	projectID := existing.ProjectID
	if patch.ProjectID.Set {
		projectID, err = s.resolveWebhookProjectID(ctx, actor.OrganizationID, patch.ProjectID.Value)
		if err != nil {
			return webhookEndpoint{}, err
		}
	}
	eventTypesJSON, err := json.Marshal(eventTypes)
	if err != nil {
		return webhookEndpoint{}, fmt.Errorf("encode webhook event types: %w", err)
	}

	row := s.pool.QueryRow(ctx, `UPDATE webhook_endpoints SET
		url = $2, description = $3, event_types = $4::jsonb, project_id = $5,
		disabled_at = CASE
			WHEN $6::boolean IS NULL THEN disabled_at
			WHEN $6::boolean THEN NULL
			ELSE COALESCE(disabled_at, now())
		END,
		disabled_reason = CASE
			WHEN $6::boolean IS NULL THEN disabled_reason
			WHEN $6::boolean THEN NULL
			WHEN disabled_at IS NULL THEN 'disabled_by_user'
			ELSE disabled_reason
		END,
		consecutive_failures = CASE
			WHEN $6::boolean IS TRUE AND disabled_at IS NOT NULL THEN 0
			ELSE consecutive_failures
		END,
		updated_at = now()
		WHERE organization_id = $1 AND id = $7
		RETURNING `+webhookEndpointColumns,
		actor.OrganizationID, url, description, string(eventTypesJSON), projectID, patch.Enabled, existing.ID)
	item, err := scanWebhookEndpoint(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return webhookEndpoint{}, errWebhookEndpointNotFound
	}
	if err != nil {
		return webhookEndpoint{}, fmt.Errorf("update webhook endpoint: %w", err)
	}
	return item, nil
}

func (s *postgresStore) deleteWebhookEndpoint(ctx context.Context, actor principal, endpointID string) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM webhook_endpoints WHERE organization_id = $1 AND id = $2`,
		actor.OrganizationID, endpointID)
	if err != nil {
		return fmt.Errorf("delete webhook endpoint: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errWebhookEndpointNotFound
	}
	return nil
}

func (s *postgresStore) rotateWebhookEndpointSecret(ctx context.Context, actor principal, endpointID string) (string, error) {
	if _, err := s.getWebhookEndpoint(ctx, actor, endpointID); err != nil {
		return "", err
	}
	secret, err := generateWebhookSecret()
	if err != nil {
		return "", err
	}
	encrypted, err := encryptWebhookSecret(secret)
	if err != nil {
		return "", err
	}
	tag, err := s.pool.Exec(ctx, `UPDATE webhook_endpoints SET secret = $3::jsonb, updated_at = now()
		WHERE organization_id = $1 AND id = $2`, actor.OrganizationID, endpointID, string(encrypted))
	if err != nil {
		return "", fmt.Errorf("rotate webhook secret: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return "", errWebhookEndpointNotFound
	}
	return secret, nil
}

func (s *postgresStore) listWebhookDeliveries(ctx context.Context, actor principal, endpointID string, limit int) ([]webhookDelivery, error) {
	if _, err := s.getWebhookEndpoint(ctx, actor, endpointID); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `SELECT id, event_id, event_type, status::text, attempt_count,
		last_response_status, last_error, last_attempt_at, next_attempt_at, created_at
		FROM webhook_deliveries
		WHERE endpoint_id = $1
		ORDER BY created_at DESC
		LIMIT $2`, endpointID, limit)
	if err != nil {
		return nil, fmt.Errorf("list webhook deliveries: %w", err)
	}
	defer rows.Close()
	items := make([]webhookDelivery, 0)
	for rows.Next() {
		var item webhookDelivery
		var status string
		var nextAttempt time.Time
		if scanErr := rows.Scan(&item.ID, &item.EventID, &item.EventType, &status, &item.AttemptCount,
			&item.LastResponseStatus, &item.LastError, &item.LastAttemptAt, &nextAttempt, &item.CreatedAt); scanErr != nil {
			return nil, fmt.Errorf("scan webhook delivery: %w", scanErr)
		}
		item.Status = status
		if status == "pending" {
			value := nextAttempt
			item.NextAttemptAt = &value
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate webhook deliveries: %w", err)
	}
	return items, nil
}

func (s *postgresStore) getWebhookEndpoint(ctx context.Context, actor principal, endpointID string) (webhookEndpoint, error) {
	row := s.pool.QueryRow(ctx, `SELECT `+webhookEndpointColumns+`
		FROM webhook_endpoints WHERE organization_id = $1 AND id = $2`,
		actor.OrganizationID, endpointID)
	item, err := scanWebhookEndpoint(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return webhookEndpoint{}, errWebhookEndpointNotFound
	}
	if err != nil {
		return webhookEndpoint{}, fmt.Errorf("get webhook endpoint: %w", err)
	}
	return item, nil
}

func (s *postgresStore) resolveWebhookProjectID(ctx context.Context, organizationID string, projectID *string) (*string, error) {
	if projectID == nil || *projectID == "" {
		return nil, nil
	}
	var id string
	err := s.pool.QueryRow(ctx, `SELECT id FROM projects WHERE id = $1 AND organization_id = $2 LIMIT 1`,
		*projectID, organizationID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, errWebhookProjectNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("resolve webhook project: %w", err)
	}
	return &id, nil
}

func scanWebhookEndpoint(row rowScanner) (webhookEndpoint, error) {
	var item webhookEndpoint
	var eventTypes []byte
	var disabledAt *time.Time
	if err := row.Scan(&item.ID, &item.URL, &item.Description, &eventTypes, &item.ProjectID,
		&disabledAt, &item.DisabledReason, &item.ConsecutiveFailures, &item.CreatedAt, &item.UpdatedAt); err != nil {
		return webhookEndpoint{}, err
	}
	if len(eventTypes) == 0 {
		item.EventTypes = []string{}
	} else if err := json.Unmarshal(eventTypes, &item.EventTypes); err != nil {
		return webhookEndpoint{}, fmt.Errorf("decode webhook event types: %w", err)
	}
	if item.EventTypes == nil {
		item.EventTypes = []string{}
	}
	item.Enabled = disabledAt == nil
	return item, nil
}

func parseWebhookEndpointID(raw string) (string, error) {
	id, err := uuid.Parse(raw)
	if err != nil {
		return "", errWebhookEndpointNotFound
	}
	return id.String(), nil
}

func normalizeWebhookEventTypes(values []string) ([]string, bool) {
	if len(values) > len(jobChangeEventTypes) {
		return nil, false
	}
	seen := make(map[string]struct{}, len(values))
	out := make([]string, 0, len(values))
	for _, value := range values {
		if !member(value, jobChangeEventTypes...) {
			return nil, false
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out, true
}
