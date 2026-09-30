package main

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestWriteInterchangeDownload(t *testing.T) {
	rec := httptest.NewRecorder()
	writeInterchangeDownload(rec, http.StatusOK, interchangeDownload{
		contentType: "application/x-tmx+xml",
		filename:    "glossary export.tmx",
		body:        []byte("<tmx/>"),
		warnings:    2,
	})
	require.Equal(t, http.StatusOK, rec.Code)
	require.Equal(t, "application/x-tmx+xml", rec.Header().Get("Content-Type"))
	require.Contains(t, rec.Header().Get("Content-Disposition"), "glossary%20export.tmx")
	require.Equal(t, "no-store", rec.Header().Get("Cache-Control"))
	require.Equal(t, "nosniff", rec.Header().Get("X-Content-Type-Options"))
	require.Equal(t, "2", rec.Header().Get("X-Hyperlocalise-Export-Warning-Count"))
	require.Equal(t, "<tmx/>", rec.Body.String())
}

func TestWriteInterchangeDownloadOmitsWarningHeader(t *testing.T) {
	rec := httptest.NewRecorder()
	writeInterchangeDownload(rec, http.StatusOK, interchangeDownload{
		contentType: "text/plain",
		filename:    "a.txt",
		body:        []byte("ok"),
	})
	require.Empty(t, rec.Header().Get("X-Hyperlocalise-Export-Warning-Count"))
	require.Equal(t, "ok", rec.Body.String())
}

type failResponseWriter struct {
	header http.Header
	status int
}

func (w *failResponseWriter) Header() http.Header {
	if w.header == nil {
		w.header = http.Header{}
	}
	return w.header
}

func (w *failResponseWriter) Write([]byte) (int, error) { return 0, errors.New("write failed") }

func (w *failResponseWriter) WriteHeader(status int) { w.status = status }

func TestWriteInterchangeDownloadLogsWriteError(t *testing.T) {
	w := &failResponseWriter{}
	writeInterchangeDownload(w, http.StatusOK, interchangeDownload{
		contentType: "text/plain",
		filename:    "a.txt",
		body:        []byte("ok"),
	})
	require.Equal(t, http.StatusOK, w.status)
}
