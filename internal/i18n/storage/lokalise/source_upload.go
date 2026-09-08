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

const (
	maxLokaliseUploadFileBytes    = 20 << 20
	maxLokaliseUploadResponseBody = 1 << 20
)

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

// TranslationUploadInput describes one Lokalise translation file import.
type TranslationUploadInput struct {
	ProjectID           string
	TargetLocale        string
	FilePath            string
	FileFormat          string
	Branch              string
	Tags                []string
	ConvertPlaceholders bool
	ReplaceModified     bool
	DistinguishByFile   bool
	ApplyTM             bool
}

// SourceUploadResult is the normalized subset of Lokalise's queued import response.
type SourceUploadResult struct {
	ProcessID string
	Type      string
	Status    string
	Message   string
}

// TranslationUploadResult is the queued import process for a translation file.
type TranslationUploadResult = SourceUploadResult

type lokaliseFileUploadRequest struct {
	Data                string   `json:"data"`
	Filename            string   `json:"filename"`
	LangISO             string   `json:"lang_iso"`
	Format              string   `json:"format,omitempty"`
	Tags                []string `json:"tags,omitempty"`
	// Always send convert_placeholders. Lokalise defaults omitted values to true.
	ConvertPlaceholders bool     `json:"convert_placeholders"`
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

type lokaliseFileUploadInput struct {
	ProjectID           string
	Locale              string
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

// UploadSourceFile imports a source file into Lokalise and returns the queued import process.
func (c *HTTPClient) UploadSourceFile(ctx context.Context, in SourceUploadInput) (SourceUploadResult, error) {
	return c.uploadLocalizationFile(ctx, lokaliseFileUploadInput{
		ProjectID:           in.ProjectID,
		Locale:              in.SourceLocale,
		FilePath:            in.FilePath,
		FileFormat:          in.FileFormat,
		Branch:              in.Branch,
		Tags:                in.Tags,
		ConvertPlaceholders: in.ConvertPlaceholders,
		ReplaceModified:     in.ReplaceModified,
		DistinguishByFile:   in.DistinguishByFile,
		ApplyTM:             in.ApplyTM,
		SkipDetectLangISO:   in.SkipDetectLangISO,
	}, "source")
}

// UploadTranslationFile imports a translation file into Lokalise and returns the queued import process.
// It always skips filename language detection so --target-locale wins over names like en.json.
func (c *HTTPClient) UploadTranslationFile(ctx context.Context, in TranslationUploadInput) (TranslationUploadResult, error) {
	return c.uploadLocalizationFile(ctx, lokaliseFileUploadInput{
		ProjectID:           in.ProjectID,
		Locale:              in.TargetLocale,
		FilePath:            in.FilePath,
		FileFormat:          in.FileFormat,
		Branch:              in.Branch,
		Tags:                in.Tags,
		ConvertPlaceholders: in.ConvertPlaceholders,
		ReplaceModified:     in.ReplaceModified,
		DistinguishByFile:   in.DistinguishByFile,
		ApplyTM:             in.ApplyTM,
		SkipDetectLangISO:   true,
	}, "translation")
}

func (c *HTTPClient) uploadLocalizationFile(ctx context.Context, in lokaliseFileUploadInput, kind string) (SourceUploadResult, error) {
	op := "lokalise " + kind + " upload"
	if c == nil || c.httpClient == nil {
		return SourceUploadResult{}, fmt.Errorf("%s: client is nil", op)
	}
	if strings.TrimSpace(in.ProjectID) == "" {
		return SourceUploadResult{}, fmt.Errorf("%s: project id is required", op)
	}
	if strings.TrimSpace(in.Locale) == "" {
		if kind == "translation" {
			return SourceUploadResult{}, fmt.Errorf("%s: target locale is required", op)
		}
		return SourceUploadResult{}, fmt.Errorf("%s: source locale is required", op)
	}
	if strings.TrimSpace(in.FilePath) == "" {
		return SourceUploadResult{}, fmt.Errorf("%s: file path is required", op)
	}
	format, err := resolveLokaliseUploadFormat(in.FilePath, in.FileFormat, op)
	if err != nil {
		return SourceUploadResult{}, err
	}

	file, statErr := os.Open(in.FilePath)
	if statErr != nil {
		return SourceUploadResult{}, fmt.Errorf("%s: open file %q: %w", op, in.FilePath, statErr)
	}
	defer func() {
		_ = file.Close()
	}()
	info, statErr := file.Stat()
	if statErr != nil {
		return SourceUploadResult{}, fmt.Errorf("%s: stat file %q: %w", op, in.FilePath, statErr)
	}
	if info.Size() > maxLokaliseUploadFileBytes {
		return SourceUploadResult{}, fmt.Errorf("%s: file %q exceeds maximum upload size (%d bytes)", op, in.FilePath, maxLokaliseUploadFileBytes)
	}
	content, err := io.ReadAll(io.LimitReader(file, maxLokaliseUploadFileBytes+1))
	if err != nil {
		return SourceUploadResult{}, fmt.Errorf("%s: read file %q: %w", op, in.FilePath, err)
	}
	if len(content) > maxLokaliseUploadFileBytes {
		return SourceUploadResult{}, fmt.Errorf("%s: file %q exceeds maximum upload size (%d bytes)", op, in.FilePath, maxLokaliseUploadFileBytes)
	}
	req := lokaliseFileUploadRequest{
		Data:                base64.StdEncoding.EncodeToString(content),
		Filename:            filepath.Base(in.FilePath),
		LangISO:             strings.TrimSpace(in.Locale),
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
	meta, err := c.doLokaliseUploadJSON(ctx, http.MethodPost, path, req, &out)
	if err != nil {
		return SourceUploadResult{}, fmt.Errorf("%s %q: %w", op, in.FilePath, err)
	}
	if strings.TrimSpace(out.Process.ID) == "" {
		if meta.StatusCode == http.StatusFound {
			return SourceUploadResult{}, fmt.Errorf("%s %q: 302 queued response missing process id%s", op, in.FilePath, lokaliseUploadLocationSuffix(meta.Location))
		}
		return SourceUploadResult{}, fmt.Errorf("%s %q: response missing process id", op, in.FilePath)
	}
	return SourceUploadResult{
		ProcessID: strings.TrimSpace(out.Process.ID),
		Type:      strings.TrimSpace(out.Process.Type),
		Status:    strings.TrimSpace(out.Process.Status),
		Message:   strings.TrimSpace(out.Process.Message),
	}, nil
}

type lokaliseUploadHTTPMeta struct {
	StatusCode int
	Location   string
}

func (c *HTTPClient) doLokaliseUploadJSON(ctx context.Context, method, path string, payload any, out any) (lokaliseUploadHTTPMeta, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return lokaliseUploadHTTPMeta{}, err
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return lokaliseUploadHTTPMeta{}, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Api-Token", strings.TrimSpace(c.apiToken))

	resp, err := lokaliseUploadHTTPClient(c.httpClient).Do(req)
	if err != nil {
		return lokaliseUploadHTTPMeta{}, err
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	meta := lokaliseUploadHTTPMeta{
		StatusCode: resp.StatusCode,
		Location:   strings.TrimSpace(resp.Header.Get("Location")),
	}
	if !isLokaliseUploadSuccessStatus(resp.StatusCode) {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return meta, fmt.Errorf("lokalise API %s %s failed: status=%d body=%s", method, path, resp.StatusCode, strings.TrimSpace(string(raw)))
	}
	if out == nil {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxLokaliseUploadResponseBody))
		return meta, nil
	}
	if resp.StatusCode == http.StatusFound {
		raw, err := io.ReadAll(io.LimitReader(resp.Body, maxLokaliseUploadResponseBody))
		if err != nil {
			return meta, fmt.Errorf("read lokalise API 302 response: %w", err)
		}
		if strings.TrimSpace(string(raw)) == "" {
			return meta, fmt.Errorf("lokalise API %s %s returned 302 without JSON queued process body%s", method, path, lokaliseUploadLocationSuffix(meta.Location))
		}
		if err := json.NewDecoder(bytes.NewReader(raw)).Decode(out); err != nil {
			return meta, fmt.Errorf("decode lokalise API 302 queued response%s: %w", lokaliseUploadLocationSuffix(meta.Location), err)
		}
		return meta, nil
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, maxLokaliseUploadResponseBody)).Decode(out); err != nil {
		return meta, fmt.Errorf("decode lokalise API response: %w", err)
	}
	return meta, nil
}

func isLokaliseUploadSuccessStatus(status int) bool {
	return (status >= 200 && status < 300) || status == http.StatusFound
}

func lokaliseUploadLocationSuffix(location string) string {
	if strings.TrimSpace(location) == "" {
		return ""
	}
	return " location=" + strings.TrimSpace(location)
}

func lokaliseUploadHTTPClient(client *http.Client) *http.Client {
	cloned := *client
	cloned.CheckRedirect = func(*http.Request, []*http.Request) error {
		return http.ErrUseLastResponse
	}
	return &cloned
}

func resolveLokaliseUploadFormat(path, override, op string) (string, error) {
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		return strings.TrimPrefix(strings.ToLower(trimmed), "."), nil
	}
	ext := strings.TrimPrefix(strings.ToLower(filepath.Ext(path)), ".")
	if ext == "" {
		return "", fmt.Errorf("%s: could not determine file format for %q: no file extension and no format override provided", op, path)
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
	if len(out) == 0 {
		return nil
	}
	return out
}
