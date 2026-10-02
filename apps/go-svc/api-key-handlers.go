package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
)

var apiKeyIDPattern = regexp.MustCompile(`^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|[fF]{8}-[fF]{4}-[fF]{4}-[fF]{4}-[fF]{12})$`)

type apiKeyOwner struct {
	UserID    string  `json:"userId"`
	Email     string  `json:"email"`
	FirstName *string `json:"firstName"`
	LastName  *string `json:"lastName"`
}

type apiKeySummary struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	KeyPrefix   string          `json:"keyPrefix"`
	Permissions json.RawMessage `json:"permissions"`
	LastUsedAt  *string         `json:"lastUsedAt"`
	RevokedAt   *string         `json:"revokedAt"`
	CreatedAt   string          `json:"createdAt"`
	Owner       *apiKeyOwner    `json:"owner"`
}

type createdAPIKey struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	KeyPrefix   string          `json:"keyPrefix"`
	Permissions json.RawMessage `json:"permissions"`
	CreatedAt   string          `json:"createdAt"`
	Key         string          `json:"key"`
	Owner       *apiKeyOwner    `json:"owner"`
}

type apiKeyOwnerRow struct {
	userID, email       *string
	firstName, lastName *string
}

func (row apiKeyOwnerRow) toOwner() *apiKeyOwner {
	if row.userID == nil || *row.userID == "" || row.email == nil {
		return nil
	}
	return &apiKeyOwner{UserID: *row.userID, Email: *row.email, FirstName: row.firstName, LastName: row.lastName}
}

func formatOptionalAPIKeyTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	formatted := formatMemberTime(*t)
	return &formatted
}

func ownerScope(actor organizationActor, mayActOnOthers bool) *string {
	if mayActOnOthers {
		return nil
	}
	return &actor.userID
}

func (api *apiKeyAPI) listAPIKeysHandler(r *http.Request, actor organizationActor) (any, int, error) {
	keys, err := api.listAPIKeys(r.Context(), actor)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"apiKeys": keys}, http.StatusOK, nil
}

func (api *apiKeyAPI) listAPIKeys(ctx context.Context, actor organizationActor) ([]apiKeySummary, error) {
	rows, err := api.pool.Query(ctx, `
        select k.id, k.name, k.key_prefix, k.permissions, k.last_used_at, k.revoked_at, k.created_at, k.updated_at,
               u.id, u.email, u.first_name, u.last_name
        from organization_api_keys k
        left join users u on u.id = k.created_by_user_id
        where k.organization_id = $1
          and ($2::uuid is null or k.created_by_user_id = $2::uuid)
        order by k.created_at, k.id`,
		actor.organizationID, ownerScope(actor, canAdministerOtherUsersAPIKeys(actor.role)))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	keys := make([]apiKeySummary, 0)
	for rows.Next() {
		var (
			key                   apiKeySummary
			permissions           []byte
			lastUsedAt, revokedAt *time.Time
			createdAt, updatedAt  time.Time
			owner                 apiKeyOwnerRow
		)
		if err := rows.Scan(&key.ID, &key.Name, &key.KeyPrefix, &permissions, &lastUsedAt, &revokedAt, &createdAt, &updatedAt,
			&owner.userID, &owner.email, &owner.firstName, &owner.lastName); err != nil {
			return nil, err
		}
		key.Permissions = json.RawMessage(permissions)
		key.LastUsedAt = formatOptionalAPIKeyTime(lastUsedAt)
		key.CreatedAt = formatMemberTime(createdAt)
		key.Owner = owner.toOwner()
		if key.Owner == nil && revokedAt == nil {
			revokedAt = &updatedAt
		}
		key.RevokedAt = formatOptionalAPIKeyTime(revokedAt)
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

type apiKeyValidationIssue struct {
	Path    []any  `json:"path"`
	Message string `json:"message"`
}

func invalidAPIKeyPayload(issues []apiKeyValidationIssue) error {
	var details map[string]any
	if len(issues) > 0 {
		details = map[string]any{"issues": issues}
	}
	return apiKeyFailureDetails(http.StatusBadRequest, "invalid_api_key_payload", "Invalid API key payload", details)
}

type createAPIKeyRequest struct {
	name        string
	permissions []string
}

func parseCreateAPIKeyBody(r *http.Request) (createAPIKeyRequest, error) {
	var req createAPIKeyRequest
	raw, err := io.ReadAll(r.Body)
	if err != nil {
		if isRequestBodyTooLarge(err) {
			return req, apiKeyFailure(http.StatusRequestEntityTooLarge, "payload_too_large", "request body exceeds maximum allowed size")
		}
		return req, invalidAPIKeyPayload(nil)
	}
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return req, invalidAPIKeyPayload([]apiKeyValidationIssue{{Path: []any{}, Message: "Invalid input: expected object"}})
	}
	var body struct {
		Name        json.RawMessage `json:"name"`
		Permissions json.RawMessage `json:"permissions"`
	}
	if err := json.Unmarshal(trimmed, &body); err != nil {
		return req, invalidAPIKeyPayload(nil)
	}

	var issues []apiKeyValidationIssue
	if len(body.Name) == 0 {
		issues = append(issues, apiKeyValidationIssue{Path: []any{"name"}, Message: "Invalid input: expected string, received undefined"})
	} else {
		var name string
		if err := json.Unmarshal(body.Name, &name); err != nil || bytes.Equal(body.Name, []byte("null")) {
			issues = append(issues, apiKeyValidationIssue{Path: []any{"name"}, Message: "Invalid input: expected string"})
		} else {
			req.name = trimDictionaryInput(name)
			switch length := utf16Length(req.name); {
			case length < 1:
				issues = append(issues, apiKeyValidationIssue{Path: []any{"name"}, Message: "Too small: expected string to have >=1 characters"})
			case length > apiKeyNameMaxLength:
				issues = append(issues, apiKeyValidationIssue{Path: []any{"name"}, Message: fmt.Sprintf("Too big: expected string to have <=%d characters", apiKeyNameMaxLength)})
			}
		}
	}

	if len(body.Permissions) > 0 {
		var items []json.RawMessage
		if bytes.Equal(body.Permissions, []byte("null")) || json.Unmarshal(body.Permissions, &items) != nil {
			issues = append(issues, apiKeyValidationIssue{Path: []any{"permissions"}, Message: "Invalid input: expected array"})
		} else {
			req.permissions = make([]string, 0, len(items))
			for i, item := range items {
				var scope string
				if json.Unmarshal(item, &scope) != nil || bytes.Equal(item, []byte("null")) || !isAPIKeyScope(scope) {
					issues = append(issues, apiKeyValidationIssue{
						Path:    []any{"permissions", i},
						Message: `Invalid option: expected one of "jobs:read"|"jobs:write"|"files:read"|"files:write"`,
					})
					continue
				}
				req.permissions = append(req.permissions, scope)
			}
		}
	}

	if len(issues) > 0 {
		return req, invalidAPIKeyPayload(issues)
	}
	return req, nil
}

func (api *apiKeyAPI) createAPIKeyHandler(r *http.Request, actor organizationActor) (any, int, error) {
	req, err := parseCreateAPIKeyBody(r)
	if err != nil {
		return nil, 0, err
	}
	created, err := api.createAPIKey(r.Context(), actor, req)
	if err != nil {
		return nil, 0, err
	}
	return map[string]any{"apiKey": created}, http.StatusCreated, nil
}

func (api *apiKeyAPI) createAPIKey(ctx context.Context, actor organizationActor, req createAPIKeyRequest) (createdAPIKey, error) {
	var created createdAPIKey
	grantable := grantableAPIKeyPermissions(actor.role)
	requested := grantable
	if req.permissions != nil {
		requested = req.permissions
	}
	refused := refusedAPIKeyPermissions(actor.role, requested)
	if len(grantable) == 0 || len(refused) > 0 {
		reported := refused
		if len(reported) == 0 {
			reported = requested
		}
		return created, apiKeyFailureDetails(http.StatusForbidden, "api_key_permissions_not_grantable",
			"Requested API key permissions exceed the owner's role", map[string]any{"permissions": reported})
	}

	plainKey, err := generateAPIKey()
	if err != nil {
		return created, apiKeyInternalFailure("internal_error", "The token could not be created", err)
	}
	permissionsJSON, err := json.Marshal(requested)
	if err != nil {
		return created, err
	}

	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return created, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var locked int
	err = tx.QueryRow(ctx, `
        select 1 from organization_memberships
        where organization_id=$1 and user_id=$2
          and workos_membership_id is not null and workos_membership_id not in ('', 'replacing')
        for share`, actor.organizationID, actor.userID).Scan(&locked)
	if errors.Is(err, pgx.ErrNoRows) {
		return created, apiKeyFailure(http.StatusForbidden, "organization_access_denied", organizationAccessMessage("organization_access_denied"))
	}
	if err != nil {
		return created, err
	}

	var (
		permissions []byte
		createdAt   time.Time
	)
	err = tx.QueryRow(ctx, `
        insert into organization_api_keys (organization_id, name, key_hash, key_prefix, permissions, created_by_user_id)
        values ($1, $2, $3, $4, $5::jsonb, $6)
        returning id, name, key_prefix, permissions, created_at`,
		actor.organizationID, req.name, hashAPIKey(plainKey), apiKeyPrefix(plainKey), string(permissionsJSON), actor.userID,
	).Scan(&created.ID, &created.Name, &created.KeyPrefix, &permissions, &createdAt)
	if err != nil {
		return created, apiKeyInternalFailure("internal_error", "The token could not be created", err)
	}
	created.Permissions = json.RawMessage(permissions)
	created.CreatedAt = formatMemberTime(createdAt)

	var owner apiKeyOwnerRow
	err = tx.QueryRow(ctx, `select id::text, email, first_name, last_name from users where id=$1`, actor.userID).
		Scan(&owner.userID, &owner.email, &owner.firstName, &owner.lastName)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return created, err
	}
	created.Owner = owner.toOwner()

	if auditErr := api.audit.emitPatCreated(ctx, patCreatedAuditInput{
		actorUserID:    actor.userID,
		ownerUserID:    actor.userID,
		organizationID: actor.organizationID,
		tokenID:        created.ID,
		keyPrefix:      created.KeyPrefix,
		permissions:    requested,
	}); auditErr != nil {
		if _, err := tx.Exec(ctx, `
            update organization_api_keys set revoked_at=now(), updated_at=now() where id=$1`, created.ID); err != nil {
			return createdAPIKey{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return createdAPIKey{}, err
		}
		return createdAPIKey{}, apiKeyInternalFailure("access_token_audit_failed",
			"The token could not be recorded safely and was not issued", auditErr)
	}
	if err := tx.Commit(ctx); err != nil {
		return createdAPIKey{}, apiKeyInternalFailure("internal_error", "The token could not be created", err)
	}

	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "personal_access_token_created",
		OrganizationID: actor.organizationID,
		Payload: map[string]any{
			"keyPrefix":   created.KeyPrefix,
			"permissions": requested,
			"tokenId":     created.ID,
		},
		TargetID:   created.ID,
		TargetKind: patAuditTarget,
	})

	created.Key = plainKey
	return created, nil
}

func (api *apiKeyAPI) revokeAPIKeyHandler(r *http.Request, actor organizationActor) (any, int, error) {
	apiKeyID := trimDictionaryInput(r.PathValue("apiKeyId"))
	if !apiKeyIDPattern.MatchString(apiKeyID) {
		return nil, 0, apiKeyNotFound()
	}
	if err := api.revokeAPIKey(r.Context(), actor, apiKeyID); err != nil {
		return nil, 0, err
	}
	return nil, http.StatusNoContent, nil
}

func (api *apiKeyAPI) revokeAPIKey(ctx context.Context, actor organizationActor, apiKeyID string) error {
	owner := ownerScope(actor, canRevokeOtherUsersAPIKeys(actor.role))
	var (
		tokenID, keyPrefix, organizationID string
		ownerUserID                        *string
	)
	err := api.pool.QueryRow(ctx, `
        update organization_api_keys set revoked_at=now(), updated_at=now()
        where id=$1 and organization_id=$2
          and ($3::uuid is null or created_by_user_id = $3::uuid)
          and revoked_at is null
        returning id, key_prefix, organization_id, created_by_user_id::text`,
		apiKeyID, actor.organizationID, owner).Scan(&tokenID, &keyPrefix, &organizationID, &ownerUserID)
	if errors.Is(err, pgx.ErrNoRows) {
		var exists int
		err = api.pool.QueryRow(ctx, `
            select 1 from organization_api_keys
            where id=$1 and organization_id=$2
              and ($3::uuid is null or created_by_user_id = $3::uuid)`,
			apiKeyID, actor.organizationID, owner).Scan(&exists)
		if errors.Is(err, pgx.ErrNoRows) {
			return apiKeyNotFound()
		}
		return err
	}
	if err != nil {
		return err
	}

	_ = api.audit.emitPatRevoked(ctx, patRevokedAuditInput{
		actorUserID:    actor.userID,
		ownerUserID:    ownerUserID,
		organizationID: organizationID,
		tokenID:        tokenID,
		keyPrefix:      keyPrefix,
		reason:         patRevokeReasonManual,
	})
	api.publishActivity(ctx, activityLogEventInput{
		ActorUserID:    actor.userID,
		EventType:      "personal_access_token_revoked",
		OrganizationID: organizationID,
		Payload: map[string]any{
			"keyPrefix": keyPrefix,
			"reason":    patRevokeReasonManual,
			"tokenId":   tokenID,
		},
		TargetID:   tokenID,
		TargetKind: patAuditTarget,
	})
	return nil
}
