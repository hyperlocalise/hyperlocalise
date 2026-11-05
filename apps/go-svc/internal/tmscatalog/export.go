package tmscatalog

import (
	"bytes"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"
)

func isJSONContentType(contentType string) bool {
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil {
		return strings.HasPrefix(strings.ToLower(strings.TrimSpace(contentType)), "application/json")
	}
	return strings.EqualFold(mediaType, "application/json")
}

// readExportFile reads a TBX/TMX body. JSON means the TMS refused to hand back a file.
func readExportFile(res *http.Response, provider string, maxBytes int64) ([]byte, error) {
	if isJSONContentType(res.Header.Get("Content-Type")) {
		_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 64<<10))
		return nil, &ProviderError{Status: res.StatusCode, Message: provider + " returned JSON instead of a file"}
	}
	content, err := io.ReadAll(io.LimitReader(res.Body, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > maxBytes {
		return nil, tooLarge(provider, maxBytes)
	}
	if len(bytes.TrimSpace(content)) == 0 {
		return nil, &ProviderError{Status: http.StatusUnprocessableEntity, Message: "The " + provider + " export was empty"}
	}
	return content, nil
}

func exportDownloadURL(raw string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || parsed.Host == "" {
		return nil, fmt.Errorf("export download url is missing")
	}
	if !strings.EqualFold(parsed.Scheme, "https") && !strings.EqualFold(parsed.Scheme, "http") {
		return nil, fmt.Errorf("export download url must be http or https")
	}
	return parsed, nil
}
