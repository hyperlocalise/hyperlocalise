package memory

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"strings"
	"testing"

	"github.com/hyperlocalise/hyperlocalise/internal/objectstore"
	"github.com/stretchr/testify/require"
)

func TestStoreRoundTrip(t *testing.T) {
	store := New()
	metadata := map[string]string{"kind": "bundle"}
	info, err := store.Put(t.Context(), objectstore.PutInput{
		Key:          "files/a.txt",
		Body:         strings.NewReader("hi"),
		Size:         2,
		ContentType:  "text/plain",
		CacheControl: "private",
		Metadata:     metadata,
	})
	require.NoError(t, err)
	sum := sha256.Sum256([]byte("hi"))
	require.Equal(t, hex.EncodeToString(sum[:]), info.ETag)
	require.Equal(t, int64(2), info.Size)
	require.Equal(t, "text/plain", info.ContentType)
	require.Equal(t, "private", info.CacheControl)
	require.Equal(t, map[string]string{"kind": "bundle"}, info.Metadata)

	metadata["kind"] = "changed"
	info.Metadata["kind"] = "changed"
	body, got, err := store.Get(t.Context(), "files/a.txt")
	require.NoError(t, err)
	content, err := io.ReadAll(body)
	require.NoError(t, err)
	require.NoError(t, body.Close())
	require.Equal(t, "hi", string(content))
	require.Equal(t, "bundle", got.Metadata["kind"])

	stat, err := store.Stat(t.Context(), "files/a.txt")
	require.NoError(t, err)
	require.Equal(t, info.ETag, stat.ETag)
	stat.Metadata["kind"] = "stat"
	_, again, err := store.Get(t.Context(), "files/a.txt")
	require.NoError(t, err)
	require.Equal(t, "bundle", again.Metadata["kind"])

	replaced, err := store.Put(t.Context(), objectstore.PutInput{
		Key: "files/a.txt", Body: strings.NewReader("yo"), Size: 2, ContentType: "text/plain",
	})
	require.NoError(t, err)
	require.NotEqual(t, info.ETag, replaced.ETag)
}

func TestStoreRejectsInvalidInput(t *testing.T) {
	store := New()
	_, err := store.Put(t.Context(), objectstore.PutInput{
		Key: "files/a.txt", Body: strings.NewReader("abcd"), Size: 2, ContentType: "text/plain",
	})
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)

	_, err = store.Put(t.Context(), objectstore.PutInput{
		Key: "files/a.txt", Body: strings.NewReader("a"), Size: 64<<20 + 1, ContentType: "text/plain",
	})
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)

	_, err = store.Put(t.Context(), objectstore.PutInput{
		Key: "", Body: strings.NewReader("a"), Size: 1, ContentType: "text/plain",
	})
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)

	_, err = store.Put(t.Context(), objectstore.PutInput{
		Key: "files/a.txt", Body: errReader{}, Size: 1, ContentType: "text/plain",
	})
	require.EqualError(t, err, "read failed")

	_, _, err = store.Get(t.Context(), "missing")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
	_, err = store.Stat(t.Context(), " ")
	require.ErrorIs(t, err, objectstore.ErrInvalidInput)
	require.ErrorIs(t, store.Delete(t.Context(), "\x00"), objectstore.ErrInvalidInput)
}

func TestStoreIfAbsentAndDelete(t *testing.T) {
	store := New()
	input := objectstore.PutInput{Key: "same", Body: strings.NewReader("a"), Size: 1, ContentType: "text/plain", IfAbsent: true}
	_, err := store.Put(t.Context(), input)
	require.NoError(t, err)
	_, err = store.Put(t.Context(), objectstore.PutInput{
		Key: "same", Body: strings.NewReader("b"), Size: 1, ContentType: "text/plain", IfAbsent: true,
	})
	require.ErrorIs(t, err, objectstore.ErrAlreadyExists)

	require.NoError(t, store.Delete(t.Context(), "same"))
	require.NoError(t, store.Delete(t.Context(), "same"))
	_, _, err = store.Get(t.Context(), "same")
	require.ErrorIs(t, err, objectstore.ErrNotFound)
}

func TestStoreCanceledContext(t *testing.T) {
	store := New()
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	_, err := store.Put(ctx, objectstore.PutInput{Key: "k", Body: strings.NewReader("a"), Size: 1, ContentType: "text/plain"})
	require.ErrorIs(t, err, context.Canceled)
	_, _, err = store.Get(ctx, "k")
	require.ErrorIs(t, err, context.Canceled)
	_, err = store.Stat(ctx, "k")
	require.ErrorIs(t, err, context.Canceled)
	require.ErrorIs(t, store.Delete(ctx, "k"), context.Canceled)

	live, cancelLive := context.WithCancel(t.Context())
	_, err = store.Put(live, objectstore.PutInput{
		Key: "k", Body: &cancelReader{cancel: cancelLive, data: []byte("ab")}, Size: 2, ContentType: "text/plain",
	})
	require.ErrorIs(t, err, context.Canceled)
}

func TestStoreEmptyObject(t *testing.T) {
	store := New()
	info, err := store.Put(t.Context(), objectstore.PutInput{
		Key: "empty", Body: bytes.NewReader(nil), Size: 0, ContentType: "application/octet-stream",
	})
	require.NoError(t, err)
	sum := sha256.Sum256(nil)
	require.Equal(t, hex.EncodeToString(sum[:]), info.ETag)
	body, _, err := store.Get(t.Context(), "empty")
	require.NoError(t, err)
	content, err := io.ReadAll(body)
	require.NoError(t, err)
	require.Empty(t, content)
	require.NoError(t, body.Close())
}

type errReader struct{}

func (errReader) Read([]byte) (int, error) { return 0, errors.New("read failed") }

type cancelReader struct {
	cancel context.CancelFunc
	data   []byte
	done   bool
}

func (r *cancelReader) Read(p []byte) (int, error) {
	if r.done {
		return 0, io.EOF
	}
	n := copy(p, r.data)
	r.done = true
	r.cancel()
	return n, nil
}
