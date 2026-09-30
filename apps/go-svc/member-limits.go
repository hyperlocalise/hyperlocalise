package main

import (
	"context"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/jackc/pgx/v5"
)

type memberSeatChecker interface {
	AllowAdditionalSeat(ctx context.Context, organizationID string, currentUsage, requestedUsage int) error
}

type allowMemberSeats struct{}

func (allowMemberSeats) AllowAdditionalSeat(context.Context, string, int, int) error {
	return nil
}

type fallbackMemberSeats struct {
	limit int
}

func (s fallbackMemberSeats) AllowAdditionalSeat(_ context.Context, _ string, currentUsage, requestedUsage int) error {
	limit := s.limit
	if limit <= 0 {
		limit = localSeatFallbackLimit
	}
	if requestedUsage > limit {
		return memberFailureDetails(409, "workspace_resource_limit_reached", "Seat limit reached for your current plan.", map[string]any{
			"featureId":      workspaceResourceSeatsFeatureID,
			"currentUsage":   currentUsage,
			"requestedUsage": requestedUsage,
		})
	}
	return nil
}

type autumnMemberSeats struct {
	client *autumn.Client
}

func (s autumnMemberSeats) AllowAdditionalSeat(ctx context.Context, organizationID string, currentUsage, requestedUsage int) error {
	if s.client == nil || !s.client.HasSecretKey() {
		return fallbackMemberSeats{limit: localSeatFallbackLimit}.AllowAdditionalSeat(ctx, organizationID, currentUsage, requestedUsage)
	}
	required := float64(requestedUsage)
	res, err := s.client.Check(ctx, autumn.CheckRequest{
		CustomerID:      organizationID,
		FeatureID:       workspaceResourceSeatsFeatureID,
		RequiredBalance: &required,
		WithPreview:     true,
	})
	if err != nil {
		return memberFailure(503, "workspace_resource_limit_check_failed", "Unable to verify seat limits. Try again later.")
	}
	if !res.Allowed {
		return memberFailureDetails(409, "workspace_resource_limit_reached", "Seat limit reached for your current plan.", map[string]any{
			"featureId":      workspaceResourceSeatsFeatureID,
			"currentUsage":   currentUsage,
			"requestedUsage": requestedUsage,
		})
	}
	return nil
}

func (api *memberAPI) withSeatLimit(ctx context.Context, organizationID string, fn func(tx pgx.Tx) error) error {
	tx, err := api.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `select pg_advisory_xact_lock(hashtextextended($1, 0))`, "workspace_resource_limit:"+organizationID+":"+workspaceResourceSeatsFeatureID); err != nil {
		return err
	}
	var currentUsage int
	if err := tx.QueryRow(ctx, `select count(*)::int from organization_memberships where organization_id=$1`, organizationID).Scan(&currentUsage); err != nil {
		return err
	}
	requestedUsage := currentUsage + 1
	checker := api.seats
	if checker == nil {
		checker = fallbackMemberSeats{limit: localSeatFallbackLimit}
	}
	if err := checker.AllowAdditionalSeat(ctx, organizationID, currentUsage, requestedUsage); err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return err
	}
	api.trackSeatAdded(ctx)
	return nil
}
