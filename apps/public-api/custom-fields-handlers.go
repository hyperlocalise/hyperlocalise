package main

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/hyperlocalise/hyperlocalise/internal/customfield"
)

// writeCustomFieldError maps custom field errors to API errors.
func writeCustomFieldError(w http.ResponseWriter, err error, operation string) {
	var validation customfield.ValidationError
	switch {
	case errors.As(err, &validation):
		writeError(w, http.StatusBadRequest, "invalid_body", validation.Error())
	case errors.Is(err, customfield.ErrNotFound):
		writeError(w, http.StatusNotFound, "custom_field_not_found", "Custom field not found")
	case errors.Is(err, customfield.ErrKeyTaken):
		writeError(w, http.StatusConflict, "custom_field_key_taken", "A custom field with this key already exists")
	case errors.Is(err, customfield.ErrLimitReached):
		writeError(w, http.StatusConflict, "custom_field_limit_reached", "The workspace has reached its custom field limit")
	default:
		writeStoreError(w, err, operation)
	}
}

type customFieldEnvelope struct {
	CustomField customfield.Field `json:"customField"`
}

// customFields lists fields (GET) or creates one (POST).
func (s apiServer) customFields(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost) {
		return
	}
	if r.Method == http.MethodPost {
		p, ok := s.authenticateWithStore(w, r, "custom-fields:write")
		if !ok {
			return
		}
		var body customfield.CreateInput
		if !decodeJSONBody(w, r, &body) {
			return
		}
		field, err := s.store.createCustomField(r.Context(), p, body)
		if err != nil {
			writeCustomFieldError(w, err, "create custom field")
			return
		}
		writeJSON(w, http.StatusCreated, customFieldEnvelope{field})
		return
	}
	p, ok := s.authenticateWithStore(w, r, "custom-fields:read")
	if !ok {
		return
	}
	fields, err := s.store.listCustomFields(r.Context(), p)
	if err != nil {
		writeCustomFieldError(w, err, "list custom fields")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		CustomFields []customfield.Field `json:"customFields"`
	}{fields})
}

// customField reads (GET), patches (PATCH), or deletes (DELETE) one field, by ID or key.
func (s apiServer) customField(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPatch, http.MethodDelete) {
		return
	}
	fieldID, ok := pathID(w, r, "fieldId")
	if !ok {
		return
	}
	permission := "custom-fields:write"
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		permission = "custom-fields:read"
	}
	p, ok := s.authenticateWithStore(w, r, permission)
	if !ok {
		return
	}
	switch r.Method {
	case http.MethodPatch:
		var body customfield.UpdateInput
		if !decodeJSONBody(w, r, &body) {
			return
		}
		if body.Empty() {
			writeError(w, http.StatusBadRequest, "invalid_body", "Provide name, description, or options")
			return
		}
		field, err := s.store.updateCustomField(r.Context(), p, fieldID, body)
		if err != nil {
			writeCustomFieldError(w, err, "update custom field")
			return
		}
		writeJSON(w, http.StatusOK, customFieldEnvelope{field})
	case http.MethodDelete:
		if err := s.store.deleteCustomField(r.Context(), p, fieldID); err != nil {
			writeCustomFieldError(w, err, "delete custom field")
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		field, err := s.store.getCustomField(r.Context(), p, fieldID)
		if err != nil {
			writeCustomFieldError(w, err, "get custom field")
			return
		}
		writeJSON(w, http.StatusOK, customFieldEnvelope{field})
	}
}

// customFieldOptions lists one select field's options.
func (s apiServer) customFieldOptions(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	fieldID, ok := pathID(w, r, "fieldId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "custom-fields:read")
	if !ok {
		return
	}
	field, err := s.store.getCustomField(r.Context(), p, fieldID)
	if err != nil {
		writeCustomFieldError(w, err, "list custom field options")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Options []customfield.Option `json:"options"`
	}{field.Options})
}

// projectCustomFields reads (GET) or sets (PUT) a project's custom field values.
func (s apiServer) projectCustomFields(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPut) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	permission := "projects:write"
	if r.Method == http.MethodGet || r.Method == http.MethodHead {
		permission = "projects:read"
	}
	p, ok := s.authenticateWithStore(w, r, permission)
	if !ok {
		return
	}
	var values []customfield.ProjectValue
	var err error
	if r.Method == http.MethodPut {
		var body struct {
			CustomFields map[string]json.RawMessage `json:"customFields"`
		}
		if !decodeJSONBody(w, r, &body) {
			return
		}
		values, err = s.store.setProjectCustomFields(r.Context(), p, projectID, body.CustomFields)
	} else {
		values, err = s.store.getProjectCustomFields(r.Context(), p, projectID)
	}
	if err != nil {
		writeCustomFieldError(w, err, "project custom fields")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		CustomFields []customfield.ProjectValue `json:"customFields"`
	}{values})
}
