package smartling

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/locales"
)

const (
	glossaryImportStatusPending    = "PENDING"
	glossaryImportStatusInProgress = "IN_PROGRESS"
	glossaryImportStatusSuccessful = "SUCCESSFUL"
	glossaryImportStatusFailed     = "FAILED"
)

var (
	glossaryImportPollInterval = time.Second
	glossaryImportMaxPolls     = 120
	glossarySearchPageLimit    = 100
	glossarySearchMaxPages     = 1000
)

// GlossarySummary is one glossary from the v3 search API.
type GlossarySummary struct {
	GlossaryUID string   `json:"glossaryUid"`
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	LocaleIDs   []string `json:"localeIds"`
}

// GlossarySearchInput lists glossaries on an account.
type GlossarySearchInput struct {
	AccountUID string
	Query      string
}

// GlossaryCreateInput creates a glossary on an account.
type GlossaryCreateInput struct {
	AccountUID  string
	Name        string
	Description string
	LocaleIDs   []string
}

// GlossaryCreateResult is the created glossary identity.
type GlossaryCreateResult struct {
	GlossaryUID string `json:"glossaryUid"`
	Name        string `json:"name"`
	AccountUID  string `json:"accountUid,omitempty"`
}

// GlossaryImportInput uploads Smartling's official glossary import file.
type GlossaryImportInput struct {
	AccountUID  string
	GlossaryUID string
	FilePath    string
	MediaType   string
	ArchiveMode bool
}

// GlossaryExportFormat is an official Smartling glossary export file type.
type GlossaryExportFormat string

const (
	GlossaryExportFormatCSV  GlossaryExportFormat = "csv"
	GlossaryExportFormatXLSX GlossaryExportFormat = "xlsx"
	GlossaryExportFormatTBX  GlossaryExportFormat = "tbx"
)

// GlossaryExportInput downloads official Smartling glossary CSV, XLSX, or TBX.
type GlossaryExportInput struct {
	AccountUID  string
	GlossaryUID string
	Format      GlossaryExportFormat
	LocaleIDs   []string
	TbxVersion  string
}

// GlossaryExportResult summarizes an official glossary export.
type GlossaryExportResult struct {
	Bytes       int    `json:"bytes"`
	ContentType string `json:"contentType,omitempty"`
}

// GlossaryImportResult summarizes a completed glossary import.
type GlossaryImportResult struct {
	ImportUID    string `json:"importUid"`
	ImportStatus string `json:"importStatus"`
}

type glossarySearchPayload struct {
	TotalCount int               `json:"totalCount"`
	Items      []GlossarySummary `json:"items"`
}

type glossaryCreatePayload struct {
	GlossaryUID  string `json:"glossaryUid"`
	AccountUID   string `json:"accountUid"`
	Name         string `json:"name"`
	GlossaryName string `json:"glossaryName"`
}

type glossaryGetPayload struct {
	GlossaryUID  string   `json:"glossaryUid"`
	AccountUID   string   `json:"accountUid"`
	Name         string   `json:"name"`
	GlossaryName string   `json:"glossaryName"`
	Description  string   `json:"description"`
	LocaleIDs    []string `json:"localeIds"`
}

type glossaryImportUploadPayload struct {
	GlossaryImport struct {
		GlossaryUID  string `json:"glossaryUid"`
		ImportUID    string `json:"importUid"`
		ImportStatus string `json:"importStatus"`
	} `json:"glossaryImport"`
}

type glossaryImportStatusPayload struct {
	GlossaryUID  string `json:"glossaryUid"`
	ImportUID    string `json:"importUid"`
	ImportStatus string `json:"importStatus"`
}

// SearchGlossaries posts POST /glossary-api/v3/accounts/{accountUid}/glossaries/search.
func (c *HTTPClient) SearchGlossaries(ctx context.Context, in GlossarySearchInput) ([]GlossarySummary, error) {
	accountUID := strings.TrimSpace(in.AccountUID)
	if accountUID == "" {
		return nil, fmt.Errorf("smartling glossary list: account uid is required")
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf("%s/accounts/%s/glossaries/search", c.glossaryV3BaseURL, url.PathEscape(accountUID))
	query := strings.TrimSpace(in.Query)
	limit := glossarySearchPageLimit
	if limit <= 0 {
		limit = 100
	}
	maxPages := glossarySearchMaxPages
	if maxPages <= 0 {
		maxPages = 1000
	}

	var all []GlossarySummary
	offset := 0
	for page := 1; ; page++ {
		if page > maxPages {
			return nil, fmt.Errorf("smartling glossary list: exceeded maximum page count")
		}
		body := map[string]any{
			"query": query,
			"paging": map[string]int{
				"offset": offset,
				"limit":  limit,
			},
		}
		var envelope smartlingDataEnvelope
		if err := c.postJSON(ctx, endpoint, token, body, &envelope); err != nil {
			return nil, fmt.Errorf("smartling glossary list: %w", err)
		}
		var payload glossarySearchPayload
		if err := decodeSmartlingData(envelope, "smartling glossary list", &payload); err != nil {
			return nil, err
		}
		if len(payload.Items) == 0 {
			break
		}
		all = append(all, payload.Items...)
		if len(payload.Items) < limit {
			break
		}
		if payload.TotalCount > 0 && len(all) >= payload.TotalCount {
			break
		}
		next := offset + limit
		if next <= offset {
			return nil, fmt.Errorf("smartling glossary list: pagination offset did not advance")
		}
		offset = next
	}
	return all, nil
}

// CreateGlossary posts POST /glossary-api/v3/accounts/{accountUid}/glossaries.
func (c *HTTPClient) CreateGlossary(ctx context.Context, in GlossaryCreateInput) (GlossaryCreateResult, error) {
	accountUID := strings.TrimSpace(in.AccountUID)
	if accountUID == "" {
		return GlossaryCreateResult{}, fmt.Errorf("smartling glossary create: account uid is required")
	}
	name := strings.TrimSpace(in.Name)
	if name == "" {
		return GlossaryCreateResult{}, fmt.Errorf("smartling glossary create: glossary name is required")
	}
	localeIDs := normalizeGlossaryLocaleIDs(in.LocaleIDs)
	if len(localeIDs) == 0 {
		return GlossaryCreateResult{}, fmt.Errorf("smartling glossary create: at least one locale is required")
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return GlossaryCreateResult{}, err
	}

	body := map[string]any{
		"glossaryName": name,
		"localeIds":    localeIDs,
	}
	if description := strings.TrimSpace(in.Description); description != "" {
		body["description"] = description
	}

	endpoint := fmt.Sprintf("%s/accounts/%s/glossaries", c.glossaryV3BaseURL, url.PathEscape(accountUID))
	var envelope smartlingDataEnvelope
	if err := c.postJSON(ctx, endpoint, token, body, &envelope); err != nil {
		return GlossaryCreateResult{}, fmt.Errorf("smartling glossary create: %w", err)
	}
	var payload glossaryCreatePayload
	if err := decodeSmartlingData(envelope, "smartling glossary create", &payload); err != nil {
		return GlossaryCreateResult{}, err
	}
	glossaryUID := strings.TrimSpace(payload.GlossaryUID)
	if glossaryUID == "" {
		return GlossaryCreateResult{}, fmt.Errorf("smartling glossary create: missing glossary uid in response")
	}
	resultName := strings.TrimSpace(payload.Name)
	if resultName == "" {
		resultName = strings.TrimSpace(payload.GlossaryName)
	}
	return GlossaryCreateResult{
		GlossaryUID: glossaryUID,
		Name:        resultName,
		AccountUID:  strings.TrimSpace(payload.AccountUID),
	}, nil
}

// GetGlossary reads GET /glossary-api/v3/accounts/{accountUid}/glossaries/{glossaryUid}.
func (c *HTTPClient) GetGlossary(ctx context.Context, accountUID, glossaryUID string) (GlossarySummary, error) {
	accountUID = strings.TrimSpace(accountUID)
	if accountUID == "" {
		return GlossarySummary{}, fmt.Errorf("smartling glossary get: account uid is required")
	}
	glossaryUID = strings.TrimSpace(glossaryUID)
	if glossaryUID == "" {
		return GlossarySummary{}, fmt.Errorf("smartling glossary get: glossary uid is required")
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return GlossarySummary{}, err
	}

	endpoint := fmt.Sprintf("%s/accounts/%s/glossaries/%s", c.glossaryV3BaseURL, url.PathEscape(accountUID), url.PathEscape(glossaryUID))
	var envelope smartlingDataEnvelope
	if err := c.getJSON(ctx, endpoint, token, &envelope); err != nil {
		return GlossarySummary{}, fmt.Errorf("smartling glossary get: %w", err)
	}
	var payload glossaryGetPayload
	if err := decodeSmartlingData(envelope, "smartling glossary get", &payload); err != nil {
		return GlossarySummary{}, err
	}
	name := strings.TrimSpace(payload.Name)
	if name == "" {
		name = strings.TrimSpace(payload.GlossaryName)
	}
	return GlossarySummary{
		GlossaryUID: strings.TrimSpace(payload.GlossaryUID),
		Name:        name,
		Description: strings.TrimSpace(payload.Description),
		LocaleIDs:   normalizeGlossaryLocaleIDs(payload.LocaleIDs),
	}, nil
}

// ExportGlossary downloads official Smartling glossary CSV, XLSX, or TBX.
func (c *HTTPClient) ExportGlossary(ctx context.Context, in GlossaryExportInput) (GlossaryExportResult, []byte, error) {
	accountUID := strings.TrimSpace(in.AccountUID)
	if accountUID == "" {
		return GlossaryExportResult{}, nil, fmt.Errorf("smartling glossary export: account uid is required")
	}
	glossaryUID := strings.TrimSpace(in.GlossaryUID)
	if glossaryUID == "" {
		return GlossaryExportResult{}, nil, fmt.Errorf("smartling glossary export: glossary uid is required")
	}
	format, err := normalizeGlossaryExportFormat(in.Format)
	if err != nil {
		return GlossaryExportResult{}, nil, err
	}
	localeIDs := normalizeGlossaryLocaleIDs(in.LocaleIDs)
	if len(localeIDs) == 0 {
		glossary, err := c.GetGlossary(ctx, accountUID, glossaryUID)
		if err != nil {
			return GlossaryExportResult{}, nil, err
		}
		localeIDs = glossary.LocaleIDs
	}
	if len(localeIDs) == 0 {
		return GlossaryExportResult{}, nil, fmt.Errorf("smartling glossary export: at least one locale is required")
	}
	tbxVersion, err := normalizeGlossaryExportTbxVersion(format, in.TbxVersion)
	if err != nil {
		return GlossaryExportResult{}, nil, err
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return GlossaryExportResult{}, nil, err
	}

	body := map[string]any{
		"format":    strings.ToUpper(string(format)),
		"localeIds": localeIDs,
		"filter": map[string]any{
			"paging": map[string]int{
				"offset": 0,
				"limit":  5000,
			},
		},
	}
	if tbxVersion != "" {
		body["tbxVersion"] = tbxVersion
	}

	endpoint := fmt.Sprintf("%s/accounts/%s/glossaries/%s/entries/download", c.glossaryV3BaseURL, url.PathEscape(accountUID), url.PathEscape(glossaryUID))
	content, contentType, err := c.postJSONDownload(ctx, endpoint, token, body)
	if err != nil {
		return GlossaryExportResult{}, nil, fmt.Errorf("smartling glossary export: %w", err)
	}
	return GlossaryExportResult{Bytes: len(content), ContentType: contentType}, content, nil
}

// ImportGlossary uploads, confirms, and polls a glossary CSV, XLSX, or TBX import.
func (c *HTTPClient) ImportGlossary(ctx context.Context, in GlossaryImportInput) (GlossaryImportResult, error) {
	accountUID := strings.TrimSpace(in.AccountUID)
	if accountUID == "" {
		return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: account uid is required")
	}
	glossaryUID := strings.TrimSpace(in.GlossaryUID)
	if glossaryUID == "" {
		return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: glossary uid is required")
	}
	filePath := strings.TrimSpace(in.FilePath)
	if filePath == "" {
		return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: file path is required")
	}
	if _, err := os.Stat(filePath); err != nil {
		if os.IsNotExist(err) {
			return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: file %q does not exist", filePath)
		}
		return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: stat file %q: %w", filePath, err)
	}

	token, err := c.accessToken(ctx)
	if err != nil {
		return GlossaryImportResult{}, err
	}

	mediaType, err := glossaryImportMediaType(filePath, in.MediaType)
	if err != nil {
		return GlossaryImportResult{}, err
	}

	uploadEndpoint := fmt.Sprintf("%s/accounts/%s/glossaries/%s/import", c.glossaryV3BaseURL, url.PathEscape(accountUID), url.PathEscape(glossaryUID))
	var uploadEnvelope smartlingDataEnvelope
	if err := c.postMultipart(ctx, uploadEndpoint, token, map[string]string{
		"importFileName":      filepath.Base(filePath),
		"importFileMediaType": mediaType,
		"archiveMode":         fmt.Sprintf("%t", in.ArchiveMode),
	}, "importFile", filePath, &uploadEnvelope); err != nil {
		return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: %w", err)
	}
	var uploadPayload glossaryImportUploadPayload
	if err := decodeSmartlingData(uploadEnvelope, "smartling glossary import", &uploadPayload); err != nil {
		return GlossaryImportResult{}, err
	}
	importUID := strings.TrimSpace(uploadPayload.GlossaryImport.ImportUID)
	if importUID == "" {
		return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: missing import uid in response")
	}

	confirmEndpoint := fmt.Sprintf("%s/accounts/%s/glossaries/%s/import/%s/confirm", c.glossaryV3BaseURL, url.PathEscape(accountUID), url.PathEscape(glossaryUID), url.PathEscape(importUID))
	if err := c.postJSON(ctx, confirmEndpoint, token, map[string]any{}, nil); err != nil {
		return GlossaryImportResult{}, fmt.Errorf("smartling glossary import confirm: %w", err)
	}

	statusEndpoint := fmt.Sprintf("%s/accounts/%s/glossaries/%s/import/%s", c.glossaryV3BaseURL, url.PathEscape(accountUID), url.PathEscape(glossaryUID), url.PathEscape(importUID))
	for attempt := 0; attempt < glossaryImportMaxPolls; attempt++ {
		var statusEnvelope smartlingDataEnvelope
		if err := c.getJSON(ctx, statusEndpoint, token, &statusEnvelope); err != nil {
			return GlossaryImportResult{}, fmt.Errorf("smartling glossary import status: %w", err)
		}
		var statusPayload glossaryImportStatusPayload
		if err := decodeSmartlingData(statusEnvelope, "smartling glossary import status", &statusPayload); err != nil {
			return GlossaryImportResult{}, err
		}
		switch strings.ToUpper(strings.TrimSpace(statusPayload.ImportStatus)) {
		case glossaryImportStatusSuccessful:
			return GlossaryImportResult{
				ImportUID:    importUID,
				ImportStatus: statusPayload.ImportStatus,
			}, nil
		case glossaryImportStatusFailed:
			return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: import %s failed", importUID)
		case glossaryImportStatusPending, glossaryImportStatusInProgress:
			if err := waitForGlossaryImportPoll(ctx); err != nil {
				return GlossaryImportResult{}, err
			}
		default:
			if err := waitForGlossaryImportPoll(ctx); err != nil {
				return GlossaryImportResult{}, err
			}
		}
	}
	return GlossaryImportResult{}, fmt.Errorf("smartling glossary import: timed out waiting for import %s", importUID)
}

func normalizeGlossaryLocaleIDs(values []string) []string {
	return locales.NormalizeList(values)
}

func normalizeGlossaryExportFormat(format GlossaryExportFormat) (GlossaryExportFormat, error) {
	normalized := GlossaryExportFormat(strings.ToLower(strings.TrimSpace(string(format))))
	switch normalized {
	case GlossaryExportFormatCSV, GlossaryExportFormatXLSX, GlossaryExportFormatTBX:
		return normalized, nil
	case "":
		return "", fmt.Errorf("smartling glossary export: format is required")
	default:
		return "", fmt.Errorf("smartling glossary export: unsupported format %q; expected csv, xlsx, or tbx", format)
	}
}

func normalizeGlossaryExportTbxVersion(format GlossaryExportFormat, version string) (string, error) {
	trimmed := strings.ToLower(strings.TrimSpace(version))
	if format != GlossaryExportFormatTBX {
		if trimmed != "" {
			return "", fmt.Errorf("smartling glossary export: tbx version is only valid for tbx format")
		}
		return "", nil
	}
	switch trimmed {
	case "", "v3", "tbxcorestructv03":
		return "TBXcoreStructV03", nil
	case "v2", "tbxcorestructv02":
		return "TBXcoreStructV02", nil
	default:
		return "", fmt.Errorf("smartling glossary export: unsupported tbx version %q; expected v2 or v3", version)
	}
}

func glossaryImportMediaType(path, override string) (string, error) {
	if mediaType := strings.TrimSpace(override); mediaType != "" {
		return mediaType, nil
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".csv":
		return "text/csv", nil
	case ".tbx", ".xml":
		return "text/xml", nil
	case ".xlsx":
		return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", nil
	default:
		return "", fmt.Errorf("smartling glossary import: unsupported file type %q; expected .csv, .xlsx, or .tbx", filepath.Ext(path))
	}
}

func waitForGlossaryImportPoll(ctx context.Context) error {
	timer := time.NewTimer(glossaryImportPollInterval)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
