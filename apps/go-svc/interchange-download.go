package main

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/url"
)

// interchangeDownload is a raw file response for glossary/TM exports and reports.
type interchangeDownload struct {
	contentType string
	filename    string
	body        []byte
	warnings    int
}

func writeInterchangeDownload(w http.ResponseWriter, status int, download interchangeDownload) {
	w.Header().Set("Content-Type", download.contentType)
	w.Header().Set("Content-Disposition", `attachment; filename*=UTF-8''`+url.PathEscape(download.filename))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; sandbox;")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("X-Download-Options", "noopen")
	if download.warnings > 0 {
		w.Header().Set("X-Hyperlocalise-Export-Warning-Count", itoa(download.warnings))
	}
	w.WriteHeader(status)
	if _, err := io.Copy(w, bytes.NewReader(download.body)); err != nil {
		slog.Warn("interchange_download_write_failed")
	}
}
