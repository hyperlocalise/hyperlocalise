package main

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestWebhookStoreDatabase(t *testing.T) {
	t.Setenv("PROVIDER_CREDENTIALS_MASTER_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	f := newDBFixture(t)
	ctx := t.Context()

	created, err := f.store.createWebhookEndpoint(ctx, f.actor, webhookCreate{
		URL:         "https://hooks.example.com/in",
		EventTypes:  []string{"job.status_changed"},
		Description: ptr("CI"),
		ProjectID:   &f.project,
	})
	require.NoError(t, err)
	require.Regexp(t, `^whsec_`, created.Secret)
	require.Equal(t, "https://hooks.example.com/in", created.Endpoint.URL)
	require.Equal(t, []string{"job.status_changed"}, created.Endpoint.EventTypes)
	require.Equal(t, f.project, *created.Endpoint.ProjectID)
	require.True(t, created.Endpoint.Enabled)

	var stored json.RawMessage
	require.NoError(t, f.pool.QueryRow(ctx, `SELECT secret FROM webhook_endpoints WHERE id = $1`, created.Endpoint.ID).Scan(&stored))
	require.NotContains(t, string(stored), created.Secret)

	listed, err := f.store.listWebhookEndpoints(ctx, f.actor)
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Equal(t, created.Endpoint.ID, listed[0].ID)

	missing := "proj_missing"
	_, err = f.store.createWebhookEndpoint(ctx, f.actor, webhookCreate{URL: "https://hooks.example.com/other", ProjectID: &missing})
	require.ErrorIs(t, err, errWebhookProjectNotFound)

	disabled := false
	updated, err := f.store.updateWebhookEndpoint(ctx, f.actor, created.Endpoint.ID, webhookPatch{
		Enabled:     &disabled,
		Description: optionalString{Set: true},
		ProjectID:   optionalString{Set: true},
	})
	require.NoError(t, err)
	require.False(t, updated.Enabled)
	require.Equal(t, "disabled_by_user", *updated.DisabledReason)
	require.Nil(t, updated.Description)
	require.Nil(t, updated.ProjectID)

	enabled := true
	updated, err = f.store.updateWebhookEndpoint(ctx, f.actor, created.Endpoint.ID, webhookPatch{Enabled: &enabled})
	require.NoError(t, err)
	require.True(t, updated.Enabled)
	require.Nil(t, updated.DisabledReason)
	require.Zero(t, updated.ConsecutiveFailures)

	rotated, err := f.store.rotateWebhookEndpointSecret(ctx, f.actor, created.Endpoint.ID)
	require.NoError(t, err)
	require.Regexp(t, `^whsec_`, rotated)
	require.NotEqual(t, created.Secret, rotated)

	outsider := principal{UserID: uuid.NewString(), OrganizationID: uuid.NewString()}
	_, err = f.store.listWebhookDeliveries(ctx, outsider, created.Endpoint.ID, 10)
	require.ErrorIs(t, err, errWebhookEndpointNotFound)

	deliveries, err := f.store.listWebhookDeliveries(ctx, f.actor, created.Endpoint.ID, 10)
	require.NoError(t, err)
	require.Empty(t, deliveries)

	require.NoError(t, f.store.deleteWebhookEndpoint(ctx, f.actor, created.Endpoint.ID))
	require.ErrorIs(t, f.store.deleteWebhookEndpoint(ctx, f.actor, created.Endpoint.ID), errWebhookEndpointNotFound)
}

func TestWebhookStoreLimit(t *testing.T) {
	t.Setenv("PROVIDER_CREDENTIALS_MASTER_KEY", "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=")
	f := newDBFixture(t)
	ctx := t.Context()
	for i := 0; i < maxWebhookEndpointsPerOrganization; i++ {
		_, err := f.store.createWebhookEndpoint(ctx, f.actor, webhookCreate{URL: "https://hooks.example.com/in"})
		require.NoError(t, err)
	}
	_, err := f.store.createWebhookEndpoint(ctx, f.actor, webhookCreate{URL: "https://hooks.example.com/in"})
	require.ErrorIs(t, err, errWebhookEndpointLimitReached)
}

func TestNormalizeWebhookEventTypes(t *testing.T) {
	t.Parallel()
	got, ok := normalizeWebhookEventTypes([]string{"job.created", "job.created", "job.status_changed"})
	require.True(t, ok)
	require.Equal(t, []string{"job.created", "job.status_changed"}, got)
	_, ok = normalizeWebhookEventTypes([]string{"job.deleted"})
	require.False(t, ok)
}
