// Package distribution publishes immutable translation bundles into object storage.
package distribution

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
)

const immutableCacheControl = "public, max-age=31536000, immutable"

var safePart = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`)

// Bundle is a generated locale file. Keys are derived by the publisher.
type Bundle struct {
	Locale  string
	Content []byte
}

// Entry identifies a verified bundle in a manifest.
type Entry struct {
	Locale string `json:"locale"`
	Key    string `json:"key"`
	SHA256 string `json:"sha256"`
	Size   int64  `json:"size"`
}

// Manifest is the completion marker for an immutable release.
type Manifest struct {
	Version   int     `json:"version"`
	ProjectID string  `json:"projectId"`
	ReleaseID string  `json:"releaseId"`
	Bundles   []Entry `json:"bundles"`
}

// Publisher targets one fixed location. Updating a release channel is a separate
// database operation performed only after Publish succeeds.
type Publisher struct {
	store      objectstore.Store
	locationID string
}

// NewPublisher resolves a location once, independently of the write default.
func NewPublisher(registry *objectstore.Registry, locationID string) (*Publisher, error) {
	store, err := registry.Resolve(locationID)
	if err != nil {
		return nil, err
	}
	return &Publisher{store: store, locationID: locationID}, nil
}

// Publish writes bundles and their manifest with conditional creation. Retrying
// identical content is safe; conflicting content never overwrites existing bytes.
func (p *Publisher) Publish(ctx context.Context, projectID, releaseID string, bundles []Bundle) (objectstore.Ref, error) {
	if !safePart.MatchString(projectID) || !safePart.MatchString(releaseID) || len(bundles) == 0 {
		return objectstore.Ref{}, objectstore.ErrInvalidInput
	}
	sorted := append([]Bundle(nil), bundles...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].Locale < sorted[j].Locale })
	manifest := Manifest{Version: 1, ProjectID: projectID, ReleaseID: releaseID, Bundles: make([]Entry, 0, len(sorted))}
	prefix := fmt.Sprintf("projects/%s/releases/%s/", projectID, releaseID)
	for i, bundle := range sorted {
		if !safePart.MatchString(bundle.Locale) || bundle.Locale == "manifest" || !json.Valid(bundle.Content) || (i > 0 && sorted[i-1].Locale == bundle.Locale) {
			return objectstore.Ref{}, objectstore.ErrInvalidInput
		}
		sum := sha256.Sum256(bundle.Content)
		manifest.Bundles = append(manifest.Bundles, Entry{Locale: bundle.Locale, Key: prefix + bundle.Locale + ".json", SHA256: hex.EncodeToString(sum[:]), Size: int64(len(bundle.Content))})
	}
	encoded, err := json.Marshal(manifest)
	if err != nil {
		return objectstore.Ref{}, fmt.Errorf("encode manifest: %w", err)
	}
	manifestKey := prefix + "manifest.json"
	// Detect conflicting completed releases before attempting any new uploads.
	if existing, err := p.read(ctx, manifestKey); err == nil {
		if !bytes.Equal(existing, encoded) {
			return objectstore.Ref{}, objectstore.ErrAlreadyExists
		}
		return objectstore.Ref{LocationID: p.locationID, Key: manifestKey}, nil
	} else if !errors.Is(err, objectstore.ErrNotFound) {
		return objectstore.Ref{}, err
	}
	for i, bundle := range sorted {
		if err := p.putImmutable(ctx, manifest.Bundles[i].Key, bundle.Content); err != nil {
			return objectstore.Ref{}, err
		}
	}
	if err := p.putImmutable(ctx, manifestKey, encoded); err != nil {
		return objectstore.Ref{}, err
	}
	return objectstore.Ref{LocationID: p.locationID, Key: manifestKey}, nil
}

func (p *Publisher) read(ctx context.Context, key string) ([]byte, error) {
	body, _, err := p.store.Get(ctx, key)
	if err != nil {
		return nil, err
	}
	content, readErr := io.ReadAll(io.LimitReader(body, 64<<20))
	return content, errors.Join(readErr, body.Close())
}

func (p *Publisher) putImmutable(ctx context.Context, key string, content []byte) error {
	_, err := p.store.Put(ctx, objectstore.PutInput{Key: key, Body: bytes.NewReader(content), Size: int64(len(content)), ContentType: "application/json", CacheControl: immutableCacheControl, IfAbsent: true})
	if err != nil && !errors.Is(err, objectstore.ErrAlreadyExists) {
		return fmt.Errorf("publish bundle: %w", err)
	}
	// Read back bytes rather than assuming an ETag is a checksum.
	stored, err := p.read(ctx, key)
	if err != nil {
		return fmt.Errorf("verify bundle: %w", err)
	}
	if !bytes.Equal(content, stored) {
		return objectstore.ErrAlreadyExists
	}
	return nil
}
