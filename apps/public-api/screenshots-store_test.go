package main

import (
	"bytes"
	"context"
	"image"
	"image/png"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

type screenshotSigningStore struct {
	*memory.Store
}

func (s screenshotSigningStore) PresignUpload(_ context.Context, input objectstore.Upload, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{
		URL:       "https://objects.test/upload/" + input.Key,
		Method:    http.MethodPut,
		Headers:   http.Header{"Content-Type": []string{input.ContentType}},
		ExpiresAt: time.Now().Add(ttl),
	}, nil
}

func (s screenshotSigningStore) PresignDownload(_ context.Context, key string, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{
		URL:       "https://objects.test/download/" + key,
		Method:    http.MethodGet,
		ExpiresAt: time.Now().Add(ttl),
	}, nil
}

func screenshotObjects(t *testing.T) *objectstore.Registry {
	t.Helper()
	registry, err := objectstore.NewRegistry("r2-primary", map[string]objectstore.Store{
		"r2-primary": screenshotSigningStore{Store: memory.New()},
	})
	require.NoError(t, err)
	return registry
}

func mustScreenshotPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, width, height))))
	return buf.Bytes()
}

func TestScreenshotStoreUploadBindAndList(t *testing.T) {
	f := newDBFixture(t)
	f.store.objects = screenshotObjects(t)
	f.sourceFile(t, "locales/en.json")
	home := f.createString(t, "locales/en.json", "home.title", "Home", nil)
	pay := f.createString(t, "locales/en.json", "checkout.pay", "Pay", nil)
	png := mustScreenshotPNG(t, 4, 4)

	created, err := f.store.createScreenshot(t.Context(), f.actor, f.project, screenshotCreate{
		Filename: "Home screen.PNG", ContentType: "image/png", ByteSize: int64(len(png)),
		Name: strPtr("Home"), Width: intPtr(4), Height: intPtr(4),
		Markers: []screenshotMarkerInput{{
			StringID: home.ID,
			Marker:   &screenshotMarkerBox{Left: 10, Top: 20, Width: 30, Height: 15},
		}},
	})
	require.NoError(t, err)
	require.Equal(t, "upload_pending", created.Screenshot.Status)
	require.Equal(t, "Home_screen.PNG", created.Screenshot.Filename)
	require.Len(t, created.Screenshot.Markers, 1)
	require.Equal(t, home.ID, created.Screenshot.Markers[0].StringID)
	require.Equal(t, "home.title", created.Screenshot.Markers[0].Key)
	objectKey := strings.TrimPrefix(created.Upload.URL, "https://objects.test/upload/")
	_, _, err = f.store.objects.Put(t.Context(), objectstore.PutInput{
		Key: objectKey, Body: bytes.NewReader(png), Size: int64(len(png)), ContentType: "image/png", IfAbsent: true,
	})
	require.NoError(t, err)

	ready, err := f.store.finalizeScreenshot(t.Context(), f.actor, f.project, created.Screenshot.ID, screenshotFinalize{})
	require.NoError(t, err)
	require.Equal(t, "ready", ready.Status)
	require.NotNil(t, ready.ImageURL)
	require.Contains(t, *ready.ImageURL, "visual-context/")
	require.Equal(t, 4, *ready.Width)
	require.Len(t, ready.Markers, 1)

	added, err := f.store.upsertScreenshotMarkers(t.Context(), f.actor, f.project, ready.ID, []screenshotMarkerInput{{
		Key:    "checkout.pay",
		Marker: &screenshotMarkerBox{Left: 50, Top: 50, Width: 10, Height: 10},
	}})
	require.NoError(t, err)
	require.Equal(t, pay.ID, added[0].StringID)

	listed, total, err := f.store.listScreenshots(t.Context(), f.actor, f.project, screenshotFilters{
		StringID: pay.ID, Status: "ready", Limit: 50,
	})
	require.NoError(t, err)
	require.Equal(t, 1, total)
	require.Len(t, listed, 1)
	require.Len(t, listed[0].Markers, 2)

	require.NoError(t, f.store.deleteScreenshotMarker(t.Context(), f.actor, f.project, ready.ID, added[0].ID))
	got, err := f.store.getScreenshot(t.Context(), f.actor, f.project, ready.ID)
	require.NoError(t, err)
	require.Len(t, got.Markers, 1)
	require.Equal(t, home.ID, got.Markers[0].StringID)

	require.NoError(t, f.store.deleteScreenshot(t.Context(), f.actor, f.project, ready.ID))
	_, err = f.store.getScreenshot(t.Context(), f.actor, f.project, ready.ID)
	require.ErrorIs(t, err, errScreenshotNotFound)
}

func TestScreenshotStoreRejectsInvalidUploadAndAmbiguousKeys(t *testing.T) {
	f := newDBFixture(t)
	f.store.objects = screenshotObjects(t)
	f.sourceFile(t, "a.json")
	f.sourceFile(t, "b.json")
	f.createString(t, "a.json", "shared", "A", nil)
	f.createString(t, "b.json", "shared", "B", nil)

	_, err := f.store.createScreenshot(t.Context(), f.actor, f.project, screenshotCreate{
		Filename: "shot.gif", ContentType: "image/gif", ByteSize: 12,
	})
	require.ErrorIs(t, err, errScreenshotInvalidFilename)

	png := mustScreenshotPNG(t, 2, 2)
	created, err := f.store.createScreenshot(t.Context(), f.actor, f.project, screenshotCreate{
		Filename: "shot.png", ContentType: "image/png", ByteSize: int64(len(png)),
	})
	require.NoError(t, err)
	_, err = f.store.finalizeScreenshot(t.Context(), f.actor, f.project, created.Screenshot.ID, screenshotFinalize{})
	require.ErrorIs(t, err, errScreenshotUploadMissing)

	_, _, err = f.store.objects.Put(t.Context(), objectstore.PutInput{
		Key:  strings.TrimPrefix(created.Upload.URL, "https://objects.test/upload/"),
		Body: bytes.NewReader([]byte("not-an-image")), Size: int64(len("not-an-image")),
		ContentType: "image/png", IfAbsent: true,
	})
	require.NoError(t, err)
	_, err = f.store.finalizeScreenshot(t.Context(), f.actor, f.project, created.Screenshot.ID, screenshotFinalize{})
	require.ErrorIs(t, err, errScreenshotInvalidImage)
	_, err = f.store.getScreenshot(t.Context(), f.actor, f.project, created.Screenshot.ID)
	require.ErrorIs(t, err, errScreenshotNotFound)

	created, err = f.store.createScreenshot(t.Context(), f.actor, f.project, screenshotCreate{
		Filename: "ok.png", ContentType: "image/png", ByteSize: int64(len(png)),
	})
	require.NoError(t, err)
	_, err = f.store.upsertScreenshotMarkers(t.Context(), f.actor, f.project, created.Screenshot.ID, []screenshotMarkerInput{{Key: "shared"}})
	require.ErrorIs(t, err, errScreenshotAmbiguousKey)
	added, err := f.store.upsertScreenshotMarkers(t.Context(), f.actor, f.project, created.Screenshot.ID, []screenshotMarkerInput{{
		Key: "shared", FilePath: "b.json",
	}})
	require.NoError(t, err)
	require.Equal(t, "shared", added[0].Key)
	require.Equal(t, "b.json", *added[0].FilePath)
}

func TestScreenshotStoreRequiresNativeAndStorage(t *testing.T) {
	f := newDBFixture(t)
	_, err := f.store.createScreenshot(t.Context(), f.actor, f.project, screenshotCreate{
		Filename: "a.png", ContentType: "image/png", ByteSize: 12,
	})
	require.ErrorIs(t, err, errScreenshotStorageUnavailable)

	f.store.objects = screenshotObjects(t)
	f.exec(t, `UPDATE projects SET source = 'external_tms' WHERE id = $1`, f.project)
	_, err = f.store.createScreenshot(t.Context(), f.actor, f.project, screenshotCreate{
		Filename: "a.png", ContentType: "image/png", ByteSize: 12,
	})
	require.ErrorIs(t, err, errProjectNotNative)
}

func strPtr(v string) *string { return &v }
func intPtr(v int) *int       { return &v }
