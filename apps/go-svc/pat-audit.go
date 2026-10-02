package main

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
)

const (
	patCreatedAuditAction            = "pat.created"
	patRevokedAuditAction            = "pat.revoked"
	patAuditTarget                   = "personal_access_token"
	patAuditSeverity                 = "high"
	patAuditSchemaVersion            = 1
	patRevokeReasonManual            = "manual"
	patRevokeReasonMembershipRemoved = "membership_removed"
)

var errPatAuditUnsafe = errors.New("pat audit: payload contains forbidden fields")

var patAuditSafeTargetKeys = map[string]struct{}{
	"type": {}, "id": {}, "organizationId": {}, "ownerUserId": {}, "keyPrefix": {}, "permissions": {},
}

var patAuditForbiddenKeys = map[string]struct{}{
	"key": {}, "keyhash": {}, "key_hash": {}, "x-api-key": {}, "authorization": {},
	"email": {}, "body": {}, "requestbody": {},
}

var patAuditForbiddenValueFragments = []string{"keyhash", "key_hash", "x-api-key", "authorization"}

type patAuditor struct {
	write func(context.Context, slog.Record) error
}

type patCreatedAuditInput struct {
	actorUserID, ownerUserID, organizationID, tokenID, keyPrefix string
	permissions                                                  []string
}

type patRevokedAuditInput struct {
	actorUserID, organizationID, tokenID, keyPrefix, reason string
	ownerUserID                                             *string
}

func (a patAuditor) emitPatCreated(ctx context.Context, input patCreatedAuditInput) error {
	// A prefix longer than the display prefix could be the plaintext secret.
	if len(input.keyPrefix) > apiKeyPrefixLength {
		return errPatAuditUnsafe
	}
	permissions := make([]string, 0, len(input.permissions))
	permissions = append(permissions, input.permissions...)
	return a.emit(ctx, patCreatedAuditAction,
		slog.Group("actor",
			slog.String("type", "user"),
			slog.String("id", input.actorUserID),
		),
		slog.Group("target",
			slog.String("type", patAuditTarget),
			slog.String("id", input.tokenID),
			slog.String("organizationId", input.organizationID),
			slog.String("ownerUserId", input.ownerUserID),
			slog.String("keyPrefix", input.keyPrefix),
			slog.Any("permissions", permissions),
		),
		slog.String("outcome", "success"),
		slog.Int("version", patAuditSchemaVersion),
	)
}

func (a patAuditor) emitPatRevoked(ctx context.Context, input patRevokedAuditInput) error {
	var owner slog.Attr
	if input.ownerUserID != nil {
		owner = slog.String("ownerUserId", *input.ownerUserID)
	} else {
		owner = slog.Any("ownerUserId", nil)
	}
	return a.emit(ctx, patRevokedAuditAction,
		slog.Group("actor",
			slog.String("type", "user"),
			slog.String("id", input.actorUserID),
		),
		slog.Group("target",
			slog.String("type", patAuditTarget),
			slog.String("id", input.tokenID),
			slog.String("organizationId", input.organizationID),
			owner,
			slog.String("keyPrefix", input.keyPrefix),
		),
		slog.String("outcome", "success"),
		slog.String("reason", input.reason),
		slog.Int("version", patAuditSchemaVersion),
	)
}

func (a patAuditor) emit(ctx context.Context, action string, attrs ...slog.Attr) error {
	fields := make([]any, 0, len(attrs)+2)
	fields = append(fields, slog.String("action", action), slog.String("severity", patAuditSeverity))
	for _, attr := range attrs {
		fields = append(fields, attr)
	}
	audit := slog.Group("audit", fields...)
	if err := assertSafePatAudit(audit); err != nil {
		return err
	}
	record := slog.NewRecord(time.Now(), slog.LevelInfo, action, 0)
	record.AddAttrs(audit)
	if a.write != nil {
		return a.write(ctx, record)
	}
	return writeDefaultPatAudit(ctx, record)
}

func writeDefaultPatAudit(ctx context.Context, record slog.Record) error {
	return slog.Default().Handler().Handle(ctx, record)
}

func assertSafePatAudit(audit slog.Attr) error {
	for _, attr := range audit.Value.Group() {
		if attr.Key == "target" {
			for _, field := range attr.Value.Group() {
				if _, ok := patAuditSafeTargetKeys[field.Key]; !ok {
					return errPatAuditUnsafe
				}
			}
		}
	}
	if !isSafePatAuditAttr(audit) {
		return errPatAuditUnsafe
	}
	return nil
}

func isSafePatAuditAttr(attr slog.Attr) bool {
	if _, forbidden := patAuditForbiddenKeys[strings.ToLower(attr.Key)]; forbidden {
		return false
	}
	value := attr.Value.Resolve()
	switch value.Kind() {
	case slog.KindGroup:
		for _, child := range value.Group() {
			if !isSafePatAuditAttr(child) {
				return false
			}
		}
	case slog.KindString:
		return isSafePatAuditValue(value.String())
	case slog.KindAny:
		if values, ok := value.Any().([]string); ok {
			for _, item := range values {
				if !isSafePatAuditValue(item) {
					return false
				}
			}
		}
	}
	return true
}

func isSafePatAuditValue(value string) bool {
	lower := strings.ToLower(value)
	for _, fragment := range patAuditForbiddenValueFragments {
		if strings.Contains(lower, fragment) {
			return false
		}
	}
	return true
}
