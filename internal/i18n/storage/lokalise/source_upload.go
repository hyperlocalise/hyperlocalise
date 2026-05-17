package lokalise

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

const maxLokaliseUploadResponseBody = 1 << 20

// SourceUploadInput describes one Lokalise source file import.
type SourceUploadInput struct {
	ProjectID           string
	SourceLocale        string
	FilePath            string
	FileFormat          string
	Branch              string
	Tags                []string
	ConvertPlaceholders bool
	ReplaceModified     bool
	DistinguishByFile   bool
	ApplyTM             bool
	SkipDetectLangISO   bool
}

// SourceUploadResult is the normalized subset of Lokalise's queued import response.
type SourceUploadResult struct {
	ProcessID string
	Type      string
	Status    string
	Message   string
}

type lokaliseFileUploadRequest struct {
	Data                string   `json:"data"`
	Filename            string   `json:"filename"`
	LangISO             string   `json:"lang_iso"`
	Format              string   `json:"format,omitempty"`
	Tags                []string `json:"tags,omitempty"`
	ConvertPlaceholders bool     `json:"convert_placeholders,omitempty"`
	ReplaceModified     bool     `json:"replace_modified,omitempty"`
	DistinguishByFile   bool     `json:"distinguish_by_file,omitempty"`
	ApplyTM             bool     `json:"apply_tm,omitempty"`
	SkipDetectLangISO   bool     `json:"skip_detect_lang_iso,omitempty"`
	Queue               bool     `json:"queue"`
}

type lokaliseFileUploadResponse struct {
	Process struct {
		ID      string `json:"process_id"`
		Type    string `json:"type"`
		Status  string `json:"status"`
		Message string `json:"message"`
	} `json:"process"`
}

// UploadSourceFile imports a source file into Lokalise and returns the queued import process.
func (c *HTTPClient) UploadSourceFile(ctx context.Context, in SourceUploadInput) (SourceUploadResult, error) {
	if c == nil || c.httpClient == nil {
		return SourceUploadResult{}, fmt.Errorf("lokalise source upload: client is nil")
	}
	if strings.TrimSpace(in.ProjectID) == "" {
		return SourceUploadResult{}, fmt.Errorf("lokalise source upload: project id is required")
	}
	if strings.TrimSpace(in.SourceLocale) == "" {
		return SourceUploadResult{}, fmt.Errorf("lokalise source upload: source locale is required")
	}
	if strings.TrimSpace(in.FilePath) == "" {
		return SourceUploadResult{}, fmt.Errorf("lokalise source upload: file path is required")
	}
	format, err := resolveLokaliseUploadFormat(in.FilePath, in.FileFormat)
	if err != nil {
		return SourceUploadResult{}, err
	}

	content, err := os.ReadFile(in.FilePath)
	if err != nil {
		return SourceUploadResult{}, fmt.Errorf("lokalise source upload: read source file %q: %w", in.FilePath, err)
	}
	req := lokaliseFileUploadRequest{
		Data:                base64.StdEncoding.EncodeToString(content),
		Filename:            filepath.Base(in.FilePath),
		LangISO:             strings.TrimSpace(in.SourceLocale),
		Format:              format,
		Tags:                normalizeLokaliseUploadTags(in.Tags),
		ConvertPlaceholders: in.ConvertPlaceholders,
		ReplaceModified:     in.ReplaceModified,
		DistinguishByFile:   in.DistinguishByFile,
		ApplyTM:             in.ApplyTM,
		SkipDetectLangISO:   in.SkipDetectLangISO,
		Queue:               true,
	}

	var out lokaliseFileUploadResponse
	path := fmt.Sprintf("/projects/%s/files/upload", lokaliseProjectPathSegment(in.ProjectID, in.Branch))
	if err := c.doLokaliseUploadJSON(ctx, http.MethodPost, path, req, &out); err != nil {
		return SourceUploadResult{}, fmt.Errorf("lokalise source upload %q: %w", in.FilePath, err)
	}
	if strings.TrimSpace(out.Process.ID) == "" {
		return SourceUploadResult{}, fmt.Errorf("lokalise source upload %q: response missing process id", in.FilePath)
	}
	return SourceUploadResult{
		ProcessID: strings.TrimSpace(out.Process.ID),
		Type:      strings.TrimSpace(out.Process.Type),
		Status:    strings.TrimSpace(out.Process.Status),
		Message:   strings.TrimSpace(out.Process.Message),
	}, nil
}

func (c *HTTPClient) doLokaliseUploadJSON(ctx context.Context, method, path string, payload any, out any) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Token", strings.TrimSpace(c.apiToken))

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if !isLokaliseUploadSuccessStatus(resp.StatusCode) {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return fmt.Errorf("lokalise API %s %s failed: status=%d body=%s", method, path, resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxLokaliseUploadResponseBody))
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxLokaliseUploadResponseBody)).Decode(out); err != nil {
		return fmt.Errorf("decode lokalise API response: %w", err)
	}
	return nil
}

func isLokaliseUploadSuccessStatus(status int) bool {
	return status >= 200 && status < 300 || status == http.StatusFound
}

func resolveLokaliseUploadFormat(path, override string) (string, error) {
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		return strings.TrimPrefix(strings.ToLower(trimmed), "."), nil
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	if ext == "" {
		return "", fmt.Errorf("lokalise source upload: could not determine file format for %q; use --format", path)
	}
	return ext, nil
}

func lokaliseProjectPathSegment(projectID, branch string) string {
	segment := url.PathEscape(strings.TrimSpace(projectID))
	if trimmed := strings.TrimSpace(branch); trimmed != "" {
		segment += ":" + url.PathEscape(trimmed)
	}
	return segment
}

func normalizeLokaliseUploadTags(tags []string) []string {
	out := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))
	for _, tag := range tags {
		for _, part := range strings.Split(tag, ",") {
			trimmed := strings.TrimSpace(part)
			if trimmed == "" {
				continue
			}
			if _, ok := seen[trimmed]; ok {
				continue
			}
			seen[trimmed] = struct{}{}
			out = append(out, trimmed)
		}
	}
	return out
}
