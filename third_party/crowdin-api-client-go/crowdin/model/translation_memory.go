package model

import (
	"errors"
	"fmt"
	"net/url"
)

// TranslationMemory represents a Crowdin Translation Memory (TM).
type TranslationMemory struct {
	ID                int      `json:"id"`
	UserID            int      `json:"userId"`
	Name              string   `json:"name"`
	LanguageID        string   `json:"languageId"`
	LanguageIDs       []string `json:"languageIds"`
	SegmentsCount     int      `json:"segmentsCount"`
	DefaultProjectIDs []int    `json:"defaultProjectIds"`
	ProjectIDs        []int    `json:"projectIds"`
	WebURL            string   `json:"webUrl"`
	CreatedAt         string   `json:"createdAt"`
}

// TranslationMemoryResponse defines the structure of the response
// when getting a single Translation Memory.
type TranslationMemoryResponse struct {
	Data *TranslationMemory `json:"data"`
}

// TranslationMemoriesListResponse defines the structure of the response
// when getting a list of Translation Memories.
type TranslationMemoriesListResponse struct {
	Data []*TranslationMemoryResponse `json:"data"`
}

// TranslationMemoriesListOptions specifies the optional parameters to the
// TranslationMemoryService.ListTMs method.
type TranslationMemoriesListOptions struct {
	// Sort the results by a specific field.
	// Enum: id, name, userId, createdAt. Default: id.
	// Example: orderBy=createdAt desc,name
	OrderBy string `json:"orderBy,omitempty"`
	// Project Member Identifier.
	UserID int `json:"userId,omitempty"`

	ListOptions
}

// Values returns the url.Values of the TranslationMemoriesListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *TranslationMemoriesListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if o.UserID > 0 {
		v.Add("userId", fmt.Sprintf("%d", o.UserID))
	}

	return v, len(v) > 0
}

// TranslationMemoryAddRequest defines the structure of the request
// when adding a new Translation Memory.
type TranslationMemoryAddRequest struct {
	// Translation Memory name.
	Name string `json:"name"`
	// Translation Memory Language Identifier.
	LanguageID string `json:"languageId"`
}

// Validate checks if the TranslationMemoryAddRequest is valid.
// It implements the crowdin.Validator interface.
func (r *TranslationMemoryAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.LanguageID == "" {
		return errors.New("languageId is required")
	}

	return nil
}

// TranslationMemoryExport represents a Crowdin Translation Memory
// export status.
type TranslationMemoryExport struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
	Attributes struct {
		SourceLanguageID string `json:"sourceLanguageId"`
		TargetLanguageID string `json:"targetLanguageId"`
		Format           string `json:"format"`
	} `json:"attributes"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	StartedAt  string `json:"startedAt"`
	FinishedAt string `json:"finishedAt"`
}

// TranslationMemoryExportResponse defines the structure of the response
// when exporting a Translation Memory.
type TranslationMemoryExportResponse struct {
	Data *TranslationMemoryExport `json:"data"`
}

// TMExportFormat defines the format of the Translation Memory export.
type TMExportFormat string

// Supported Translation Memory export formats.
const (
	TMExportFormatTMX  TMExportFormat = "tmx"
	TMExportFormatCSV  TMExportFormat = "csv"
	TMExportFormatXLSX TMExportFormat = "xlsx"
)

// TranslationMemoryExportRequest defines the structure of the request
// when exporting a Translation Memory.
type TranslationMemoryExportRequest struct {
	// Defines Source Language in language pair.
	SourceLanguageID string `json:"sourceLanguageId,omitempty"`
	// Defines Target Language in language pair.
	TargetLanguageID string `json:"targetLanguageId,omitempty"`
	// Defines TMs file format.
	// Enum: tmx, csv, xlsx. Default: tmx.
	Format TMExportFormat `json:"format,omitempty"`
}

// Validate checks if the TranslationMemoryExportRequest is valid.
// It implements the crowdin.Validator interface.
func (r *TranslationMemoryExportRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Format != "" && r.Format != TMExportFormatTMX &&
		r.Format != TMExportFormatCSV && r.Format != TMExportFormatXLSX {
		return fmt.Errorf("unsupported format: %q", r.Format)
	}

	return nil
}

// TranslationMemoryImport represents a Crowdin Translation Memory
// import status.
type TranslationMemoryImport struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
	Attributes struct {
		TMID                    int            `json:"tmId"`
		StorageID               int            `json:"storageId"`
		FirstLineContainsHeader bool           `json:"firstLineContainsHeader"`
		Scheme                  map[string]int `json:"scheme"`
	} `json:"attributes"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	StartedAt  string `json:"startedAt"`
	FinishedAt string `json:"finishedAt"`
}

// TranslationMemoryImportResponse defines the structure of the response
// when importing a Translation Memory.
type TranslationMemoryImportResponse struct {
	Data *TranslationMemoryImport `json:"data"`
}

// TranslationMemoryImportRequest defines the structure of the request
// when importing a Translation Memory.
type TranslationMemoryImportRequest struct {
	// Storage Identifier.
	// Supported file formats: TMX, CSV, XLS/XLSX.
	StorageID int `json:"storageId"`
	// Defines whether file includes first row header that
	// should not be imported.
	// Note: Used for upload of CSV or XLS/XLSX files only.
	// Default: false.
	FirstLineContainsHeader *bool `json:"firstLineContainsHeader,omitempty"`
	// Defines data columns mapping.
	// The passed value should be an associative array containing both
	// language id and column number.
	// - {languageId} – Crowdin id for the specified language.
	// - {columnNumber} – a column number. Please note, that column
	// numbering starts at 0.
	// Note: Required for CSV or XLS/XLSX files.
	// Example: {"uk": 0, "fr": 1}
	Scheme map[string]int `json:"scheme,omitempty"`
}

// Validate checks if the TranslationMemoryImportRequest is valid.
// It implements the crowdin.Validator interface.
func (r *TranslationMemoryImportRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.StorageID <= 0 {
		return errors.New("storageId is required")
	}

	return nil
}

// TMConcordanceSearchRequest defines the structure of the request
// when searching for concordance in a Translation Memory.
type TMConcordanceSearchRequest struct {
	SourceLanguageID string   `json:"sourceLanguageId"`
	TargetLanguageID string   `json:"targetLanguageId"`
	AutoSubstitution *bool    `json:"autoSubstitution"`
	MinRelevant      int      `json:"minRelevant"`
	Expressions      []string `json:"expressions"`
}

// Validate checks if the TMConcordanceSearchRequest is valid.
// It implements the crowdin.Validator interface.
func (r *TMConcordanceSearchRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.SourceLanguageID == "" {
		return errors.New("sourceLanguageId is required")
	}
	if r.TargetLanguageID == "" {
		return errors.New("targetLanguageId is required")
	}
	if r.AutoSubstitution == nil {
		return errors.New("autoSubstitution is required")
	}
	if r.MinRelevant <= 0 {
		return errors.New("minRelevant is required")
	}
	if len(r.Expressions) == 0 {
		return errors.New("expressions cannot be empty")
	}

	return nil
}

// TMConcordanceSearch represents a Translation Memory
// concordance search result.
type TMConcordanceSearch struct {
	TM struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	} `json:"tm"`
	RecordID    int    `json:"recordId"`
	Source      string `json:"source"`
	Target      string `json:"target"`
	Relevant    int    `json:"relevant"`
	Substituted string `json:"substituted"`
	UpdatedAt   string `json:"updatedAt"`
}

// TMConcordanceSearchResponse defines the structure of the response
// when searching for concordance in a Translation Memory.
type TMConcordanceSearchResponse struct {
	Data []struct {
		Data *TMConcordanceSearch `json:"data"`
	} `json:"data"`
}

// TMSegment represents a Crowdin Translation Memory segment.
type TMSegment struct {
	// Segment Identifier.
	ID int `json:"id"`
	// Segment records.
	Records []*TMSegmentRecord `json:"records"`
}

// TMSegmentRecord represents a TM segment record in the TMSegment.
type TMSegmentRecord struct {
	// Record Identifier.
	ID int `json:"id"`
	// Language Identifier.
	LanguageID string `json:"languageId"`
	// Record text.
	Text string `json:"text"`
	// Count usage of segment record.
	UsageCount int `json:"usageCount"`
	// Creator User Identifier.
	CreatedBy int `json:"createdBy"`
	// Redactor User Identifier.
	UpdatedBy int `json:"updatedBy"`
	// Created at time.
	CreatedAt string `json:"createdAt"`
	// Updated at time.
	UpdatedAt string `json:"updatedAt"`
}

// TMSegmentResponse defines the structure of the response
// when getting a single Translation Memory segment.
type TMSegmentResponse struct {
	Data *TMSegment `json:"data"`
}

// TMSegmentsListResponse defines the structure of the response
// when getting a list of Translation Memory segments.
type TMSegmentsListResponse struct {
	Data []*TMSegmentResponse `json:"data"`
}

// TMSegmentsListOptions specifies the optional parameters to the
// TranslationMemoryService.ListTMSegments method.
type TMSegmentsListOptions struct {
	// Sort list of segments by a specific field.
	// Enum: id. Default: id.
	// Example: orderBy=id desc
	OrderBy string `json:"orderBy,omitempty"`
	// Filter segments by CroQL query.
	CroQL string `json:"croql,omitempty"`

	ListOptions
}

// Values returns the url.Values of the TMSegmentsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *TMSegmentsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}
	if o.CroQL != "" {
		v.Add("croql", o.CroQL)
	}

	return v, len(v) > 0
}

// TMSegmentCreateRequest defines the structure of the request
// when creating a new Translation Memory segment.
type TMSegmentCreateRequest struct {
	Records []*TMSegmentCreateRecord `json:"records"`
}

// TMSegmentCreateRecord represents a TM segment record in
// the TMSegmentCreateRequest.
type TMSegmentCreateRecord struct {
	// Language Identifier.
	LanguageID string `json:"languageId"`
	// Record text.
	Text string `json:"text"`
}

// Validate checks if the TMSegmentCreateRequest is valid.
// It implements the crowdin.Validator interface.
func (r *TMSegmentCreateRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if len(r.Records) == 0 {
		return errors.New("records is required")
	}

	return nil
}
