package model

import (
	"errors"
	"fmt"
	"net/url"
)

// Group represents a Crowdin group.
type Group struct {
	ID             int    `json:"id"`
	Name           string `json:"name"`
	Description    string `json:"description"`
	ParentID       int    `json:"parentId"`
	OrganizationID int    `json:"organizationId"`
	UserID         int    `json:"userId"`
	SubgroupsCount int    `json:"subgroupsCount"`
	ProjectsCount  int    `json:"projectsCount"`
	WebURL         string `json:"webUrl"`
	CreatedAt      string `json:"createdAt"`
	UpdatedAt      string `json:"updatedAt"`
}

// GroupsListOptions specifies the optional parameters to the GroupsService.List method.
type GroupsListOptions struct {
	ListOptions

	ParentID int `json:"parentId,omitempty"`
}

// Values returns the url.Values representation of the GroupsListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *GroupsListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v, _ := o.ListOptions.Values()
	if o.ParentID > 0 {
		v.Add("parentId", fmt.Sprintf("%d", o.ParentID))
	}

	return v, len(v) > 0
}

// GroupsGetResponse defines the structure of a response when retrieving a group.
type GroupsGetResponse struct {
	Data *Group `json:"data"`
}

// GroupsListResponse defines the structure of a response when getting a list of groups.
type GroupsListResponse struct {
	Data       []*GroupsGetResponse `json:"data"`
	Pagination *Pagination          `json:"pagination"`
}

// GroupsAddRequest defines the structure of a request to add a group.
type GroupsAddRequest struct {
	// Group Name (required).
	Name string `json:"name"`
	// Parent Group Identifier.
	ParentID int `json:"parentId,omitempty"`
	// Group description.
	Description string `json:"description,omitempty"`
}

// Validate checks if the add request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *GroupsAddRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if r.Name == "" {
		return errors.New("name is required")
	}
	return nil
}
