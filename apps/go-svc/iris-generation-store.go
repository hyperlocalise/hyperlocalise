package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const (
	irisUploadTTL   = 15 * time.Minute
	irisDownloadTTL = 60 * time.Minute
)

type irisJobRecord struct {
	ID                  string              `json:"id"`
	Model               string              `json:"model"`
	Request             irisGenerateRequest `json:"request"`
	Status              string              `json:"status"`
	Phase               *string             `json:"phase"`
	Progress            *float64            `json:"progress"`
	Credits             float64             `json:"credits"`
	ETASeconds          int                 `json:"etaSeconds"`
	ETARemainingSeconds *int                `json:"etaRemainingSeconds"`
	Name                *string             `json:"name"`
	Assets              []irisJobAsset      `json:"assets"`
	Error               *irisJobError       `json:"error"`
	CreatedAt           string              `json:"createdAt"`
	StartedAt           *string             `json:"startedAt"`
	CompletedAt         *string             `json:"completedAt"`
	ExpiresAt           *string             `json:"expiresAt"`
	OutputKeys          []string            `json:"-"`
	UserID              string              `json:"-"`
}

type irisStoredJob struct {
	irisJobRecord
	OutputKeys []string `json:"outputKeys"`
	UserID     string   `json:"userId"`
}

type irisJobAsset struct {
	URL         string `json:"url"`
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Size        int    `json:"size"`
	Key         string `json:"-"`
}

type irisJobError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func irisUserPrefix(userID string) string {
	return "iris/generation/users/" + strings.TrimSpace(userID)
}

func irisUploadKey(userID, sha string) string {
	return irisUserPrefix(userID) + "/uploads/" + strings.ToLower(sha)
}

func irisJobKey(userID, jobID string) string {
	return irisUserPrefix(userID) + "/jobs/" + jobID + ".json"
}

func irisIdempotencyKey(userID, key string) string {
	return irisUserPrefix(userID) + "/idempotency/" + strings.TrimSpace(key)
}

func irisOutputKey(userID, jobID, filename string) string {
	return irisUserPrefix(userID) + "/jobs/" + jobID + "/assets/" + filename
}

func (api *irisGenerationAPI) registry() (*objectstore.Registry, error) {
	if api == nil || api.objects == nil {
		return nil, fmt.Errorf("object_storage_not_configured")
	}
	return api.objects, nil
}

func (api *irisGenerationAPI) presigner(ctx context.Context) (objectstore.Presigner, string, error) {
	reg, err := api.registry()
	if err != nil {
		return nil, "", err
	}
	location := reg.DefaultLocationID()
	signer, err := reg.Presigner(location)
	if err != nil {
		return nil, "", err
	}
	return signer, location, nil
}

func (api *irisGenerationAPI) putJSON(ctx context.Context, key string, value any) error {
	reg, err := api.registry()
	if err != nil {
		return err
	}
	body, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, _, err = reg.Put(ctx, objectstore.PutInput{
		Key:         key,
		Body:        bytes.NewReader(body),
		Size:        int64(len(body)),
		ContentType: "application/json",
	})
	return err
}

func (api *irisGenerationAPI) getJSON(ctx context.Context, key string, dest any) error {
	reg, err := api.registry()
	if err != nil {
		return err
	}
	store, err := reg.Resolve(reg.DefaultLocationID())
	if err != nil {
		return err
	}
	body, _, err := store.Get(ctx, key)
	if err != nil {
		return err
	}
	defer func() { _ = body.Close() }()
	return json.NewDecoder(body).Decode(dest)
}

func (api *irisGenerationAPI) statUpload(ctx context.Context, userID, sha string) (objectstore.Info, error) {
	reg, err := api.registry()
	if err != nil {
		return objectstore.Info{}, err
	}
	store, err := reg.Resolve(reg.DefaultLocationID())
	if err != nil {
		return objectstore.Info{}, err
	}
	return store.Stat(ctx, irisUploadKey(userID, sha))
}

func (api *irisGenerationAPI) putBytes(ctx context.Context, key, contentType string, body []byte) error {
	reg, err := api.registry()
	if err != nil {
		return err
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	_, _, err = reg.Put(ctx, objectstore.PutInput{
		Key:         key,
		Body:        bytes.NewReader(body),
		Size:        int64(len(body)),
		ContentType: contentType,
	})
	return err
}

func (api *irisGenerationAPI) getBytes(ctx context.Context, key string) ([]byte, string, error) {
	reg, err := api.registry()
	if err != nil {
		return nil, "", err
	}
	store, err := reg.Resolve(reg.DefaultLocationID())
	if err != nil {
		return nil, "", err
	}
	body, info, err := store.Get(ctx, key)
	if err != nil {
		return nil, "", err
	}
	defer func() { _ = body.Close() }()
	data, err := io.ReadAll(body)
	return data, info.ContentType, err
}

func (api *irisGenerationAPI) saveJob(ctx context.Context, job irisJobRecord) error {
	stored := irisStoredJob{irisJobRecord: job, OutputKeys: job.OutputKeys, UserID: job.UserID}
	return api.putJSON(ctx, irisJobKey(job.UserID, job.ID), stored)
}

func (api *irisGenerationAPI) loadJob(ctx context.Context, userID, jobID string) (irisJobRecord, error) {
	var stored irisStoredJob
	if err := api.getJSON(ctx, irisJobKey(userID, jobID), &stored); err != nil {
		return irisJobRecord{}, err
	}
	job := stored.irisJobRecord
	job.OutputKeys = stored.OutputKeys
	job.UserID = stored.UserID
	if job.UserID == "" {
		job.UserID = userID
	}
	return api.signJobAssets(ctx, job)
}

func (api *irisGenerationAPI) signJobAssets(ctx context.Context, job irisJobRecord) (irisJobRecord, error) {
	if len(job.OutputKeys) == 0 {
		return job, nil
	}
	signer, _, err := api.presigner(ctx)
	if err != nil {
		return job, err
	}
	expires := time.Now().UTC().Add(irisDownloadTTL).Format(time.RFC3339)
	job.ExpiresAt = &expires
	assets := make([]irisJobAsset, 0, len(job.Assets))
	for i, asset := range job.Assets {
		key := asset.Key
		if key == "" && i < len(job.OutputKeys) {
			key = job.OutputKeys[i]
		}
		signed, err := signer.PresignDownload(ctx, key, irisDownloadTTL)
		if err != nil {
			return job, err
		}
		asset.URL = signed.URL
		asset.Key = key
		assets = append(assets, asset)
	}
	job.Assets = assets
	return job, nil
}

func headerMap(headers http.Header) map[string]string {
	out := make(map[string]string, len(headers))
	for key, values := range headers {
		if len(values) > 0 {
			out[key] = values[0]
		}
	}
	return out
}
