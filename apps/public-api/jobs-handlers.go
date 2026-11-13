package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"
)

var jobErrorResponses = []storeErrorResponse{
	{errJobNotFound, http.StatusNotFound, "job_not_found", "Job not found"},
	{errJobNotUpdatable, http.StatusConflict, "provider_job_not_updatable", "Provider-backed jobs are updated in the TMS provider"},
	{errJobProjectRequired, http.StatusBadRequest, "project_required", "Job must belong to a project to update its owner or details"},
	{errJobOwnerNotFound, http.StatusBadRequest, "owner_not_found", "ownerEmail must belong to a workspace member"},
	{errJobOwnerUnassigable, http.StatusBadRequest, "assignee_not_assignable", "The owner must be an active member with project access"},
}

func writeJobStoreError(w http.ResponseWriter, err error, operation string) {
	for _, response := range jobErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeStoreError(w, err, operation)
}

func (s apiServer) jobs(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet) {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "jobs:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	page, valid := parsePagination(w, values, 25)
	if !valid {
		return
	}
	filters := jobFilters{
		ProjectID: strings.TrimSpace(values.Get("projectId")),
		Status:    values.Get("status"),
		Kind:      values.Get("kind"),
		Limit:     page.Limit,
		Offset:    page.Offset,
	}
	if len(filters.ProjectID) > 128 || (filters.Status != "" && !member(filters.Status, jobStatuses...)) ||
		(filters.Kind != "" && !member(filters.Kind, jobKinds...)) {
		writeError(w, http.StatusBadRequest, "invalid_query", "One or more query filters are invalid")
		return
	}
	items, total, err := s.store.listJobs(r.Context(), p, filters)
	if err != nil {
		writeJobStoreError(w, err, "list jobs")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		Jobs       []job      `json:"jobs"`
		Pagination pagination `json:"pagination"`
	}{items, page})
}

func (s apiServer) job(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPatch) {
		return
	}
	jobID, ok := pathID(w, r, "jobId")
	if !ok {
		return
	}
	if r.Method == http.MethodPatch {
		s.updateJob(w, r, jobID)
		return
	}
	p, ok := s.authenticateWithStore(w, r, "jobs:read")
	if !ok {
		return
	}
	item, err := s.store.getJob(r.Context(), p, jobID)
	if err != nil {
		writeJobStoreError(w, err, "get job")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Job job `json:"job"`
	}{item})
}

// jobPatchBody is the body of a job update; a bulk update adds jobIds.
type jobPatchBody struct {
	Title       *string        `json:"title"`
	Description optionalString `json:"description"`
	DueAt       optionalTime   `json:"dueAt"`
	OwnerEmail  optionalString `json:"ownerEmail"`
}

// patch trims and checks the body. It reports false when no field is set or a value is invalid.
func (b jobPatchBody) patch() (jobPatch, bool) {
	if b.Title != nil {
		trimmed := strings.TrimSpace(*b.Title)
		b.Title = &trimmed
	}
	b.Description.Value = trimmedOrNil(b.Description.Value)
	b.OwnerEmail.Value = trimmedOrNil(b.OwnerEmail.Value)
	empty := b.Title == nil && !b.Description.Set && !b.DueAt.Set && !b.OwnerEmail.Set
	validOwner := b.OwnerEmail.Value == nil || validEmail(*b.OwnerEmail.Value)
	if empty || (b.Title != nil && (*b.Title == "" || len(*b.Title) > 256)) ||
		!validOptionalText(b.Description.Value, 2048) || !validOwner {
		return jobPatch{}, false
	}
	return jobPatch(b), true
}

func (s apiServer) updateJob(w http.ResponseWriter, r *http.Request, jobID string) {
	p, ok := s.authenticateWithStore(w, r, "jobs:write")
	if !ok {
		return
	}
	var body jobPatchBody
	if !decodeJSONBody(w, r, &body) {
		return
	}
	patch, valid := body.patch()
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid_body", "Provide title, description, dueAt, or ownerEmail with valid values")
		return
	}
	item, err := s.store.updateJob(r.Context(), p, jobID, patch)
	if err != nil {
		writeJobStoreError(w, err, "update job")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Job job `json:"job"`
	}{item})
}

// maxBulkJobs caps the jobs one bulk update changes.
const maxBulkJobs = 100

// jobsBulkUpdate applies one change to many jobs, all or nothing.
func (s apiServer) jobsBulkUpdate(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "jobs:write")
	if !ok {
		return
	}
	var body struct {
		JobIDs []string `json:"jobIds"`
		jobPatchBody
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	patch, valid := body.patch()
	jobIDs := make([]string, 0, len(body.JobIDs))
	seen := map[string]struct{}{}
	for _, id := range body.JobIDs {
		id = strings.TrimSpace(id)
		if id == "" || len(id) > 128 {
			valid = false
			break
		}
		if _, dup := seen[id]; !dup {
			seen[id] = struct{}{}
			jobIDs = append(jobIDs, id)
		}
	}
	if !valid || len(jobIDs) == 0 || len(jobIDs) > maxBulkJobs {
		writeError(w, http.StatusBadRequest, "invalid_body",
			"Provide 1 to 100 jobIds and at least one of title, description, dueAt, or ownerEmail with valid values")
		return
	}
	items, err := s.store.bulkUpdateJobs(r.Context(), p, jobIDs, patch)
	if err != nil {
		// Name the job that stopped the update, so the caller can fix or drop it and retry.
		var bulk jobBulkError
		if errors.As(err, &bulk) {
			for _, response := range jobErrorResponses {
				if errors.Is(err, response.err) {
					writeJSON(w, response.status, struct {
						Error   string            `json:"error"`
						Message string            `json:"message"`
						Details map[string]string `json:"details"`
					}{response.code, response.message, map[string]string{"jobId": bulk.JobID}})
					return
				}
			}
		}
		writeJobStoreError(w, err, "bulk update jobs")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Jobs []job `json:"jobs"`
	}{items})
}

func validEmail(value string) bool {
	if len(value) > 320 {
		return false
	}
	address, err := mail.ParseAddress(value)
	return err == nil && address.Address == value
}

// optionalTime tells an omitted field from an explicit null. Values are RFC 3339 timestamps.
type optionalTime struct {
	Set   bool
	Value *time.Time
}

func (o *optionalTime) UnmarshalJSON(data []byte) error {
	o.Set = true
	var raw *string
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if raw == nil {
		o.Value = nil
		return nil
	}
	parsed, err := time.Parse(time.RFC3339, *raw)
	if err != nil {
		return err
	}
	o.Value = &parsed
	return nil
}
