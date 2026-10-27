package main

import (
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/srx"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

const (
	// The source file matches the project upload limit. Translations and sentence source
	// texts sit outside that budget, since a fully translated catalog roughly doubles it.
	maxTranslationFileRenderSourceBytes   = 25 << 20
	maxTranslationFileRenderRequestBytes  = 64 << 20
	maxTranslationFileRenderOverheadBytes = 1 << 20
	maxTranslationFileRenderBodyBytes     = maxTranslationFileRenderSourceBytes +
		maxTranslationFileRenderRequestBytes +
		maxTranslationFileRenderOverheadBytes
	translationFileRenderSourceFormName  = "source"
	translationFileRenderRequestFormName = "request"
)

// translationFileRenderRequest is the "request" part; the source file is its own part.
type translationFileRenderRequest struct {
	SourcePath   string `json:"sourcePath"`
	SourceLocale string `json:"sourceLocale"`
	TargetLocale string `json:"targetLocale"`
	// Values maps each translated key to its text. Untranslated keys are left out.
	Values map[string]string `json:"values"`
	// SourceSpans maps every SRX span key of the file to its source text.
	SourceSpans map[string]string `json:"sourceSpans"`
}

var (
	errTranslationFileRenderTooLarge = errors.New("translation file render request too large")
	errTranslationFileRenderInvalid  = errors.New("invalid render request")
)

// renderTranslationFile writes translations into the caller's copy of a source file and
// returns the result in the source file's own format.
func (h *handler) renderTranslationFile(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	r.Body = http.MaxBytesReader(w, r.Body, maxTranslationFileRenderBodyBytes)
	source, req, err := readTranslationFileRenderRequest(r)
	if err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) || errors.Is(err, errTranslationFileRenderTooLarge) {
			writePayloadTooLarge(w, r)
			return
		}
		writeBadRequest(w, r, "invalid render request")
		return
	}
	if strings.TrimSpace(req.SourcePath) == "" {
		writeBadRequest(w, r, "source path required")
		return
	}
	if strings.TrimSpace(req.TargetLocale) == "" {
		writeBadRequest(w, r, "target locale required")
		return
	}

	values := srx.JoinSpanValues(req.Values, req.SourceSpans)
	content, err := translationfileparser.MarshalTargetFromSource(req.SourcePath, source, values, req.SourceLocale, req.TargetLocale)
	if errors.Is(err, translationfileparser.ErrTargetFormatUnsupported) {
		writeBadRequest(w, r, "unsupported file type")
		return
	}
	if err != nil {
		// The parser's message can quote the file, so it stays out of the response and the log.
		noteRequest(r, "code", "render_failed", "extension", strings.ToLower(filepath.Ext(req.SourcePath)))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":   "render_failed",
			"message": "the source file could not be written with these translations",
		})
		return
	}

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(content)
}

// readTranslationFileRenderRequest reads the "source" file part and the "request" JSON
// part. Unknown parts and fields are ignored, so a newer web server can add them.
func readTranslationFileRenderRequest(r *http.Request) ([]byte, translationFileRenderRequest, error) {
	var req translationFileRenderRequest
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "multipart/form-data" {
		return nil, req, errTranslationFileRenderInvalid
	}
	reader, err := r.MultipartReader()
	if err != nil {
		return nil, req, errTranslationFileRenderInvalid
	}

	var source []byte
	seenSource, seenRequest := false, false
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, req, err
		}
		switch part.FormName() {
		case translationFileRenderSourceFormName:
			if seenSource {
				err = errTranslationFileRenderInvalid
				break
			}
			seenSource = true
			source, err = readTranslationFileRenderPart(part, maxTranslationFileRenderSourceBytes)
		case translationFileRenderRequestFormName:
			if seenRequest {
				err = errTranslationFileRenderInvalid
				break
			}
			seenRequest = true
			var raw []byte
			raw, err = readTranslationFileRenderPart(part, maxTranslationFileRenderRequestBytes)
			if err == nil && json.Unmarshal(raw, &req) != nil {
				err = errTranslationFileRenderInvalid
			}
		}
		_ = part.Close()
		if err != nil {
			return nil, req, err
		}
	}
	if !seenSource || !seenRequest {
		return nil, req, errTranslationFileRenderInvalid
	}
	return source, req, nil
}

func readTranslationFileRenderPart(part io.Reader, limit int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(part, limit+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > limit {
		return nil, errTranslationFileRenderTooLarge
	}
	return data, nil
}
