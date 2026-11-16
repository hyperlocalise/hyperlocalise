// Package vercelblob implements objectstore.Store on Vercel Blob, speaking the same HTTP API as the
// web app's @vercel/blob SDK (API version 13): reads from the store's own host with the
// read-write token, writes, heads, lists and deletes through the Blob API.
package vercelblob

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const (
	// DefaultAPIURL is the SDK's defaultVercelBlobApiUrl.
	DefaultAPIURL = "https://vercel.com/api/blob"
	// apiVersion is the SDK's BLOB_API_VERSION.
	apiVersion = "13"
	// AccessPrivate and AccessPublic are the store access levels.
	AccessPrivate = "private"
	AccessPublic  = "public"

	maxErrorBodyBytes = 64 << 10
)

// ErrInvalidToken means the read-write token does not name a store.
var ErrInvalidToken = errors.New("vercel blob: read-write token does not name a store")

// Doer sends HTTP requests; *http.Client satisfies it.
type Doer interface {
	Do(*http.Request) (*http.Response, error)
}

// Config configures a Store. Token is the store's read-write token (BLOB_READ_WRITE_TOKEN).
type Config struct {
	Token  string
	Access string
	// APIURL overrides the Blob API, as VERCEL_BLOB_API_URL does for the SDK.
	APIURL string
	// BlobBaseURL overrides https://{storeId}.{access}.blob.vercel-storage.com, for tests.
	BlobBaseURL string
	HTTPClient  Doer
}

// Store reads and writes one Vercel Blob store.
type Store struct {
	token       string
	storeID     string
	access      string
	apiURL      string
	blobBaseURL string
	http        Doer
}

var _ objectstore.Store = (*Store)(nil)

// StoreIDFromToken is the SDK's parseStoreIdFromReadWriteToken: the fourth `_` field of
// `vercel_blob_rw_<storeId>_<secret>`.
func StoreIDFromToken(token string) string {
	parts := strings.Split(token, "_")
	if len(parts) < 4 {
		return ""
	}
	return parts[3]
}

// New validates the configuration.
func New(cfg Config) (*Store, error) {
	token := strings.TrimSpace(cfg.Token)
	storeID := StoreIDFromToken(token)
	if token == "" || storeID == "" {
		return nil, ErrInvalidToken
	}
	access := cfg.Access
	if access == "" {
		access = AccessPrivate
	}
	if access != AccessPrivate && access != AccessPublic {
		return nil, fmt.Errorf("vercel blob: access must be %q or %q", AccessPrivate, AccessPublic)
	}
	apiURL := strings.TrimRight(strings.TrimSpace(cfg.APIURL), "/")
	if apiURL == "" {
		apiURL = DefaultAPIURL
	}
	blobBaseURL := strings.TrimRight(strings.TrimSpace(cfg.BlobBaseURL), "/")
	if blobBaseURL == "" {
		blobBaseURL = fmt.Sprintf("https://%s.%s.blob.vercel-storage.com", storeID, access)
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Timeout: 5 * time.Minute}
	}
	return &Store{token: token, storeID: storeID, access: access, apiURL: apiURL, blobBaseURL: blobBaseURL, http: client}, nil
}

// blobURL is where a pathname is read, as the SDK's constructBlobUrl builds it. A stored full blob
// URL on this store's host is used as it is.
func (s *Store) blobURL(key string) (string, error) {
	if strings.HasPrefix(key, "https://") || strings.HasPrefix(key, "http://") {
		parsed, err := url.Parse(key)
		if err != nil {
			return "", objectstore.ErrInvalidInput
		}
		base, _ := url.Parse(s.blobBaseURL)
		if parsed.Host != base.Host {
			return "", objectstore.ErrInvalidInput
		}
		return key, nil
	}
	segments := strings.Split(key, "/")
	for i, segment := range segments {
		segments[i] = url.PathEscape(segment)
	}
	return s.blobBaseURL + "/" + strings.Join(segments, "/"), nil
}

func (s *Store) apiRequest(ctx context.Context, method, pathAndQuery string, body io.Reader) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, s.apiURL+pathAndQuery, body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("authorization", "Bearer "+s.token)
	req.Header.Set("x-api-version", apiVersion)
	req.Header.Set("x-vercel-blob-store-id", s.storeID)
	return req, nil
}

// apiError maps the Blob API's {"error":{"code","message"}} body to objectstore errors.
func apiError(resp *http.Response) error {
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, maxErrorBodyBytes))
	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	code := body.Error.Code
	cause := fmt.Errorf("vercel blob: %d %s", resp.StatusCode, code)
	switch {
	case resp.StatusCode == http.StatusNotFound || code == "not_found":
		return fmt.Errorf("%w: %w", objectstore.ErrNotFound, cause)
	case resp.StatusCode == http.StatusPreconditionFailed || code == "precondition_failed",
		resp.StatusCode == http.StatusConflict,
		strings.Contains(strings.ToLower(body.Error.Message), "already exists"):
		return fmt.Errorf("%w: %w", objectstore.ErrAlreadyExists, cause)
	default:
		return cause
	}
}

type blobResult struct {
	URL          string `json:"url"`
	DownloadURL  string `json:"downloadUrl"`
	Pathname     string `json:"pathname"`
	ContentType  string `json:"contentType"`
	CacheControl string `json:"cacheControl"`
	Size         int64  `json:"size"`
	ETag         string `json:"etag"`
}

func (r blobResult) info() objectstore.Info {
	return objectstore.Info{Size: r.Size, ContentType: r.ContentType, ETag: r.ETag, CacheControl: r.CacheControl}
}

// Put writes with addRandomSuffix off, so the key is the stored pathname. IfAbsent turns
// overwrite off; IfMatch sends x-if-match.
func (s *Store) Put(ctx context.Context, input objectstore.PutInput) (objectstore.Info, error) {
	if err := objectstore.ValidatePut(input); err != nil {
		return objectstore.Info{}, err
	}
	req, err := s.apiRequest(ctx, http.MethodPut, "/?"+url.Values{"pathname": {input.Key}}.Encode(), input.Body)
	if err != nil {
		return objectstore.Info{}, err
	}
	req.ContentLength = input.Size
	req.Header.Set("x-vercel-blob-access", s.access)
	req.Header.Set("x-add-random-suffix", "0")
	req.Header.Set("x-content-type", input.ContentType)
	req.Header.Set("x-content-length", strconv.FormatInt(input.Size, 10))
	if input.IfAbsent {
		req.Header.Set("x-allow-overwrite", "0")
	} else {
		req.Header.Set("x-allow-overwrite", "1")
	}
	if etag := strings.TrimSpace(input.IfMatch); etag != "" {
		req.Header.Set("x-if-match", etag)
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return objectstore.Info{}, fmt.Errorf("vercel blob put: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return objectstore.Info{}, apiError(resp)
	}
	var result blobResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return objectstore.Info{}, fmt.Errorf("vercel blob put: decode: %w", err)
	}
	info := result.info()
	info.Size = input.Size
	if info.ContentType == "" {
		info.ContentType = input.ContentType
	}
	return info, nil
}

// Get streams a blob from the store's host with the read-write token, as the SDK's get() does.
func (s *Store) Get(ctx context.Context, key string) (io.ReadCloser, objectstore.Info, error) {
	if err := objectstore.ValidateKey(key); err != nil {
		return nil, objectstore.Info{}, err
	}
	target, err := s.blobURL(key)
	if err != nil {
		return nil, objectstore.Info{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, target, nil)
	if err != nil {
		return nil, objectstore.Info{}, err
	}
	req.Header.Set("authorization", "Bearer "+s.token)
	resp, err := s.http.Do(req)
	if err != nil {
		return nil, objectstore.Info{}, fmt.Errorf("vercel blob get: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		defer func() { _ = resp.Body.Close() }()
		if resp.StatusCode == http.StatusNotFound {
			return nil, objectstore.Info{}, objectstore.ErrNotFound
		}
		return nil, objectstore.Info{}, apiError(resp)
	}
	info := objectstore.Info{
		Size:         resp.ContentLength,
		ContentType:  resp.Header.Get("Content-Type"),
		ETag:         resp.Header.Get("ETag"),
		CacheControl: resp.Header.Get("Cache-Control"),
	}
	return resp.Body, info, nil
}

// Stat is the SDK's head().
func (s *Store) Stat(ctx context.Context, key string) (objectstore.Info, error) {
	if err := objectstore.ValidateKey(key); err != nil {
		return objectstore.Info{}, err
	}
	req, err := s.apiRequest(ctx, http.MethodGet, "?"+url.Values{"url": {key}}.Encode(), nil)
	if err != nil {
		return objectstore.Info{}, err
	}
	resp, err := s.http.Do(req)
	if err != nil {
		return objectstore.Info{}, fmt.Errorf("vercel blob head: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return objectstore.Info{}, apiError(resp)
	}
	var result blobResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return objectstore.Info{}, fmt.Errorf("vercel blob head: decode: %w", err)
	}
	return result.info(), nil
}

// Delete is the SDK's del(); deleting a missing blob succeeds.
func (s *Store) Delete(ctx context.Context, key string) error {
	if err := objectstore.ValidateKey(key); err != nil {
		return err
	}
	target, err := s.blobURL(key)
	if err != nil {
		return err
	}
	body, err := json.Marshal(map[string][]string{"urls": {target}})
	if err != nil {
		return err
	}
	req, err := s.apiRequest(ctx, http.MethodPost, "/delete", strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("content-type", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		return fmt.Errorf("vercel blob delete: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		err := apiError(resp)
		if errors.Is(err, objectstore.ErrNotFound) {
			return nil
		}
		return err
	}
	return nil
}

// List returns every pathname under prefix, following the API's cursor.
func (s *Store) List(ctx context.Context, prefix string) ([]string, error) {
	var keys []string
	cursor := ""
	for {
		query := url.Values{"limit": {"1000"}}
		if prefix != "" {
			query.Set("prefix", prefix)
		}
		if cursor != "" {
			query.Set("cursor", cursor)
		}
		req, err := s.apiRequest(ctx, http.MethodGet, "?"+query.Encode(), nil)
		if err != nil {
			return nil, err
		}
		resp, err := s.http.Do(req)
		if err != nil {
			return nil, fmt.Errorf("vercel blob list: %w", err)
		}
		var page struct {
			Blobs   []blobResult `json:"blobs"`
			Cursor  string       `json:"cursor"`
			HasMore bool         `json:"hasMore"`
		}
		if resp.StatusCode != http.StatusOK {
			err := apiError(resp)
			_ = resp.Body.Close()
			return nil, err
		}
		err = json.NewDecoder(resp.Body).Decode(&page)
		_ = resp.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("vercel blob list: decode: %w", err)
		}
		for _, blob := range page.Blobs {
			keys = append(keys, blob.Pathname)
		}
		if !page.HasMore || page.Cursor == "" {
			return keys, nil
		}
		cursor = page.Cursor
	}
}
