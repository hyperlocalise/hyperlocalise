package tmscatalog

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	crowdinPageLimit      = 500
	crowdinExportPoll     = time.Second
	crowdinMaxErrorBytes  = 64 << 10
	crowdinExportFinished = "finished"
)

// crowdin talks to Crowdin API v2. BaseURL already ends in /api/v2, for both
// crowdin.com and Enterprise ({org}.api.crowdin.com) accounts.
type crowdin struct {
	credentials Credentials
	http        HTTPDoer
	pollEvery   time.Duration
}

func newCrowdin(credentials Credentials, httpClient HTTPDoer) *crowdin {
	credentials.BaseURL = strings.TrimRight(strings.TrimSpace(credentials.BaseURL), "/")
	return &crowdin{credentials: credentials, http: httpClient, pollEvery: crowdinExportPoll}
}

type crowdinLanguageResource struct {
	ID          int      `json:"id"`
	Name        string   `json:"name"`
	LanguageID  string   `json:"languageId"`
	LanguageIDs []string `json:"languageIds"`
	// Glossaries report terms, memories segmentsCount.
	Terms         *int `json:"terms"`
	SegmentsCount *int `json:"segmentsCount"`
}

type crowdinExportStatus struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
}

func (c *crowdin) ListGlossaries(ctx context.Context) ([]Resource, error) {
	return c.listResources(ctx, "/glossaries", func(r crowdinLanguageResource) *int { return r.Terms })
}

func (c *crowdin) ListMemories(ctx context.Context) ([]Resource, error) {
	return c.listResources(ctx, "/tms", func(r crowdinLanguageResource) *int { return r.SegmentsCount })
}

func (c *crowdin) ExportGlossary(ctx context.Context, externalID string, maxBytes int64) (Export, error) {
	content, err := c.export(ctx, "/glossaries/"+url.PathEscape(externalID)+"/exports", "tbx", maxBytes)
	return Export{Format: "tbx", Content: content}, err
}

func (c *crowdin) ExportMemory(ctx context.Context, externalID string, maxBytes int64) (Export, error) {
	content, err := c.export(ctx, "/tms/"+url.PathEscape(externalID)+"/exports", "tmx", maxBytes)
	return Export{Format: "tmx", Content: content}, err
}

func (c *crowdin) listResources(ctx context.Context, path string, count func(crowdinLanguageResource) *int) ([]Resource, error) {
	resources := []Resource{}
	for offset := 0; ; offset += crowdinPageLimit {
		var page struct {
			Data []struct {
				Data crowdinLanguageResource `json:"data"`
			} `json:"data"`
		}
		query := "?limit=" + strconv.Itoa(crowdinPageLimit) + "&offset=" + strconv.Itoa(offset)
		if err := c.doJSON(ctx, http.MethodGet, path+query, nil, &page); err != nil {
			return nil, err
		}
		for _, item := range page.Data {
			resources = append(resources, crowdinResource(item.Data, count(item.Data)))
		}
		if len(page.Data) < crowdinPageLimit {
			return resources, nil
		}
	}
}

func crowdinResource(r crowdinLanguageResource, count *int) Resource {
	resource := Resource{
		ExternalID:    strconv.Itoa(r.ID),
		Name:          r.Name,
		TargetLocales: []string{},
		Count:         count,
	}
	if r.LanguageID != "" {
		source := r.LanguageID
		resource.SourceLocale = &source
	}
	for _, language := range r.LanguageIDs {
		if language != r.LanguageID {
			resource.TargetLocales = append(resource.TargetLocales, language)
		}
	}
	return resource
}

// export starts a Crowdin export, waits for it, and downloads the file. Crowdin
// hands back a pre-signed URL, which is fetched without the API token.
func (c *crowdin) export(ctx context.Context, exportsPath, format string, maxBytes int64) ([]byte, error) {
	var started struct {
		Data crowdinExportStatus `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodPost, exportsPath, map[string]string{"format": format}, &started); err != nil {
		return nil, err
	}
	status := started.Data
	if status.Identifier == "" {
		return nil, fmt.Errorf("crowdin: export started without an identifier")
	}
	statusPath := exportsPath + "/" + url.PathEscape(status.Identifier)
	for status.Status != crowdinExportFinished {
		switch status.Status {
		case "failed", "canceled":
			return nil, fmt.Errorf("crowdin: the export %s", status.Status)
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(c.pollEvery):
		}
		var polled struct {
			Data crowdinExportStatus `json:"data"`
		}
		if err := c.doJSON(ctx, http.MethodGet, statusPath, nil, &polled); err != nil {
			return nil, err
		}
		status = polled.Data
	}

	var download struct {
		Data struct {
			URL string `json:"url"`
		} `json:"data"`
	}
	if err := c.doJSON(ctx, http.MethodGet, statusPath+"/download", nil, &download); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, download.Data.URL, nil)
	if err != nil {
		return nil, err
	}
	res, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, &ProviderError{Status: res.StatusCode, Message: "Could not download the Crowdin export"}
	}
	content, err := io.ReadAll(io.LimitReader(res.Body, maxBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(content)) > maxBytes {
		return nil, &ProviderError{Status: http.StatusRequestEntityTooLarge, Message: fmt.Sprintf("The Crowdin export is larger than %d MB", maxBytes>>20)}
	}
	return content, nil
}

func (c *crowdin) doJSON(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(raw)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.credentials.BaseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set(c.credentials.HeaderName, c.credentials.HeaderValue)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode > 299 {
		return crowdinError(res)
	}
	return json.NewDecoder(res.Body).Decode(out)
}

// crowdinError keeps Crowdin's own message: {"error":{"code":401,"message":"..."}}.
func crowdinError(res *http.Response) error {
	raw, _ := io.ReadAll(io.LimitReader(res.Body, crowdinMaxErrorBytes))
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(raw, &body)
	message := strings.TrimSpace(body.Error.Message)
	if message != "" {
		message = "Crowdin: " + message
	}
	return &ProviderError{Status: res.StatusCode, Message: message}
}
