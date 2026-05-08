package model

import "errors"

// Distribution represents a distribution in the project.
type Distribution struct {
	Hash        string `json:"hash"`
	Name        string `json:"name"`
	BundleIDs   []int  `json:"bundleIds"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
	ExportMode  string `json:"exportMode"`
	FileIDs     []int  `json:"fileIds"`
	ManifestURL string `json:"manifestUrl"`
}

// DistributionResponse defines the structure of the response when
// getting a distribution.
type DistributionResponse struct {
	Data *Distribution `json:"data"`
}

// DistributionsListResponse defines the structure of the response when
// getting a list of distributions.
type DistributionsListResponse struct {
	Data []*DistributionResponse `json:"data"`
}

// ExportMode is a type representing the export mode of a distribution.
// Can be either `default` or `bundle`.
type ExportMode string

const (
	ExportModeDefault ExportMode = "default"
	ExportModeBundle  ExportMode = "bundle"
)

// DistributionAddRequest defines the structure of the request when
// adding a distribution.
type DistributionAddRequest struct {
	// Distribution name.
	Name string `json:"name"`
	// Export mode.
	// Enum: default, bundle. Default: default.
	ExportMode ExportMode `json:"exportMode,omitempty"`
	// Files ids. Required for `default` export mode.
	FileIDs []int `json:"fileIds,omitempty"`
	// Bundles ids. Required for `bundle` export mode.
	BundleIDs []int `json:"bundleIds,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.Validator interface.
func (r *DistributionAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.ExportMode == ExportModeBundle && len(r.BundleIDs) == 0 {
		return errors.New("bundleIds is required for bundle export mode")
	}
	if r.ExportMode == ExportModeDefault && len(r.FileIDs) == 0 {
		return errors.New("fileIds is required for default export mode")
	}

	return nil
}

// DistributionRelease represents a distribution release.
type DistributionRelease struct {
	Status            string `json:"status"` // inProgress, success, failed
	Progress          int    `json:"progress"`
	CurrentLanguageID string `json:"currentLanguageId"`
	Date              string `json:"date"`
	CurrentFileID     int    `json:"currentFileId"`
}

// DistributionReleaseResponse defines the structure of the response when
// getting a distribution release.
type DistributionReleaseResponse struct {
	Data *DistributionRelease `json:"data"`
}
