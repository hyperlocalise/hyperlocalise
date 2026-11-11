package objectstore_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/hyperlocalise/hyperlocalise/internal/objectstore/memory"
	"github.com/stretchr/testify/require"
)

type signingStore struct {
	objectstore.Store
}

func (signingStore) PresignUpload(_ context.Context, upload objectstore.Upload, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{URL: "https://upload.example/" + upload.Key, Method: "PUT", ExpiresAt: time.Unix(0, 0).Add(ttl)}, nil
}

func (signingStore) PresignDownload(_ context.Context, key string, ttl time.Duration) (objectstore.SignedRequest, error) {
	return objectstore.SignedRequest{URL: "https://download.example/" + key, Method: "GET", ExpiresAt: time.Unix(0, 0).Add(ttl)}, nil
}

type failingPutStore struct {
	objectstore.Store
	err error
}

func (s failingPutStore) Put(context.Context, objectstore.PutInput) (objectstore.Info, error) {
	return objectstore.Info{}, s.err
}

func TestValidateKey(t *testing.T) {
	for _, tc := range []struct {
		name string
		key  string
		ok   bool
	}{
		{name: "simple", key: "files/a.txt", ok: true},
		{name: "spaces inside", key: " padded name ", ok: true},
		{name: "max length", key: strings.Repeat("k", 1024), ok: true},
		{name: "empty", key: ""},
		{name: "blank", key: " \t "},
		{name: "too long", key: strings.Repeat("k", 1025)},
		{name: "nul", key: "a\x00b"},
		{name: "carriage return", key: "a\rb"},
		{name: "newline", key: "a\nb"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := objectstore.ValidateKey(tc.key)
			if tc.ok {
				require.NoError(t, err)
			} else {
				require.ErrorIs(t, err, objectstore.ErrInvalidInput)
			}
		})
	}
}

func TestValidatePut(t *testing.T) {
	valid := func() objectstore.PutInput {
		return objectstore.PutInput{Key: "key", Body: strings.NewReader("abc"), Size: 3, ContentType: "text/plain"}
	}
	for _, tc := range []struct {
		name   string
		mutate func(*objectstore.PutInput)
		ok     bool
	}{
		{name: "valid", mutate: func(*objectstore.PutInput) {}, ok: true},
		{name: "if absent", mutate: func(in *objectstore.PutInput) { in.IfAbsent = true }, ok: true},
		{name: "if match", mutate: func(in *objectstore.PutInput) { in.IfMatch = `"etag"` }, ok: true},
		{name: "blank if match with if absent", mutate: func(in *objectstore.PutInput) { in.IfAbsent, in.IfMatch = true, "  " }, ok: true},
		{name: "invalid key", mutate: func(in *objectstore.PutInput) { in.Key = "" }},
		{name: "nil body", mutate: func(in *objectstore.PutInput) { in.Body = nil }},
		{name: "negative size", mutate: func(in *objectstore.PutInput) { in.Size = -1 }},
		{name: "missing content type", mutate: func(in *objectstore.PutInput) { in.ContentType = "" }},
		{name: "if absent and if match", mutate: func(in *objectstore.PutInput) { in.IfAbsent, in.IfMatch = true, `"etag"` }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := valid()
			tc.mutate(&input)
			err := objectstore.ValidatePut(input)
			if tc.ok {
				require.NoError(t, err)
			} else {
				require.ErrorIs(t, err, objectstore.ErrInvalidInput)
			}
		})
	}
}

func TestNewRegistryValidatesLocations(t *testing.T) {
	_, err := objectstore.NewRegistry("a", map[string]objectstore.Store{" ": memory.New()})
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
	_, err = objectstore.NewRegistry("a", map[string]objectstore.Store{"a": nil})
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
	_, err = objectstore.NewRegistry("missing", map[string]objectstore.Store{"a": memory.New()})
	require.ErrorIs(t, err, objectstore.ErrUnknownLocation)
	_, err = objectstore.NewRegistry("", nil)
	require.ErrorIs(t, err, objectstore.ErrUnknownLocation)

	registry, err := objectstore.NewRegistry("a", map[string]objectstore.Store{"a": memory.New(), "b": memory.New()})
	require.NoError(t, err)
	require.Equal(t, "a", registry.DefaultLocationID())
	var nilRegistry *objectstore.Registry
	require.Empty(t, nilRegistry.DefaultLocationID())
}

func TestRegistryPresigner(t *testing.T) {
	registry, err := objectstore.NewRegistry("signed", map[string]objectstore.Store{"signed": signingStore{Store: memory.New()}, "plain": memory.New()})
	require.NoError(t, err)

	signer, err := registry.Presigner("signed")
	require.NoError(t, err)
	request, err := signer.PresignDownload(t.Context(), "files/a.txt", time.Minute)
	require.NoError(t, err)
	require.Equal(t, "https://download.example/files/a.txt", request.URL)

	_, err = registry.Presigner("plain")
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
	_, err = registry.Presigner("missing")
	require.ErrorIs(t, err, objectstore.ErrUnknownLocation)
}

func TestRegistryPutWrapsDriverErrors(t *testing.T) {
	driverErr := errors.New("bucket unavailable")
	registry, err := objectstore.NewRegistry("broken", map[string]objectstore.Store{"broken": failingPutStore{Store: memory.New(), err: driverErr}})
	require.NoError(t, err)
	ref, info, err := registry.Put(t.Context(), objectstore.PutInput{Key: "k", Body: strings.NewReader("x"), Size: 1, ContentType: "text/plain"})
	require.ErrorIs(t, err, driverErr)
	require.ErrorContains(t, err, "put object")
	require.Empty(t, ref)
	require.Empty(t, info)

	registry, err = objectstore.NewRegistry("mem", map[string]objectstore.Store{"mem": memory.New()})
	require.NoError(t, err)
	_, _, err = registry.Put(t.Context(), objectstore.PutInput{Key: "k", Size: 1, ContentType: "text/plain"})
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
}
