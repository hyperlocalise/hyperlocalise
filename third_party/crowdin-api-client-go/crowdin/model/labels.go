package model

import (
	"errors"
	"net/url"
)

// Label represents a Crowdin label.
type Label struct {
	ID    int    `json:"id"`
	Title string `json:"title"`
}

// LabelResponse defines the structure of a response when
// getting a label.
type LabelResponse struct {
	Data *Label `json:"data"`
}

// LabelsListResponse defines the structure of a response when
// getting a list of labels.
type LabelsListResponse struct {
	Data []*LabelResponse `json:"data"`
}

// LabelsListOptions specifies the optional parameters to the
// LabelsService.List method.
type LabelsListOptions struct {
	// Sort labels by the specified field. Enum: id, title. Default: id.
	// Example: orderBy=title desc,id
	OrderBy string `json:"orderBy,omitempty"`

	ListOptions
}

// Values returns the url.Values representation of LabelsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *LabelsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}

	return v, len(v) > 0
}

// LabelAddRequest defines the structure of a request to add a label.
type LabelAddRequest struct {
	// Label title.
	Title string `json:"title"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *LabelAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Title == "" {
		return errors.New("title is required")
	}

	return nil
}

// AssignToStringsRequest defines the structure of a request
// to assign label to strings.
type AssignToStringsRequest struct {
	// String identifiers.
	// Note: You can assign up to 500 strings at a time.
	StringIDs []int `json:"stringIds"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *AssignToStringsRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if len(r.StringIDs) == 0 {
		return errors.New("stringIds cannot be empty")
	}

	return nil
}

// AssignToScreenshotsRequest defines the structure of a request
// to assign label to screenshots.
type AssignToScreenshotsRequest struct {
	// Screenshot identifiers.
	// Note: You can assign up to 500 screenshots at a time.
	ScreenshotIDs []int `json:"screenshotIds"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *AssignToScreenshotsRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if len(r.ScreenshotIDs) == 0 {
		return errors.New("screenshotIds cannot be empty")
	}

	return nil
}
