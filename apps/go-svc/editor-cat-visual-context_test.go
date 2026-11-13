package main

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"image"
	"image/png"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/HugoSmits86/nativewebp"
	"github.com/google/uuid"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

type visualContextSigningStore struct {
	*memory.Store
}

func (s visualContextSigningStore) PresignUpload(_ context.Context, input objectstore.Upload, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{
		URL:       "https://objects.test/upload/" + input.Key,
		Method:    http.MethodPut,
		Headers:   http.Header{"Content-Type": []string{input.ContentType}},
		ExpiresAt: time.Now().Add(ttl),
	}, nil
}

func (s visualContextSigningStore) PresignDownload(_ context.Context, key string, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{
		URL:       "https://objects.test/download/" + key,
		Method:    http.MethodGet,
		ExpiresAt: time.Now().Add(ttl),
	}, nil
}

func visualContextObjectRegistry(t *testing.T) *objectstore.Registry {
	t.Helper()
	registry, err := objectstore.NewRegistry("r2-primary", map[string]objectstore.Store{
		"r2-primary": visualContextSigningStore{Store: memory.New()},
	})
	require.NoError(t, err)
	return registry
}

func TestEditorCatVisualContextTMSDeferred(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	_, err := scope.Pool.Exec(t.Context(), `update projects set source='external_tms' where id=$1`, scope.ProjectID)
	require.NoError(t, err)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context"), `{"sourcePath":"a.json","externalStringId":"`+uuid.NewString()+`"}`)
	require.Equal(t, http.StatusNotImplemented, rec.Code)
	require.Contains(t, rec.Body.String(), "visual_context_deferred")
}

func TestEditorCatVisualContextEmptyNative(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context"), `{"sourcePath":"locales/en.json","externalStringId":"`+keyID+`"}`)
	require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
	var body struct {
		VisualContext struct {
			Screenshots []editorCatVisualContextScreenshot `json:"screenshots"`
		} `json:"visualContext"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
	require.Empty(t, body.VisualContext.Screenshots)
}

func TestEditorCatVisualContextUploadBindAndLookup(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	keyID := mustEditorCatKey(t, scope, fileID, "checkout", "Checkout")

	create := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{
        "filename":"checkout.png",
        "contentType":"image/png","byteSize":128,
        "name":"Checkout screen",
        "width":800,
        "height":600,
        "sourcePath":"locales/en.json",
        "externalStringId":"`+keyID+`",
        "marker":{"left":10,"top":20,"width":30,"height":15}
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Screenshot struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"screenshot"`
		Binding *editorCatVisualContextBinding `json:"binding"`
		Upload  struct {
			URL    string              `json:"url"`
			Method string              `json:"method"`
			Header map[string][]string `json:"headers"`
		} `json:"upload"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	require.Equal(t, "upload_pending", created.Screenshot.Status)
	require.NotEmpty(t, created.Screenshot.ID)
	require.NotNil(t, created.Binding)
	require.Equal(t, keyID, created.Binding.ExternalStringID)
	require.Equal(t, http.MethodPut, created.Upload.Method)
	require.Contains(t, created.Upload.URL, "visual-context/")

	png := mustVisualContextPNG(t, 2, 2)
	_, _, err := api.objects.Put(t.Context(), objectstore.PutInput{
		Key:         strings.TrimPrefix(created.Upload.URL, "https://objects.test/upload/"),
		Body:        bytes.NewReader(png),
		Size:        int64(len(png)),
		ContentType: "image/png",
		IfAbsent:    true,
	})
	require.NoError(t, err)

	finalize := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+created.Screenshot.ID+"/finalize"), `{}`)
	require.Equal(t, http.StatusOK, finalize.Code, finalize.Body.String())
	var finalized struct {
		Screenshot editorCatVisualContextScreenshot `json:"screenshot"`
	}
	require.NoError(t, json.Unmarshal(finalize.Body.Bytes(), &finalized))
	require.Equal(t, created.Screenshot.ID, finalized.Screenshot.ID)
	require.Equal(t, "https://objects.test/download/"+strings.TrimPrefix(created.Upload.URL, "https://objects.test/upload/"), finalized.Screenshot.ImageURL)

	lookup := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context"), `{"sourcePath":"locales/en.json","externalStringId":"`+keyID+`"}`)
	require.Equal(t, http.StatusOK, lookup.Code, lookup.Body.String())
	var body struct {
		VisualContext struct {
			Screenshots []editorCatVisualContextScreenshot `json:"screenshots"`
		} `json:"visualContext"`
	}
	require.NoError(t, json.Unmarshal(lookup.Body.Bytes(), &body))
	require.Len(t, body.VisualContext.Screenshots, 1)
	require.Equal(t, created.Screenshot.ID, body.VisualContext.Screenshots[0].ID)
	require.Equal(t, "Checkout screen", *body.VisualContext.Screenshots[0].Name)
	require.Equal(t, []editorCatVisualContextMarker{{Left: 10, Top: 20, Width: 30, Height: 15}}, body.VisualContext.Screenshots[0].Markers)
}

func TestEditorCatVisualContextBindUnbindAndDelete(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	firstKey := mustEditorCatKey(t, scope, fileID, "one", "One")
	secondKey := mustEditorCatKey(t, scope, fileID, "two", "Two")

	create := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{
        "filename":"screen.webp",
        "contentType":"image/webp","byteSize":128,
        "sourcePath":"locales/en.json",
        "externalStringId":"`+firstKey+`"
    }`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Screenshot struct {
			ID string `json:"id"`
		} `json:"screenshot"`
		Upload struct {
			URL string `json:"url"`
		} `json:"upload"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	payload := mustVisualContextWebP(t, 2, 2)
	_, _, err := api.objects.Put(t.Context(), objectstore.PutInput{
		Key:         strings.TrimPrefix(created.Upload.URL, "https://objects.test/upload/"),
		Body:        bytes.NewReader(payload),
		Size:        int64(len(payload)),
		ContentType: "image/webp",
		IfAbsent:    true,
	})
	require.NoError(t, err)
	finalize := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+created.Screenshot.ID+"/finalize"), `{"name":"Shared"}`)
	require.Equal(t, http.StatusOK, finalize.Code, finalize.Body.String())

	bind := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+created.Screenshot.ID+"/bindings"), `{
        "sourcePath":"locales/en.json",
        "externalStringId":"`+secondKey+`",
        "marker":{"left":5,"top":5,"width":10,"height":10}
    }`)
	require.Equal(t, http.StatusOK, bind.Code, bind.Body.String())
	var bound struct {
		Binding editorCatVisualContextBinding `json:"binding"`
	}
	require.NoError(t, json.Unmarshal(bind.Body.Bytes(), &bound))
	require.Equal(t, secondKey, bound.Binding.ExternalStringID)

	secondLookup := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context"), `{"sourcePath":"locales/en.json","externalStringId":"`+secondKey+`"}`)
	require.Equal(t, http.StatusOK, secondLookup.Code, secondLookup.Body.String())
	require.Contains(t, secondLookup.Body.String(), created.Screenshot.ID)

	unbind := editorCatRequestScope(api, scope, http.MethodDelete, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+created.Screenshot.ID+"/bindings/"+bound.Binding.ID), "")
	require.Equal(t, http.StatusNoContent, unbind.Code, unbind.Body.String())

	afterUnbind := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context"), `{"sourcePath":"locales/en.json","externalStringId":"`+secondKey+`"}`)
	require.Equal(t, http.StatusOK, afterUnbind.Code, afterUnbind.Body.String())
	require.NotContains(t, afterUnbind.Body.String(), `"id":"`+created.Screenshot.ID+`"`)

	del := editorCatRequestScope(api, scope, http.MethodDelete, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+created.Screenshot.ID), "")
	require.Equal(t, http.StatusNoContent, del.Code, del.Body.String())
	firstLookup := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context"), `{"sourcePath":"locales/en.json","externalStringId":"`+firstKey+`"}`)
	require.Equal(t, http.StatusOK, firstLookup.Code, firstLookup.Body.String())
	require.NotContains(t, firstLookup.Body.String(), created.Screenshot.ID)
}

func TestEditorCatVisualContextUploadValidation(t *testing.T) {
	api, scope := editorCatTestAPI(t, "translator")
	api.objects = visualContextObjectRegistry(t)
	fileID := mustEditorCatSourceFile(t, scope, "locales/en.json")
	keyID := mustEditorCatKey(t, scope, fileID, "hello", "Hello")

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{"filename":"notes.txt","contentType":"text/plain"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
	require.Contains(t, rec.Body.String(), "invalid_project_payload")

	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{"filename":"shot.png","contentType":"image/png","byteSize":128,"sourcePath":"locales/en.json"}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{"filename":"shot.png","contentType":"image/png","byteSize":128,"marker":{"left":10,"top":10,"width":10,"height":10}}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{"filename":"shot.png","contentType":"image/png","byteSize":128,"sourcePath":"locales/en.json","externalStringId":"`+keyID+`","marker":{"left":-1,"top":0,"width":10,"height":10}}`)
	require.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestEditorCatVisualContextMemberCannotUpload(t *testing.T) {
	api, scope := editorCatTestAPI(t, "member")
	api.objects = visualContextObjectRegistry(t)
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{"filename":"shot.png","contentType":"image/png","byteSize":128}`)
	require.Equal(t, http.StatusForbidden, rec.Code)
	require.Contains(t, rec.Body.String(), "forbidden")
}

func TestEditorCatVisualContextFinalizeTooLargeCleansUp(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.objects = visualContextObjectRegistry(t)
	create := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{"filename":"shot.png","contentType":"image/png","byteSize":128}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Screenshot struct {
			ID string `json:"id"`
		} `json:"screenshot"`
		Upload struct {
			URL string `json:"url"`
		} `json:"upload"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	objectKey := strings.TrimPrefix(created.Upload.URL, "https://objects.test/upload/")
	payload := bytes.Repeat([]byte{0x89}, visualContextMaxBytes+1)
	_, _, err := api.objects.Put(t.Context(), objectstore.PutInput{
		Key:         objectKey,
		Body:        bytes.NewReader(payload),
		Size:        int64(len(payload)),
		ContentType: "image/png",
		IfAbsent:    true,
	})
	require.NoError(t, err)

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+created.Screenshot.ID+"/finalize"), `{}`)
	require.Equal(t, http.StatusRequestEntityTooLarge, rec.Code)
	require.Contains(t, rec.Body.String(), "visual_context_upload_too_large")

	var leftoverID string
	err = scope.Pool.QueryRow(t.Context(), `
        select id from project_visual_context_screenshots
        where id=$1 and organization_id=$2 and project_id=$3`,
		created.Screenshot.ID, scope.OrganizationID, scope.ProjectID,
	).Scan(&leftoverID)
	require.ErrorIs(t, err, pgx.ErrNoRows)

	store, err := api.objects.Resolve("r2-primary")
	require.NoError(t, err)
	_, err = store.Stat(t.Context(), objectKey)
	require.ErrorIs(t, err, objectstore.ErrNotFound)
}

func TestEditorCatVisualContextFinalizeInvalidImageCleansUp(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.objects = visualContextObjectRegistry(t)
	create := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{"filename":"shot.png","contentType":"image/png","byteSize":128}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Screenshot struct {
			ID string `json:"id"`
		} `json:"screenshot"`
		Upload struct {
			URL string `json:"url"`
		} `json:"upload"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	objectKey := strings.TrimPrefix(created.Upload.URL, "https://objects.test/upload/")
	payload := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 120)...)
	_, _, err := api.objects.Put(t.Context(), objectstore.PutInput{
		Key:         objectKey,
		Body:        bytes.NewReader(payload),
		Size:        int64(len(payload)),
		ContentType: "image/png",
		IfAbsent:    true,
	})
	require.NoError(t, err)

	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+created.Screenshot.ID+"/finalize"), `{}`)
	require.Equal(t, http.StatusUnsupportedMediaType, rec.Code)
	require.Contains(t, rec.Body.String(), "visual_context_upload_invalid_image")

	var leftoverID string
	err = scope.Pool.QueryRow(t.Context(), `
        select id from project_visual_context_screenshots
        where id=$1 and organization_id=$2 and project_id=$3`,
		created.Screenshot.ID, scope.OrganizationID, scope.ProjectID,
	).Scan(&leftoverID)
	require.ErrorIs(t, err, pgx.ErrNoRows)

	store, err := api.objects.Resolve("r2-primary")
	require.NoError(t, err)
	_, err = store.Stat(t.Context(), objectKey)
	require.ErrorIs(t, err, objectstore.ErrNotFound)
}

func TestEditorCatVisualContextFinalizeMissingUpload(t *testing.T) {
	api, scope := editorCatTestAPI(t, "admin")
	api.objects = visualContextObjectRegistry(t)
	create := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots"), `{"filename":"shot.jpg","contentType":"image/jpeg","byteSize":128}`)
	require.Equal(t, http.StatusCreated, create.Code, create.Body.String())
	var created struct {
		Screenshot struct {
			ID string `json:"id"`
		} `json:"screenshot"`
	}
	require.NoError(t, json.Unmarshal(create.Body.Bytes(), &created))
	rec := editorCatRequestScope(api, scope, http.MethodPost, editorCatPathFor(scope, "/files/detail/cat/visual-context/screenshots/"+created.Screenshot.ID+"/finalize"), `{}`)
	require.Equal(t, http.StatusConflict, rec.Code)
	require.Contains(t, rec.Body.String(), "visual_context_upload_missing")
}

func TestValidateVisualContextImage(t *testing.T) {
	require.NoError(t, validateVisualContextImage(mustVisualContextPNG(t, 2, 2), "image/png"))
	require.NoError(t, validateVisualContextImage(mustVisualContextWebP(t, 2, 2), "image/webp"))

	truncatedPNG := append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 120)...)
	require.ErrorIs(t, validateVisualContextImage(truncatedPNG, "image/png"), errVisualContextInvalidImage)

	require.ErrorIs(t, validateVisualContextImage(oversizedVisualContextWebP(8000, 8000), "image/webp"), errVisualContextInvalidImage)
	require.ErrorIs(t, validateVisualContextImage(oversizedVisualContextWebP(20000, 20), "image/webp"), errVisualContextInvalidImage)
	require.ErrorIs(t, validateVisualContextImage([]byte("not-an-image"), "image/jpeg"), errVisualContextInvalidImage)
}

func TestNormalizeVisualContextUpload(t *testing.T) {
	filename, contentType, err := normalizeVisualContextUpload("Checkout Photo.PNG", "image/png")
	require.NoError(t, err)
	require.Equal(t, "Checkout_Photo.PNG", filename)
	require.Equal(t, "image/png", contentType)

	_, _, err = normalizeVisualContextUpload("shot.png", "image/jpeg")
	require.EqualError(t, err, "invalid_project_payload")

	_, _, err = normalizeVisualContextUpload("shot.gif", "image/gif")
	require.EqualError(t, err, "invalid_project_payload")
}

func mustVisualContextPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, width, height))))
	return buf.Bytes()
}

func mustVisualContextWebP(t *testing.T, width, height int) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, nativewebp.Encode(&buf, image.NewRGBA(image.Rect(0, 0, width, height)), nil))
	return buf.Bytes()
}

func oversizedVisualContextWebP(width, height int) []byte {
	payload := make([]byte, 10)
	w := width - 1
	h := height - 1
	payload[4] = byte(w)
	payload[5] = byte(w >> 8)
	payload[6] = byte(w >> 16)
	payload[7] = byte(h)
	payload[8] = byte(h >> 8)
	payload[9] = byte(h >> 16)
	out := make([]byte, 30)
	copy(out[0:4], "RIFF")
	binary.LittleEndian.PutUint32(out[4:8], 22)
	copy(out[8:12], "WEBP")
	copy(out[12:16], "VP8X")
	binary.LittleEndian.PutUint32(out[16:20], 10)
	copy(out[20:], payload)
	return out
}
