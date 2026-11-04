package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/apps/go-svc/internal/autumn"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

func requireSeatLimitReached(t *testing.T, err error, currentUsage, requestedUsage int) {
	t.Helper()
	var failure *memberError
	require.ErrorAs(t, err, &failure)
	require.Equal(t, http.StatusConflict, failure.status)
	require.Equal(t, "workspace_resource_limit_reached", failure.code)
	require.Equal(t, map[string]any{
		"featureId":      workspaceResourceSeatsFeatureID,
		"currentUsage":   currentUsage,
		"requestedUsage": requestedUsage,
	}, failure.details)
}

func TestFallbackMemberSeats(t *testing.T) {
	ctx := context.Background()
	require.NoError(t, allowMemberSeats{}.AllowAdditionalSeat(ctx, "org_1", 500, 501))

	require.NoError(t, fallbackMemberSeats{}.AllowAdditionalSeat(ctx, "org_1", 0, localSeatFallbackLimit))
	requireSeatLimitReached(t, fallbackMemberSeats{}.AllowAdditionalSeat(ctx, "org_1", localSeatFallbackLimit, localSeatFallbackLimit+1), localSeatFallbackLimit, localSeatFallbackLimit+1)
	requireSeatLimitReached(t, fallbackMemberSeats{limit: -3}.AllowAdditionalSeat(ctx, "org_1", 1, 2), 1, 2)

	require.NoError(t, fallbackMemberSeats{limit: 3}.AllowAdditionalSeat(ctx, "org_1", 2, 3))
	requireSeatLimitReached(t, fallbackMemberSeats{limit: 3}.AllowAdditionalSeat(ctx, "org_1", 3, 4), 3, 4)
}

func autumnSeatsTestClient(t *testing.T, handler http.HandlerFunc) *autumn.Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	client, err := autumn.NewClient(autumn.Config{SecretKey: "k", BaseURL: srv.URL, HTTPClient: srv.Client()})
	require.NoError(t, err)
	return client
}

func TestAutumnMemberSeats(t *testing.T) {
	ctx := context.Background()

	t.Run("without a key uses the local limit", func(t *testing.T) {
		require.NoError(t, autumnMemberSeats{}.AllowAdditionalSeat(ctx, "org_1", 0, 1))
		requireSeatLimitReached(t, autumnMemberSeats{}.AllowAdditionalSeat(ctx, "org_1", 1, 2), 1, 2)

		client, err := autumn.NewClient(autumn.Config{})
		require.NoError(t, err)
		requireSeatLimitReached(t, autumnMemberSeats{client: client}.AllowAdditionalSeat(ctx, "org_1", 1, 2), 1, 2)
	})

	t.Run("allowed", func(t *testing.T) {
		var body map[string]any
		client := autumnSeatsTestClient(t, func(w http.ResponseWriter, r *http.Request) {
			require.Equal(t, "/v1/balances.check", r.URL.Path)
			raw, _ := io.ReadAll(r.Body)
			require.NoError(t, json.Unmarshal(raw, &body))
			_, _ = w.Write([]byte(`{"allowed":true,"customer_id":"org_1"}`))
		})
		require.NoError(t, autumnMemberSeats{client: client}.AllowAdditionalSeat(ctx, "org_1", 4, 5))
		require.Equal(t, map[string]any{
			"customer_id":      "org_1",
			"feature_id":       workspaceResourceSeatsFeatureID,
			"required_balance": float64(5),
			"with_preview":     true,
		}, body)
	})

	t.Run("denied", func(t *testing.T) {
		client := autumnSeatsTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte(`{"allowed":false,"customer_id":"org_1"}`))
		})
		requireSeatLimitReached(t, autumnMemberSeats{client: client}.AllowAdditionalSeat(ctx, "org_1", 4, 5), 4, 5)
	})

	t.Run("check failure", func(t *testing.T) {
		client := autumnSeatsTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, `{"message":"bad request"}`, http.StatusBadRequest)
		})
		requireMemberFailure(t, autumnMemberSeats{client: client}.AllowAdditionalSeat(ctx, "org_1", 4, 5), http.StatusServiceUnavailable, "workspace_resource_limit_check_failed")
	})
}

func TestWithSeatLimitScripted(t *testing.T) {
	ctx := context.Background()
	boom := errors.New("boom")
	called := 0
	fn := func(pgx.Tx) error {
		called++
		return nil
	}

	for name, steps := range map[string][]dbStep{
		"begin": {{op: opBegin, err: boom}},
		"lock":  {{op: opBegin}, {op: opExec, err: boom}},
		"count": {{op: opBegin}, {op: opExec}, {op: opQueryRow, err: boom}},
	} {
		t.Run(name+" fails", func(t *testing.T) {
			pool := &scriptPool{steps: steps}
			require.ErrorIs(t, (&memberAPI{pool: pool}).withSeatLimit(ctx, "org_1", fn), boom)
			requireScriptDone(t, pool)
		})
	}
	require.Zero(t, called)

	t.Run("nil checker uses the local limit", func(t *testing.T) {
		analytics := &recordingMemberAnalytics{}
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opExec}, {op: opQueryRow, scan: []any{localSeatFallbackLimit}}}}
		err := (&memberAPI{pool: pool, analytics: analytics}).withSeatLimit(ctx, "org_1", fn)
		requireSeatLimitReached(t, err, localSeatFallbackLimit, localSeatFallbackLimit+1)
		require.Zero(t, called)
		require.Empty(t, analytics.snapshot())
	})

	t.Run("callback error is returned untracked", func(t *testing.T) {
		analytics := &recordingMemberAnalytics{}
		pool := &scriptPool{steps: []dbStep{{op: opBegin}, {op: opExec}, {op: opQueryRow, scan: []any{3}}}}
		err := (&memberAPI{pool: pool, seats: allowMemberSeats{}, analytics: analytics}).withSeatLimit(ctx, "org_1", func(pgx.Tx) error { return boom })
		require.ErrorIs(t, err, boom)
		require.Empty(t, analytics.snapshot())
	})

	t.Run("success tracks the seat", func(t *testing.T) {
		api := &memberAPI{seats: allowMemberSeats{}, analytics: &recordingMemberAnalytics{}}
		api.pool = &scriptPool{steps: []dbStep{{op: opBegin}, {op: opExec}, {op: opQueryRow, scan: []any{3}}}}
		require.NoError(t, api.withSeatLimit(ctx, "org_1", fn))
		require.Equal(t, 1, called)
		requireSeatAddedEvents(t, api, 1)
	})
}
