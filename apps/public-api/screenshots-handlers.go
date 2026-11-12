package main

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
)

var screenshotErrorResponses = []storeErrorResponse{
	{errScreenshotNotFound, http.StatusNotFound, "screenshot_not_found", "Screenshot not found"},
	{errScreenshotMarkerNotFound, http.StatusNotFound, "screenshot_marker_not_found", "Screenshot marker not found"},
	{errScreenshotStorageUnavailable, http.StatusServiceUnavailable, "screenshot_storage_unavailable", "Screenshot storage is unavailable"},
	{errScreenshotUploadMissing, http.StatusConflict, "screenshot_upload_missing", "PUT the image to the upload URL before finalizing"},
	{errScreenshotNotPending, http.StatusConflict, "screenshot_not_pending", "The screenshot is no longer waiting for upload"},
	{errScreenshotUploadTooLarge, http.StatusRequestEntityTooLarge, "screenshot_too_large", "Screenshots must be between 1 byte and 10 MB"},
	{errScreenshotInvalidImage, http.StatusUnsupportedMediaType, "screenshot_invalid_image", "The uploaded file is not a valid PNG, JPEG, or WebP image"},
	{errScreenshotInvalidFilename, http.StatusBadRequest, "invalid_body", "Screenshots must be PNG, JPEG, or WebP with a matching filename"},
	{errScreenshotInvalidContentType, http.StatusBadRequest, "invalid_body", "Screenshot content type does not match the filename"},
	{errScreenshotInvalidMarker, http.StatusBadRequest, "invalid_body", "Each marker box is percent left, top, width and height that fit in the image"},
	{errScreenshotInvalidDimensions, http.StatusBadRequest, "invalid_body", "Screenshot width and height must be positive and within the supported limit"},
	{errScreenshotAmbiguousKey, http.StatusBadRequest, "ambiguous_key", "This key exists in more than one file; pass stringId or filePath"},
	{errTooManyScreenshotMarkers, http.StatusBadRequest, "too_many_markers", "A screenshot holds at most 1,000 markers"},
	{errScreenshotMarkerNeedsString, http.StatusBadRequest, "invalid_body", "Each marker picks a string with stringId, or key (and filePath when the key exists in more than one file)"},
}

func writeScreenshotError(w http.ResponseWriter, err error, operation string) {
	for _, response := range screenshotErrorResponses {
		if errors.Is(err, response.err) {
			writeError(w, response.status, response.code, response.message)
			return
		}
	}
	writeStoreError(w, err, operation)
}

type screenshotMarkerBody struct {
	StringID string               `json:"stringId"`
	Key      string               `json:"key"`
	FilePath string               `json:"filePath"`
	Marker   *screenshotMarkerBox `json:"marker"`
}

func (b screenshotMarkerBody) input() screenshotMarkerInput {
	return screenshotMarkerInput{
		StringID: strings.TrimSpace(b.StringID),
		Key:      strings.TrimSpace(b.Key),
		FilePath: strings.TrimSpace(b.FilePath),
		Marker:   b.Marker,
	}
}

func (s apiServer) projectScreenshots(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodPost) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	if r.Method == http.MethodPost {
		s.createScreenshot(w, r, projectID)
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:read")
	if !ok {
		return
	}
	values := r.URL.Query()
	page, valid := parsePagination(w, values, 50)
	if !valid {
		return
	}
	stringID := strings.TrimSpace(values.Get("stringId"))
	key := strings.TrimSpace(values.Get("key"))
	filePath := strings.TrimSpace(values.Get("filePath"))
	status, statusOK := parseScreenshotStatus(values.Get("status"))
	_, stringIDErr := uuid.Parse(stringID)
	if !statusOK || len(key) > 1000 || len(filePath) > 2048 || (stringID != "" && stringIDErr != nil) ||
		(stringID != "" && key != "") {
		writeError(w, http.StatusBadRequest, "invalid_query", "Filter with stringId or key, optional filePath and status=ready|upload_pending")
		return
	}
	if filePath != "" && stringID == "" && key == "" {
		writeError(w, http.StatusBadRequest, "invalid_query", "filePath filters with key")
		return
	}
	screenshots, total, err := s.store.listScreenshots(r.Context(), p, projectID, screenshotFilters{
		StringID: stringID, Key: key, FilePath: filePath, Status: status, Limit: page.Limit, Offset: page.Offset,
	})
	if err != nil {
		writeScreenshotError(w, err, "list screenshots")
		return
	}
	page.Total = total
	writeJSON(w, http.StatusOK, struct {
		Screenshots []screenshot `json:"screenshots"`
		Pagination  pagination   `json:"pagination"`
	}{screenshots, page})
}

func (s apiServer) createScreenshot(w http.ResponseWriter, r *http.Request, projectID string) {
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return
	}
	var body struct {
		Filename    string                 `json:"filename"`
		ContentType string                 `json:"contentType"`
		ByteSize    int64                  `json:"byteSize"`
		Name        *string                `json:"name"`
		Width       *int                   `json:"width"`
		Height      *int                   `json:"height"`
		Markers     []screenshotMarkerBody `json:"markers"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if len(body.Markers) > screenshotMaxMarkers {
		writeError(w, http.StatusBadRequest, "too_many_markers", "A screenshot holds at most 1,000 markers")
		return
	}
	markers := make([]screenshotMarkerInput, len(body.Markers))
	for i, marker := range body.Markers {
		markers[i] = marker.input()
	}
	result, err := s.store.createScreenshot(r.Context(), p, projectID, screenshotCreate{
		Filename: body.Filename, ContentType: body.ContentType, ByteSize: body.ByteSize,
		Name: body.Name, Width: body.Width, Height: body.Height, Markers: markers,
	})
	if err != nil {
		writeScreenshotError(w, err, "create screenshot")
		return
	}
	writeJSON(w, http.StatusCreated, result)
}

func (s apiServer) projectScreenshot(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodGet, http.MethodDelete) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	screenshotID, ok := pathID(w, r, "screenshotId")
	if !ok {
		return
	}
	permission := "strings:read"
	if r.Method == http.MethodDelete {
		permission = "strings:write"
	}
	p, ok := s.authenticateWithStore(w, r, permission)
	if !ok {
		return
	}
	if r.Method == http.MethodDelete {
		if err := s.store.deleteScreenshot(r.Context(), p, projectID, screenshotID); err != nil {
			writeScreenshotError(w, err, "delete screenshot")
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	item, err := s.store.getScreenshot(r.Context(), p, projectID, screenshotID)
	if err != nil {
		writeScreenshotError(w, err, "get screenshot")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Screenshot screenshot `json:"screenshot"`
	}{item})
}

func (s apiServer) projectScreenshotFinalize(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	screenshotID, ok := pathID(w, r, "screenshotId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return
	}
	var body screenshotFinalize
	if !decodeJSONBody(w, r, &body) {
		return
	}
	item, err := s.store.finalizeScreenshot(r.Context(), p, projectID, screenshotID, body)
	if err != nil {
		writeScreenshotError(w, err, "finalize screenshot")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Screenshot screenshot `json:"screenshot"`
	}{item})
}

func (s apiServer) projectScreenshotMarkers(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodPost) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	screenshotID, ok := pathID(w, r, "screenshotId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return
	}
	var body struct {
		Markers []screenshotMarkerBody `json:"markers"`
	}
	if !decodeJSONBody(w, r, &body) {
		return
	}
	if len(body.Markers) == 0 || len(body.Markers) > screenshotMaxMarkers {
		writeError(w, http.StatusBadRequest, "too_many_markers", "Send between 1 and 1,000 markers")
		return
	}
	inputs := make([]screenshotMarkerInput, len(body.Markers))
	for i, marker := range body.Markers {
		inputs[i] = marker.input()
	}
	markers, err := s.store.upsertScreenshotMarkers(r.Context(), p, projectID, screenshotID, inputs)
	if err != nil {
		writeScreenshotError(w, err, "upsert screenshot markers")
		return
	}
	writeJSON(w, http.StatusOK, struct {
		Markers []screenshotMarker `json:"markers"`
	}{markers})
}

func (s apiServer) projectScreenshotMarker(w http.ResponseWriter, r *http.Request) {
	if !allowMethods(w, r, http.MethodDelete) {
		return
	}
	projectID, ok := pathID(w, r, "projectId")
	if !ok {
		return
	}
	screenshotID, ok := pathID(w, r, "screenshotId")
	if !ok {
		return
	}
	markerID, ok := pathID(w, r, "markerId")
	if !ok {
		return
	}
	p, ok := s.authenticateWithStore(w, r, "strings:write")
	if !ok {
		return
	}
	if err := s.store.deleteScreenshotMarker(r.Context(), p, projectID, screenshotID, markerID); err != nil {
		writeScreenshotError(w, err, "delete screenshot marker")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
