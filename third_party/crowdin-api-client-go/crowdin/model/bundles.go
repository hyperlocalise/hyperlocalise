package model

import "errors"

// Bundle represents a Crowdin bundle.
type Bundle struct {
	ID                           int      `json:"id"`
	Name                         string   `json:"name"`
	Format                       string   `json:"format"`
	SourcePatterns               []string `json:"sourcePatterns"`
	IgnorePatterns               []string `json:"ignorePatterns"`
	ExportPattern                string   `json:"exportPattern"`
	IsMultilingual               bool     `json:"isMultilingual"`
	IncludeProjectSourceLanguage bool     `json:"includeProjectSourceLanguage"`
	LabelIDs                     []int    `json:"labelIds"`
	ExcludeLabelIDs              []int    `json:"excludeLabelIds"`
	WebURL                       string   `json:"webUrl"`
	CreatedAt                    string   `json:"createdAt"`
	UpdatedAt                    string   `json:"updatedAt"`
}

// BundleResponse defines the structure of a response
// when getting a single bundle.
type BundleResponse struct {
	Data *Bundle `json:"data"`
}

// BundlesListResponse defines the structure of a response
// when getting a list of bundles.
type BundlesListResponse struct {
	Data []*BundleResponse `json:"data"`
}

// BundleAddRequest defines the structure of a request
// to add a new bundle.
type BundleAddRequest struct {
	// Defines name.
	Name string `json:"name"`
	// Defines export file format.
	Format string `json:"format"`
	// Source patterns.
	SourcePatterns []string `json:"sourcePatterns"`
	// Ignore patterns.
	IgnorePatterns []string `json:"ignorePatterns"`
	// Bundle export pattern. Defines bundle name in resulting
	// translations bundle.
	// Note: Can't contain : * ? " < > | symbols.
	ExportPattern string `json:"exportPattern"`
	// Export translations in multilingual file.
	// Default: false.
	IsMultilingual *bool `json:"isMultilingual"`
	// Add project source language to bundle.
	// Default: false.
	IncludeProjectSourceLanguage *bool `json:"includeProjectSourceLanguage"`
	// Label Identifiers.
	LabelIDs []int `json:"labelIds"`
	// Label Identifiers.
	ExcludeLabelIDs []int `json:"excludeLabelIds"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (b *BundleAddRequest) Validate() error {
	if b == nil {
		return ErrNilRequest
	}
	if b.Name == "" {
		return errors.New("name is required")
	}
	if b.Format == "" {
		return errors.New("format is required")
	}
	if len(b.SourcePatterns) == 0 {
		return errors.New("sourcePatterns is required")
	}
	if b.ExportPattern == "" {
		return errors.New("exportPattern is required")
	}

	return nil
}

// BundleExport represents a bundle export progress.
type BundleExport struct {
	Identifier string `json:"identifier"`
	Status     string `json:"status"`
	Progress   int    `json:"progress"`
	Attributes struct {
		BundleID int `json:"bundleId"`
	} `json:"attributes"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
	StartedAt  string `json:"startedAt"`
	FinishedAt string `json:"finishedAt"`
}

// BundleExportResponse defines the structure of a response
// when exporting a bundle.
type BundleExportResponse struct {
	Data *BundleExport `json:"data"`
}
