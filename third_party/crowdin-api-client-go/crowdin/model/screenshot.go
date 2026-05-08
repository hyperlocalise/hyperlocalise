package model

import (
	"errors"
	"fmt"
	"net/url"
)

// Screenshot represents a screenshot, which provides translators
// with additional context for the source strings.
type Screenshot struct {
	ID     int    `json:"id"`
	UserID int    `json:"userId"`
	WebURL string `json:"webUrl"`
	Name   string `json:"name"`
	Size   struct {
		Width  int `json:"width"`
		Height int `json:"height"`
	} `json:"size"`
	TagsCount int    `json:"tagsCount"`
	Tags      []*Tag `json:"tags"`
	LabelIDs  []int  `json:"labelIds"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

// ScreenshotResponse defines the structure of a response
// to get a screenshot.
type ScreenshotResponse struct {
	Data *Screenshot `json:"data"`
}

// ScreenshotListResponse defines the structure of a response
// to list screenshots.
type ScreenshotListResponse struct {
	Data []*ScreenshotResponse `json:"data"`
}

// Tag represents a tag on a screenshot.
type Tag struct {
	ID           int          `json:"id"`
	ScreenshotID int          `json:"screenshotId"`
	StringID     int          `json:"stringId"`
	Position     *TagPosition `json:"position"`
	CreatedAt    string       `json:"createdAt"`
}

// TagPosition represents the position of a tag on a screenshot.
type TagPosition struct {
	X      *int `json:"x,omitempty"`
	Y      *int `json:"y,omitempty"`
	Width  *int `json:"width,omitempty"`
	Height *int `json:"height,omitempty"`
}

// TagResponse defines the structure of a response to get a tag.
type TagResponse struct {
	Data *Tag `json:"data"`
}

// TagListResponse defines the structure of a response to list tags.
type TagListResponse struct {
	Data []*TagResponse `json:"data"`
}

// ScreenshotListOptions specifies the optional parameters
// to the ScreenshotsService.ListScreenshots method.
type ScreenshotListOptions struct {
	// Sort screenshots by specified field.
	// Enum: id, name, tagsCount, createdAt, updatedAt. Default: id.
	// Example: orderBy=createdAt desc,name,tagsCount
	OrderBy string `json:"orderBy,omitempty"`
	// String Identifier.
	StringID int `json:"stringId,omitempty"` // Deprecated. Use StringIDs instead.
	// String Identifiers.
	// Example: stringIds=1,2,3,4,5
	// Note: Cannot be used with stringId in the same request.
	StringIDs []string `json:"stringIds,omitempty"`
	// Label Identifiers.
	// Example: labelIds=1,2,3
	LabelIDs []string `json:"labelIds,omitempty"`
	// Label Identifiers to exclude.
	// Example: excludeLabelIds=1,2,3
	ExcludeLabelIDs []string `json:"excludeLabelIds,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of the list options.
// It implements the crowdin.ListOptionsProvider interface.
func (o *ScreenshotListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()

	if len(o.OrderBy) > 0 {
		v.Add("orderBy", o.OrderBy)
	}
	if o.StringID > 0 { // TODO: StringID is deprecated
		v.Add("stringId", fmt.Sprintf("%d", o.StringID))
	}
	if len(o.StringIDs) > 0 {
		v.Add("stringIds", JoinSlice(o.StringIDs))
	}
	if len(o.LabelIDs) > 0 {
		v.Add("labelIds", JoinSlice(o.LabelIDs))
	}
	if len(o.ExcludeLabelIDs) > 0 {
		v.Add("excludeLabelIds", JoinSlice(o.ExcludeLabelIDs))
	}

	return v, len(v) > 0
}

func (o *ScreenshotListOptions) Validate() error {
	if o.StringID > 0 && len(o.StringIDs) > 0 {
		return errors.New("stringId and stringIds cannot be used in the same request")
	}

	return nil
}

// ScreenshotAddRequest defines the structure of a request
// to add a screenshot.
type ScreenshotAddRequest struct {
	// Storage Identifier. Storage file must be image in one of the
	// following formats: jpeg, jpg, png, gif
	StorageID int `json:"storageId"`
	// Screenshot name.
	Name string `json:"name"`
	// Automatically tags screenshot.
	AutoTag *bool `json:"autoTag,omitempty"`
	// File Identifier.
	// Note: Must be used together with `autoTag`. Can't be used
	// with `directoryId` or `branchId` in same request.
	FileID int `json:"fileId,omitempty"`
	// Branch identifier.
	// Note: Must be used together with `autoTag`. Can't be used
	// with `fileId` or `directoryId` in the same request.
	BranchID int `json:"branchId,omitempty"`
	// Directory Identifier.
	// Note: Must be used together with `autoTag`. Can't be used
	// with `fileId` or `branchId` in same request.
	DirectoryID int `json:"directoryId,omitempty"`
	// Label Identifiers.
	LabelIDs []int `json:"labelIds,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ScreenshotAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.StorageID <= 0 {
		return errors.New("storageId is required")
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	if r.FileID > 0 && (r.BranchID > 0 || r.DirectoryID > 0) {
		return errors.New("must use either branchId, fileId, or directoryId")
	}
	if r.BranchID > 0 && (r.FileID > 0 || r.DirectoryID > 0) {
		return errors.New("must use either branchId, fileId, or directoryId")
	}

	return nil
}

// ScreenshotUpdateRequest defines the structure of a request
// to update a screenshot.
type ScreenshotUpdateRequest struct {
	// Storage Identifier.
	StorageID int `json:"storageId"`
	// Screenshot name.
	Name string `json:"name"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ScreenshotUpdateRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.StorageID <= 0 {
		return errors.New("storageId is required")
	}
	if r.Name == "" {
		return errors.New("name is required")
	}

	return nil
}

// TagAddRequest defines the structure of a request to add a tag.
type TagAddRequest struct {
	// String Identifier.
	StringID int `json:"stringId"`
	// Tag position.
	Position *TagPosition `json:"position,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *TagAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.StringID <= 0 {
		return errors.New("stringId is required")
	}

	return nil
}

// ReplaceTagsRequest defines the structure of a request to
// replace tags.
type ReplaceTagsRequest struct {
	// String Identifier.
	StringID int `json:"stringId"`
	// Tag position.
	Position *TagPosition `json:"position,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *ReplaceTagsRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.StringID <= 0 {
		return errors.New("stringId is required")
	}

	return nil
}

// AutoTagRequest defines the structure of a request to
// automatically tag a screenshot.
type AutoTagRequest struct {
	// Automatically tags screenshot and replaces old tags with new ones.
	AutoTag *bool `json:"autoTag"`
	// File Identifier. Note: Can't be used with `directoryId` or `branchId`
	// in same request.
	FileID int `json:"fileId,omitempty"`
	// Branch identifier. Note: Can't be used with `fileId` or `directoryId`
	// in the same request.
	BranchID int `json:"branchId,omitempty"`
	// Directory Identifier. Note: Can't be used with `fileId` or `branchId`
	// in same request.
	DirectoryID int `json:"directoryId,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *AutoTagRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.AutoTag == nil {
		return errors.New("autoTag is required")
	}
	if r.FileID > 0 && (r.BranchID > 0 || r.DirectoryID > 0) {
		return errors.New("must use either branchId, fileId, or directoryId")
	}
	if r.BranchID > 0 && (r.FileID > 0 || r.DirectoryID > 0) {
		return errors.New("must use either branchId, fileId, or directoryId")
	}

	return nil
}
