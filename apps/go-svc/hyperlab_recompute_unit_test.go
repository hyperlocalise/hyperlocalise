package main

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/stretchr/testify/require"
)

func TestRecomputeExperimentAllocations(t *testing.T) {
	controlID := uuid.NewString()
	treatmentID := uuid.NewString()
	pool := &scriptPool{steps: []dbStep{
		{op: opBegin},
		{op: opQueryRow, scan: []any{10000}},
		{op: opQuery, table: [][]any{
			{controlID, 5000},
			{treatmentID, 5000},
		}},
		{op: opExec, tag: pgconn.NewCommandTag("DELETE 2")},
		{op: opExec, tag: pgconn.NewCommandTag("INSERT 1")},
		{op: opExec, tag: pgconn.NewCommandTag("INSERT 1")},
	}}
	require.NoError(t, recomputeExperimentAllocations(context.Background(), pool, uuid.NewString()))

	missing := &scriptPool{steps: []dbStep{
		{op: opBegin},
		{op: opQueryRow, err: pgx.ErrNoRows},
	}}
	require.NoError(t, recomputeExperimentAllocations(context.Background(), missing, uuid.NewString()))
}

func TestHyperlabScanHelpers(t *testing.T) {
	now := time.Now().UTC()
	desc := "Checkout flag"
	flag, err := scanFlag(scriptScanRow{values: []any{uuid.NewString(), "org", "checkout", &desc, "config", now, now}})
	require.NoError(t, err)
	require.Equal(t, "checkout", flag.Key)

	audience, err := scanAudience(scriptScanRow{values: []any{uuid.NewString(), "org", "All users", nil, []byte(`{}`), now, now}})
	require.NoError(t, err)
	require.Equal(t, "All users", audience.Name)

	experiment, err := scanExperiment(scriptScanRow{values: []any{
		uuid.NewString(), "org", "Checkout", "draft", "ab", nil, 10000, now, now.Add(time.Hour), "UTC", nil, now, now,
	}})
	require.NoError(t, err)
	require.Equal(t, "Checkout", experiment.Name)

	variant, err := scanVariant(scriptScanRow{values: []any{uuid.NewString(), experiment.ID, "control", nil, 10000, true, now, now}})
	require.NoError(t, err)
	require.True(t, variant.IsControl)

	assignment, err := scanAssignment(scriptScanRow{values: []any{uuid.NewString(), flag.ID, variant.ID, true, []byte(`{}`), now, now}})
	require.NoError(t, err)
	require.True(t, assignment.Enabled)

	key, err := scanClientKey(scriptScanRow{values: []any{uuid.NewString(), "org", "SDK", "hlk_abcd", nil, nil, now}})
	require.NoError(t, err)
	require.Equal(t, "SDK", key.Name)
}
