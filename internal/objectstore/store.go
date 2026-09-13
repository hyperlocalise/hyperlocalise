// Package objectstore defines provider-independent storage for files and bundles.
package objectstore

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

var (
	ErrNotFound        = errors.New("object not found")
	ErrAlreadyExists   = errors.New("object already exists")
	ErrInvalidInput    = errors.New("invalid object storage input")
	ErrUnknownLocation = errors.New("unknown storage location")
)

// Ref is durable identity. Location IDs must not be reassigned to other buckets.
type Ref struct {
	LocationID string `json:"locationId"`
	Key        string `json:"key"`
}

// Info describes an object. ETag is opaque and is not a content checksum.
type Info struct {
	Size         int64             `json:"size"`
	ContentType  string            `json:"contentType"`
	ETag         string            `json:"etag"`
	CacheControl string            `json:"cacheControl,omitempty"`
	Metadata     map[string]string `json:"metadata,omitempty"`
}

// PutInput streams a known number of bytes. IfAbsent prevents overwrites.
type PutInput struct {
	Key          string
	Body         io.Reader
	Size         int64
	ContentType  string
	CacheControl string
	Metadata     map[string]string
	IfAbsent     bool
}

// Store owns bytes; callers own authorization and durable object references.
// The caller must close bodies returned by Get. Delete is idempotent.
type Store interface {
	Put(context.Context, PutInput) (Info, error)
	Get(context.Context, string) (io.ReadCloser, Info, error)
	Stat(context.Context, string) (Info, error)
	Delete(context.Context, string) error
}

// Upload describes the headers that must be sent with a signed PUT request.
type Upload struct {
	Key         string `json:"key"`
	ContentType string `json:"contentType"`
	IfAbsent    bool   `json:"ifAbsent"`
}

// SignedRequest is temporary access, never a durable object identifier.
type SignedRequest struct {
	URL       string      `json:"url"`
	Method    string      `json:"method"`
	Headers   http.Header `json:"headers"`
	ExpiresAt time.Time   `json:"expiresAt"`
}

// Presigner is separate from Store because not every driver can sign requests.
type Presigner interface {
	PresignUpload(context.Context, Upload, time.Duration) (SignedRequest, error)
	PresignDownload(context.Context, string, time.Duration) (SignedRequest, error)
}

// ValidateKey rejects ambiguous identities without altering valid object names.
func ValidateKey(key string) error {
	if strings.TrimSpace(key) == "" || len(key) > 1024 || strings.ContainsAny(key, "\x00\r\n") {
		return ErrInvalidInput
	}
	return nil
}

// ValidatePut validates the shared contract before a driver performs I/O.
func ValidatePut(input PutInput) error {
	if err := ValidateKey(input.Key); err != nil {
		return err
	}
	if input.Body == nil || input.Size < 0 || input.ContentType == "" {
		return ErrInvalidInput
	}
	return nil
}

// Registry resolves old references independently of the current write default.
// It is immutable after construction and safe for concurrent use.
type Registry struct {
	locations map[string]Store
	defaultID string
}

// NewRegistry copies the configured locations and validates the write default.
func NewRegistry(defaultID string, locations map[string]Store) (*Registry, error) {
	copied := make(map[string]Store, len(locations))
	for id, store := range locations {
		if strings.TrimSpace(id) == "" || store == nil {
			return nil, ErrInvalidInput
		}
		copied[id] = store
	}
	if copied[defaultID] == nil {
		return nil, ErrUnknownLocation
	}
	return &Registry{locations: copied, defaultID: defaultID}, nil
}

// Resolve never falls back to the write default for an existing reference.
func (r *Registry) Resolve(locationID string) (Store, error) {
	store, ok := r.locations[locationID]
	if !ok {
		return nil, ErrUnknownLocation
	}
	return store, nil
}

// Put writes to the default and returns the reference callers must persist.
func (r *Registry) Put(ctx context.Context, input PutInput) (Ref, Info, error) {
	info, err := r.locations[r.defaultID].Put(ctx, input)
	if err != nil {
		return Ref{}, Info{}, fmt.Errorf("put object: %w", err)
	}
	return Ref{LocationID: r.defaultID, Key: input.Key}, info, nil
}
