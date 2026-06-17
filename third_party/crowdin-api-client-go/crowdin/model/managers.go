package model

import (
	"net/url"
)

// Manager represents a manager in the organization.
type Manager struct {
	ID    int    `json:"id"`
	User  User   `json:"user"`
	Teams []Team `json:"teams"`
}

// ManagerGetResponse defines the structure of the response when
// getting a group manager.
type ManagerGetResponse struct {
	Data *Manager `json:"data"`
}

// ManagerResponse defines the structure of the response when
// getting a list of group managers.
type ManagerResponse struct {
	Data       []*ManagerGetResponse `json:"data"`
	Pagination *Pagination           `json:"pagination"`
}

// ManagerListOptions specifies the optional parameters to the
// GroupManagersService.List method.
type ManagerListOptions struct {
	TeamIDs []int `json:"teamIds,omitempty"`

	OrderBy string `json:"orderBy,omitempty"`
}

// Values returns the url.Values representation of the ManagerListOptions.
// It implements the crowdin.ListOptionsProvider interface.
func (o *ManagerListOptions) Values() (url.Values, bool) {
	if o == nil {
		return nil, false
	}

	v := url.Values{}
	if len(o.TeamIDs) > 0 {
		v.Add("teamIds", JoinSlice(o.TeamIDs))
	}

	if o.OrderBy != "" {
		v.Add("orderBy", o.OrderBy)
	}

	return v, len(v) > 0
}
