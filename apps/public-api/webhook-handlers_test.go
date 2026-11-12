package main

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type fakeWebhookStore struct {
	webhookErr        error
	webhookEndpoints  []webhookEndpoint
	webhookDeliveries []webhookDelivery
	webhookCreate     webhookCreate
	webhookPatch      webhookPatch
	webhookID         string
	webhookLimit      int
	rotatedID         string
	webhookDeletedID  string
}

func (s *fakeWebhookStore) listWebhookEndpoints(context.Context, principal) ([]webhookEndpoint, error) {
	return s.webhookEndpoints, s.webhookErr
}

func (s *fakeWebhookStore) createWebhookEndpoint(_ context.Context, _ principal, input webhookCreate) (createdWebhookEndpoint, error) {
	s.webhookCreate = input
	endpoint := webhookEndpoint{ID: "11111111-1111-1111-1111-111111111111", URL: input.URL, EventTypes: input.EventTypes, Enabled: true}
	if input.Description != nil {
		endpoint.Description = input.Description
	}
	endpoint.ProjectID = input.ProjectID
	if endpoint.EventTypes == nil {
		endpoint.EventTypes = []string{}
	}
	return createdWebhookEndpoint{Endpoint: endpoint, Secret: "whsec_created"}, s.webhookErr
}

func (s *fakeWebhookStore) updateWebhookEndpoint(_ context.Context, _ principal, id string, patch webhookPatch) (webhookEndpoint, error) {
	s.webhookID, s.webhookPatch = id, patch
	return webhookEndpoint{ID: id, URL: "https://hooks.example.com/in", EventTypes: []string{}, Enabled: true}, s.webhookErr
}

func (s *fakeWebhookStore) deleteWebhookEndpoint(_ context.Context, _ principal, id string) error {
	s.webhookDeletedID = id
	return s.webhookErr
}

func (s *fakeWebhookStore) rotateWebhookEndpointSecret(_ context.Context, _ principal, id string) (string, error) {
	s.rotatedID = id
	return "whsec_rotated", s.webhookErr
}

func (s *fakeWebhookStore) listWebhookDeliveries(_ context.Context, _ principal, id string, limit int) ([]webhookDelivery, error) {
	s.webhookID, s.webhookLimit = id, limit
	return s.webhookDeliveries, s.webhookErr
}

var (
	webhookReadScopes  = effectivePermissions([]string{"jobs:read"}, "admin")
	webhookWriteScopes = effectivePermissions([]string{"jobs:read", "jobs:write"}, "localization_manager")
	webhookEndpointID  = "6f1c2a4e-0b8e-4c1e-9d0f-2b6a8c1d3e5f"
)

func TestWebhookRoutes(t *testing.T) {
	t.Run("lists endpoints", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.webhookEndpoints = []webhookEndpoint{{ID: webhookEndpointID, URL: "https://hooks.example.com/in", EventTypes: []string{"job.created"}, Enabled: true}}
		w := sendResource(t, resourcePrincipal(webhookReadScopes...), store, http.MethodGet, "/v1/webhook-endpoints", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Contains(t, w.Body.String(), `"webhookEndpoints":[{"id":"`+webhookEndpointID+`"`)
		require.NotContains(t, w.Body.String(), "secret")
	})

	t.Run("list requires webhooks:read", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(jobReadScopes...), &fakeResourceStore{}, http.MethodGet, "/v1/webhook-endpoints", "")
		require.Equal(t, http.StatusForbidden, w.Code)
	})

	t.Run("creates an endpoint and returns the secret once", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(webhookWriteScopes...), store, http.MethodPost, "/v1/webhook-endpoints",
			`{"url":" https://hooks.example.com/in ","eventTypes":["job.status_changed","job.status_changed"],"description":" CI ","projectId":"proj_1"}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Equal(t, "https://hooks.example.com/in", store.webhookCreate.URL)
		require.Equal(t, []string{"job.status_changed"}, store.webhookCreate.EventTypes)
		require.Equal(t, "CI", *store.webhookCreate.Description)
		require.Equal(t, "proj_1", *store.webhookCreate.ProjectID)
		require.Contains(t, w.Body.String(), `"secret":"whsec_created"`)
		require.Contains(t, w.Body.String(), `"webhookEndpoint":{"id":`)
	})

	t.Run("create defaults event types to every change", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(webhookWriteScopes...), store, http.MethodPost, "/v1/webhook-endpoints",
			`{"url":"https://hooks.example.com/in"}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Empty(t, store.webhookCreate.EventTypes)
	})

	t.Run("create rejects unsafe urls and unknown types", func(t *testing.T) {
		for _, body := range []string{
			`{"url":"http://hooks.example.com/in"}`,
			`{"url":"https://127.0.0.1/hook"}`,
			`{"url":"https://hooks.example.com/in","eventTypes":["job.deleted"]}`,
			`{}`,
		} {
			w := sendResource(t, resourcePrincipal(webhookWriteScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/webhook-endpoints", body)
			require.Equal(t, http.StatusBadRequest, w.Code, body)
		}
	})

	t.Run("create requires webhooks:write and maps store errors", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(webhookReadScopes...), &fakeResourceStore{}, http.MethodPost, "/v1/webhook-endpoints",
			`{"url":"https://hooks.example.com/in"}`)
		require.Equal(t, http.StatusForbidden, w.Code)

		store := &fakeResourceStore{}
		store.webhookErr = errWebhookEndpointLimitReached
		w = sendResource(t, resourcePrincipal(webhookWriteScopes...), store, http.MethodPost, "/v1/webhook-endpoints",
			`{"url":"https://hooks.example.com/in"}`)
		require.Equal(t, http.StatusConflict, w.Code)
		require.Contains(t, w.Body.String(), "webhook_endpoint_limit_reached")

		store.webhookErr = errWebhookSecretEncryptionFailed
		w = sendResource(t, resourcePrincipal(webhookWriteScopes...), store, http.MethodPost, "/v1/webhook-endpoints",
			`{"url":"https://hooks.example.com/in"}`)
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
		require.Contains(t, w.Body.String(), "webhook_secret_encryption_failed")
	})

	t.Run("patches fields", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(webhookWriteScopes...), store, http.MethodPatch, "/v1/webhook-endpoints/"+webhookEndpointID,
			`{"enabled":false,"description":null,"projectId":null}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, webhookEndpointID, store.webhookID)
		require.True(t, store.webhookPatch.Description.Set)
		require.Nil(t, store.webhookPatch.Description.Value)
		require.True(t, store.webhookPatch.ProjectID.Set)
		require.Nil(t, store.webhookPatch.ProjectID.Value)
		require.Equal(t, false, *store.webhookPatch.Enabled)
	})

	t.Run("patch rejects empty and invalid bodies", func(t *testing.T) {
		for _, body := range []string{`{}`, `{"url":"http://10.0.0.1/hook"}`, `{"eventTypes":["nope"]}`} {
			w := sendResource(t, resourcePrincipal(webhookWriteScopes...), &fakeResourceStore{}, http.MethodPatch, "/v1/webhook-endpoints/"+webhookEndpointID, body)
			require.Equal(t, http.StatusBadRequest, w.Code, body)
		}
	})

	t.Run("deletes an endpoint", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(webhookWriteScopes...), store, http.MethodDelete, "/v1/webhook-endpoints/"+webhookEndpointID, "")
		require.Equal(t, http.StatusNoContent, w.Code)
		require.Equal(t, webhookEndpointID, store.webhookDeletedID)
	})

	t.Run("invalid endpoint ids are not found", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(webhookWriteScopes...), &fakeResourceStore{}, http.MethodDelete, "/v1/webhook-endpoints/not-a-uuid", "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "webhook_endpoint_not_found")
	})

	t.Run("rotates the secret", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(webhookWriteScopes...), store, http.MethodPost, "/v1/webhook-endpoints/"+webhookEndpointID+"/rotate-secret", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, webhookEndpointID, store.rotatedID)
		require.JSONEq(t, `{"secret":"whsec_rotated"}`, w.Body.String())
	})

	t.Run("lists deliveries", func(t *testing.T) {
		store := &fakeResourceStore{}
		created := time.Date(2026, 11, 9, 8, 15, 30, 0, time.UTC)
		store.webhookDeliveries = []webhookDelivery{{ID: "del-1", EventType: "job.created", Status: "succeeded", CreatedAt: created}}
		w := sendResource(t, resourcePrincipal(webhookReadScopes...), store, http.MethodGet, "/v1/webhook-endpoints/"+webhookEndpointID+"/deliveries?limit=10", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, webhookEndpointID, store.webhookID)
		require.Equal(t, 10, store.webhookLimit)
		require.Contains(t, w.Body.String(), `"webhookDeliveries":[{"id":"del-1"`)
	})

	t.Run("maps missing endpoints", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.webhookErr = errWebhookEndpointNotFound
		w := sendResource(t, resourcePrincipal(webhookWriteScopes...), store, http.MethodDelete, "/v1/webhook-endpoints/"+webhookEndpointID, "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "webhook_endpoint_not_found")
	})
}
