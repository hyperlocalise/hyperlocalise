package main

import (
	"errors"
	"net/http"
	"strings"
)

var webhookErrorResponses = []storeErrorResponse{
	{errWebhookEndpointNotFound, http.StatusNotFound, "webhook_endpoint_not_found", "Webhook endpoint not found"},
	{errWebhookEndpointLimitReached, http.StatusConflict, "webhook_endpoint_limit_reached", "This workspace has reached its webhook endpoint limit."},
	{errWebhookURLInvalid, http.StatusBadRequest, "webhook_url_invalid", "Use an HTTPS URL on a public host."},
	{errWebhookProjectNotFound, http.StatusBadRequest, "webhook_project_not_found", "Choose a project in this workspace."},
	{errWebhookSecretEncryptionFailed, http.StatusServiceUnavailable, "webhook_secret_encryption_failed", "Webhook secrets are temporarily unavailable"},
}

func writeWebhookStoreError(w http.ResponseWriter, err error, operation string) {
	for _, response := range webhookErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeStoreError(w, err, operation)
}

func (s apiServer) webhookEndpoints(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost) {
		return
	}
	if r.Method == http.MethodPost {
		s.createWebhookEndpoint(w, r)
		return
	}
	p, ok := s.authenticateWithStore(w, r, "webhooks:read")
	if !ok {
		return
	}
	items, err := s.store.listWebhookEndpoints(r.Context(), p)
	if err != nil {
		writeWebhookStoreError(w, err, "list webhook endpoints")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		WebhookEndpoints []webhookEndpoint `json:"webhookEndpoints"`
	}{items})
}

func (s apiServer) createWebhookEndpoint(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticateWithStore(w, r, "webhooks:write")
	if !ok {
		return
	}
	var body struct {
		URL         string   `json:"url"`
		Description *string  `json:"description"`
		EventTypes  []string `json:"eventTypes"`
		ProjectID   *string  `json:"projectId"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	input, ok := parseWebhookCreate(w, body.URL, body.Description, body.EventTypes, body.ProjectID)
	if !ok {
		return
	}
	created, err := s.store.createWebhookEndpoint(r.Context(), p, input)
	if err != nil {
		writeWebhookStoreError(w, err, "create webhook endpoint")
		return
	}
	writeJSON(w, http.StatusCreated, struct {
		WebhookEndpoint webhookEndpoint `json:"webhookEndpoint"`
		Secret          string          `json:"secret"`
	}{created.Endpoint, created.Secret})
}

func (s apiServer) webhookEndpoint(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPatch, http.MethodDelete) {
		return
	}
	endpointID, ok := webhookEndpointPathID(w, r)
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "webhooks:write")
	if !ok {
		return
	}
	if r.Method == http.MethodDelete {
		if err := s.store.deleteWebhookEndpoint(r.Context(), p, endpointID); err != nil {
			writeWebhookStoreError(w, err, "delete webhook endpoint")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}

	var body struct {
		URL         *string        `json:"url"`
		Description optionalString `json:"description"`
		EventTypes  *[]string      `json:"eventTypes"`
		ProjectID   optionalString `json:"projectId"`
		Enabled     *bool          `json:"enabled"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	patch, ok := parseWebhookPatch(w, body.URL, body.Description, body.EventTypes, body.ProjectID, body.Enabled)
	if !ok {
		return
	}
	item, err := s.store.updateWebhookEndpoint(r.Context(), p, endpointID, patch)
	if err != nil {
		writeWebhookStoreError(w, err, "update webhook endpoint")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		WebhookEndpoint webhookEndpoint `json:"webhookEndpoint"`
	}{item})
}

func (s apiServer) rotateWebhookSecret(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	endpointID, ok := webhookEndpointPathID(w, r)
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "webhooks:write")
	if !ok {
		return
	}
	secret, err := s.store.rotateWebhookEndpointSecret(r.Context(), p, endpointID)
	if err != nil {
		writeWebhookStoreError(w, err, "rotate webhook secret")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Secret string `json:"secret"`
	}{secret})
}

func (s apiServer) webhookDeliveries(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	endpointID, ok := webhookEndpointPathID(w, r)
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "webhooks:read")
	if !ok {
		return
	}
	limit, valid := parseBoundedInt(r.URL.Query().Get("limit"), 50, 1, 100)
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid_query", "limit must be an integer between 1 and 100")
		return
	}
	items, err := s.store.listWebhookDeliveries(r.Context(), p, endpointID, limit)
	if err != nil {
		writeWebhookStoreError(w, err, "list webhook deliveries")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		WebhookDeliveries []webhookDelivery `json:"webhookDeliveries"`
	}{items})
}

func webhookEndpointPathID(w http.ResponseWriter, r *http.Request) (string, bool) {
	raw, ok := pathID(w, r, "endpointId")
	if !ok {
		return "", false
	}
	id, err := parseWebhookEndpointID(raw)
	if err != nil {
		writeError(w, http.StatusNotFound, "webhook_endpoint_not_found", "Webhook endpoint not found")
		return "", false
	}
	return id, true
}

func parseWebhookCreate(w http.ResponseWriter, rawURL string, description *string, eventTypes []string, projectID *string) (webhookCreate, bool) {
	normalizedURL, description, eventTypes, projectID, ok := normalizeWebhookFields(w, strings.TrimSpace(rawURL), description, eventTypes, projectID, true)
	if !ok {
		return webhookCreate{}, false
	}
	return webhookCreate{URL: normalizedURL, Description: description, EventTypes: eventTypes, ProjectID: projectID}, true
}

func parseWebhookPatch(w http.ResponseWriter, rawURL *string, description optionalString, eventTypes *[]string, projectID optionalString, enabled *bool) (webhookPatch, bool) {
	if rawURL == nil && !description.Set && eventTypes == nil && !projectID.Set && enabled == nil {
		writeError(w, http.StatusBadRequest, "invalid_body", "Provide url, description, eventTypes, projectId, or enabled")
		return webhookPatch{}, false
	}
	patch := webhookPatch{Description: description, ProjectID: projectID, Enabled: enabled}
	if rawURL != nil {
		normalized, _, _, _, ok := normalizeWebhookFields(w, strings.TrimSpace(*rawURL), nil, nil, nil, true)
		if !ok {
			return webhookPatch{}, false
		}
		patch.URL = &normalized
	}
	if eventTypes != nil {
		normalized, valid := normalizeWebhookEventTypes(*eventTypes)
		if !valid {
			writeError(w, http.StatusBadRequest, "invalid_body", "eventTypes must be job change types")
			return webhookPatch{}, false
		}
		patch.EventTypes = &normalized
	}
	if description.Set {
		value := trimmedOrNil(description.Value)
		if !validOptionalText(value, 500) {
			writeError(w, http.StatusBadRequest, "invalid_body", "description must be at most 500 characters")
			return webhookPatch{}, false
		}
		patch.Description.Value = value
	}
	if projectID.Set {
		value := trimmedOrNil(projectID.Value)
		if value != nil && (*value == "" || len(*value) > 128) {
			writeError(w, http.StatusBadRequest, "invalid_body", "projectId must be a project ID")
			return webhookPatch{}, false
		}
		patch.ProjectID.Value = value
	}
	return patch, true
}

func normalizeWebhookFields(w http.ResponseWriter, rawURL string, description *string, eventTypes []string, projectID *string, requireURL bool) (string, *string, []string, *string, bool) {
	if requireURL && (rawURL == "" || len(rawURL) > 2048) {
		writeError(w, http.StatusBadRequest, "webhook_url_invalid", "Use an HTTPS URL on a public host.")
		return "", nil, nil, nil, false
	}
	normalizedURL := ""
	if requireURL {
		parsed, err := validateWebhookEndpointURL(rawURL)
		if err != nil || len(parsed) > 2048 {
			writeError(w, http.StatusBadRequest, "webhook_url_invalid", "Use an HTTPS URL on a public host.")
			return "", nil, nil, nil, false
		}
		normalizedURL = parsed
	}
	normalizedTypes, valid := normalizeWebhookEventTypes(eventTypes)
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid_body", "eventTypes must be job change types")
		return "", nil, nil, nil, false
	}
	desc := trimmedOrNil(description)
	if !validOptionalText(desc, 500) {
		writeError(w, http.StatusBadRequest, "invalid_body", "description must be at most 500 characters")
		return "", nil, nil, nil, false
	}
	project := trimmedOrNil(projectID)
	if project != nil && len(*project) > 128 {
		writeError(w, http.StatusBadRequest, "invalid_body", "projectId must be a project ID")
		return "", nil, nil, nil, false
	}
	return normalizedURL, desc, normalizedTypes, project, true
}
