package model

import (
	"fmt"
	"net/url"
)

// ListOptions specifies the optional parameters to methods that support pagination.
type ListOptions struct {
	// A maximum number of items to retrieve (default 25, max 500).
	Limit int `json:"limit,omitempty"`

	// A starting offset in the collection of items (default 0).
	Offset int `json:"offset,omitempty"`
}

// Values is used to encode the query parameters into the URL query string.
// It implements the crowdin.ListOptionsProvider interface.
func (o *ListOptions) Values() (url.Values, bool) {
	v := url.Values{}
	if o == nil {
		return v, false
	}

	if o.Limit > 0 {
		v.Add("limit", fmt.Sprintf("%d", o.Limit))
	}
	if o.Offset > 0 {
		v.Add("offset", fmt.Sprintf("%d", o.Offset))
	}

	return v, len(v) > 0
}

// Pagination represents the pagination information.
type Pagination struct {
	Offset int `json:"offset,omitempty"`
	Limit  int `json:"limit,omitempty"`
}

// PaginationResponse is the pagination response structure from the API.
type PaginationResponse struct {
	Pagination Pagination `json:"pagination"`
}
