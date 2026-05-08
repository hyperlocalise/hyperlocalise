package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestTeamsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *TeamsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &TeamsListOptions{},
		},
		{
			name: "all options",
			opts: &TeamsListOptions{
				Search:       "name",
				ProjectIDs:   "11,22",
				ProjectRoles: "manager,developer",
				LanguageIDs:  "en,uk",
				GroupIDs:     "2,4",
				OrderBy:      "createdAt desc,name",
				ListOptions:  ListOptions{Limit: 10, Offset: 5},
			},
			out: "groupIds=2%2C4&languageIds=en%2Cuk&limit=10&offset=5&orderBy=createdAt+desc%2Cname&projectIds=11%2C22&projectRoles=manager%2Cdeveloper&search=name",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, ok := tt.opts.Values()
			if len(tt.out) > 0 {
				assert.True(t, ok)
				assert.Equal(t, tt.out, v.Encode())
			} else {
				assert.False(t, ok)
				assert.Empty(t, v.Encode())
			}
		})
	}
}

func TestTeamAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *TeamAddRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty request",
			req:  &TeamAddRequest{},
			err:  "name is required",
		},
		{
			name:  "valid request",
			req:   &TeamAddRequest{Name: "team"},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestTeamsService_AddMember_requestValidation(t *testing.T) {
	tests := []struct {
		name  string
		req   *TeamMemberAddRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty request",
			req:  &TeamMemberAddRequest{},
			err:  "userIds is required",
		},
		{
			name:  "valid request",
			req:   &TeamMemberAddRequest{UserIDs: []int{1, 2}},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestProjectTeamAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ProjectTeamAddRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name: "empty request",
			req:  &ProjectTeamAddRequest{},
			err:  "teamId is required",
		},
		{
			name: "valid request",
			req: &ProjectTeamAddRequest{TeamID: 1, ManagerAccess: toPtr(true), DeveloperAccess: toPtr(true),
				Roles: []*TranslatorRole{{Name: RoleTranslator, Permissions: &RolePermissions{AllLanguages: toPtr(true)}}}},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}
