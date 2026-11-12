package main

import (
	"context"
	"net/http"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

type fakeScreenshotStore struct {
	screenshotErr     error
	screenshots       []screenshot
	screenshot        screenshot
	screenshotCreate  screenshotCreate
	screenshotFinal   screenshotFinalize
	screenshotMarkers []screenshotMarkerInput
	screenshotID      string
	markerID          string
	screenshotFilters screenshotFilters
	createdResult     screenshotCreateResult
	deletedScreenshot bool
	deletedMarker     bool
	screenshotTotal   int
}

func (s *fakeScreenshotStore) listScreenshots(_ context.Context, _ principal, _ string, filters screenshotFilters) ([]screenshot, int, error) {
	s.screenshotFilters = filters
	return s.screenshots, s.screenshotTotal, s.screenshotErr
}

func (s *fakeScreenshotStore) getScreenshot(_ context.Context, _ principal, _, screenshotID string) (screenshot, error) {
	s.screenshotID = screenshotID
	if s.screenshotErr != nil {
		return screenshot{}, s.screenshotErr
	}
	item := s.screenshot
	if item.ID == "" {
		item.ID = screenshotID
	}
	return item, nil
}

func (s *fakeScreenshotStore) createScreenshot(_ context.Context, _ principal, _ string, input screenshotCreate) (screenshotCreateResult, error) {
	s.screenshotCreate = input
	if s.screenshotErr != nil {
		return screenshotCreateResult{}, s.screenshotErr
	}
	if s.createdResult.Screenshot.ID != "" {
		return s.createdResult, nil
	}
	return screenshotCreateResult{
		Screenshot: screenshot{ID: "shot-1", Filename: input.Filename, Status: "upload_pending", Markers: []screenshotMarker{}},
		Upload:     screenshotUpload{URL: "https://objects.test/upload", Method: http.MethodPut, Headers: map[string][]string{"Content-Type": {input.ContentType}}, ExpiresAt: time.Date(2026, 11, 13, 0, 0, 0, 0, time.UTC)},
	}, nil
}

func (s *fakeScreenshotStore) finalizeScreenshot(_ context.Context, _ principal, _, screenshotID string, input screenshotFinalize) (screenshot, error) {
	s.screenshotID, s.screenshotFinal = screenshotID, input
	if s.screenshotErr != nil {
		return screenshot{}, s.screenshotErr
	}
	item := s.screenshot
	if item.ID == "" {
		item.ID = screenshotID
		item.Status = "ready"
	}
	return item, nil
}

func (s *fakeScreenshotStore) deleteScreenshot(_ context.Context, _ principal, _, screenshotID string) error {
	s.screenshotID, s.deletedScreenshot = screenshotID, true
	return s.screenshotErr
}

func (s *fakeScreenshotStore) upsertScreenshotMarkers(_ context.Context, _ principal, _, screenshotID string, inputs []screenshotMarkerInput) ([]screenshotMarker, error) {
	s.screenshotID, s.screenshotMarkers = screenshotID, inputs
	if s.screenshotErr != nil {
		return nil, s.screenshotErr
	}
	markers := make([]screenshotMarker, len(inputs))
	for i, input := range inputs {
		markers[i] = screenshotMarker{ID: "marker-1", ScreenshotID: screenshotID, StringID: input.StringID, Key: input.Key, Marker: input.Marker, Source: "manual"}
	}
	return markers, nil
}

func (s *fakeScreenshotStore) deleteScreenshotMarker(_ context.Context, _ principal, _, screenshotID, markerID string) error {
	s.screenshotID, s.markerID, s.deletedMarker = screenshotID, markerID, true
	return s.screenshotErr
}

func TestScreenshotRoutes(t *testing.T) {
	shotID := "9f1f3d5e-4a61-4c4e-9f43-0d6a1c3b2a10"
	markerID := "8e0e2c4d-3960-4b3d-8e32-fc590b2a1910"

	t.Run("list parses filters", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.screenshots = []screenshot{{ID: shotID, Status: "ready", Markers: []screenshotMarker{}}}
		store.screenshotTotal = 1
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet,
			"/v1/projects/project-1/screenshots?stringId="+shotID+"&status=ready&limit=10", "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, screenshotFilters{StringID: shotID, Status: "ready", Limit: 10}, store.screenshotFilters)
		require.Contains(t, w.Body.String(), `"pagination":{"offset":0,"limit":10,"total":1}`)
	})

	t.Run("list rejects mixed stringId and key", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodGet,
			"/v1/projects/project-1/screenshots?stringId="+shotID+"&key=home.title", "")
		require.Equal(t, http.StatusBadRequest, w.Code)
	})

	t.Run("create requires write and returns an upload", func(t *testing.T) {
		w := sendResource(t, resourcePrincipal(readScopes...), &fakeResourceStore{}, http.MethodPost,
			"/v1/projects/project-1/screenshots", `{"filename":"checkout.png","contentType":"image/png","byteSize":128}`)
		require.Equal(t, http.StatusForbidden, w.Code)

		store := &fakeResourceStore{}
		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost,
			"/v1/projects/project-1/screenshots",
			`{"filename":"Checkout Photo.PNG","contentType":"image/png","byteSize":128,"name":"Checkout","markers":[{"stringId":"`+validStringID+`","marker":{"left":10,"top":20,"width":30,"height":15}}]}`)
		require.Equal(t, http.StatusCreated, w.Code, w.Body.String())
		require.Equal(t, "Checkout Photo.PNG", store.screenshotCreate.Filename)
		require.Equal(t, int64(128), store.screenshotCreate.ByteSize)
		require.Equal(t, validStringID, store.screenshotCreate.Markers[0].StringID)
		require.Contains(t, w.Body.String(), `"status":"upload_pending"`)
		require.Contains(t, w.Body.String(), `"upload"`)
	})

	t.Run("create maps storage errors", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.screenshotErr = errScreenshotStorageUnavailable
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost,
			"/v1/projects/project-1/screenshots", `{"filename":"a.png","contentType":"image/png","byteSize":12}`)
		require.Equal(t, http.StatusServiceUnavailable, w.Code)
		require.Contains(t, w.Body.String(), "screenshot_storage_unavailable")
	})

	t.Run("get and delete one screenshot", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.screenshot = screenshot{ID: shotID, Status: "ready", Markers: []screenshotMarker{}}
		w := sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet,
			"/v1/projects/project-1/screenshots/"+shotID, "")
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, shotID, store.screenshotID)
		require.Contains(t, w.Body.String(), `"screenshot":{"id":"`+shotID+`"`)

		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodDelete,
			"/v1/projects/project-1/screenshots/"+shotID, "")
		require.Equal(t, http.StatusNoContent, w.Code)
		require.True(t, store.deletedScreenshot)

		store.screenshotErr = errScreenshotNotFound
		w = sendResource(t, resourcePrincipal(readScopes...), store, http.MethodGet,
			"/v1/projects/project-1/screenshots/"+shotID, "")
		require.Equal(t, http.StatusNotFound, w.Code)
		require.Contains(t, w.Body.String(), "screenshot_not_found")
	})

	t.Run("finalize accepts an empty object", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost,
			"/v1/projects/project-1/screenshots/"+shotID+"/finalize", `{"name":"Checkout"}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "Checkout", *store.screenshotFinal.Name)

		store.screenshotErr = errScreenshotUploadMissing
		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost,
			"/v1/projects/project-1/screenshots/"+shotID+"/finalize", `{}`)
		require.Equal(t, http.StatusConflict, w.Code)
		require.Contains(t, w.Body.String(), "screenshot_upload_missing")
	})

	t.Run("markers upsert and delete", func(t *testing.T) {
		store := &fakeResourceStore{}
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost,
			"/v1/projects/project-1/screenshots/"+shotID+"/markers",
			`{"markers":[{"key":"checkout.title","marker":{"left":1,"top":2,"width":3,"height":4}}]}`)
		require.Equal(t, http.StatusOK, w.Code, w.Body.String())
		require.Equal(t, "checkout.title", store.screenshotMarkers[0].Key)
		require.Equal(t, 3.0, store.screenshotMarkers[0].Marker.Width)

		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodDelete,
			"/v1/projects/project-1/screenshots/"+shotID+"/markers/"+markerID, "")
		require.Equal(t, http.StatusNoContent, w.Code)
		require.Equal(t, markerID, store.markerID)

		w = sendResource(t, resourcePrincipal(writeScopes...), &fakeResourceStore{}, http.MethodPost,
			"/v1/projects/project-1/screenshots/"+shotID+"/markers", `{"markers":[]}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), "too_many_markers")
	})

	t.Run("maps native-only and missing strings", func(t *testing.T) {
		store := &fakeResourceStore{}
		store.screenshotErr = errProjectNotNative
		w := sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost,
			"/v1/projects/project-1/screenshots", `{"filename":"a.png","contentType":"image/png","byteSize":12}`)
		require.Equal(t, http.StatusConflict, w.Code)
		require.Contains(t, w.Body.String(), "project_not_native")

		store.screenshotErr = errScreenshotAmbiguousKey
		w = sendResource(t, resourcePrincipal(writeScopes...), store, http.MethodPost,
			"/v1/projects/project-1/screenshots/"+shotID+"/markers", `{"markers":[{"key":"shared"}]}`)
		require.Equal(t, http.StatusBadRequest, w.Code)
		require.Contains(t, w.Body.String(), "ambiguous_key")
	})
}

func TestScreenshotValidationHelpers(t *testing.T) {
	filename, contentType, err := normalizeScreenshotUpload("Checkout Photo.PNG", "image/png")
	require.NoError(t, err)
	require.Equal(t, "Checkout_Photo.PNG", filename)
	require.Equal(t, "image/png", contentType)

	_, _, err = normalizeScreenshotUpload("shot.png", "image/jpeg")
	require.ErrorIs(t, err, errScreenshotInvalidContentType)

	_, _, err = normalizeScreenshotUpload("shot.gif", "")
	require.ErrorIs(t, err, errScreenshotInvalidFilename)

	require.NoError(t, validateScreenshotMarkerBox(&screenshotMarkerBox{Left: 10, Top: 20, Width: 30, Height: 15}))
	require.ErrorIs(t, validateScreenshotMarkerBox(&screenshotMarkerBox{Left: 90, Top: 0, Width: 20, Height: 10}), errScreenshotInvalidMarker)

	status, ok := parseScreenshotStatus("ready")
	require.True(t, ok)
	require.Equal(t, "ready", status)
	_, ok = parseScreenshotStatus("pending")
	require.False(t, ok)
}
