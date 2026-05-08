package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestProjectMembersListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *ProjectMembersListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &ProjectMembersListOptions{},
		},
		{
			name: "with all options",
			opts: &ProjectMembersListOptions{OrderBy: "createdAt desc,name,priority", Search: "test", Role: "all",
				LanguageID: "en", WorkflowStepID: 1, ListOptions: ListOptions{Offset: 1, Limit: 10}},
			out: "languageId=en&limit=10&offset=1&orderBy=createdAt+desc%2Cname%2Cpriority&role=all&search=test&workflowStepId=1",
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
				assert.Empty(t, v)
			}
		})
	}
}

func TestProjectMemberAddRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ProjectMemberAddRequest
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
			req:  &ProjectMemberAddRequest{},
			err:  "one of fields `userIds`, `usernames` or `emails` is required",
		},
		{
			name: "missing required fields",
			req:  &ProjectMemberAddRequest{ManagerAccess: toPtr(true)},
			err:  "one of fields `userIds`, `usernames` or `emails` is required",
		},
		{
			name: "valid request",
			req: &ProjectMemberAddRequest{UserIDs: []int{1}, Usernames: []string{"test"}, Emails: []string{"test@example.com"},
				ManagerAccess: toPtr(true), DeveloperAccess: toPtr(true), Roles: []*TranslatorRole{{Name: RoleTranslator}}},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.err, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestProjectMemberReplaceRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *ProjectMemberReplaceRequest
		err   string
		valid bool
	}{
		{
			name: "nil request",
			req:  nil,
			err:  "request cannot be nil",
		},
		{
			name:  "empty request",
			req:   &ProjectMemberReplaceRequest{},
			valid: true,
		},
		{
			name: "valid request",
			req: &ProjectMemberReplaceRequest{ManagerAccess: toPtr(true), DeveloperAccess: toPtr(true),
				Roles: []*TranslatorRole{{Name: RoleTranslator, Permissions: &RolePermissions{AllLanguages: toPtr(true)}}}},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.err, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestUsersListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *UsersListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &UsersListOptions{},
		},
		{
			name: "with all options",
			opts: &UsersListOptions{OrderBy: "createdAt desc,name,priority", Status: "active", Search: "test",
				TwoFactor: "enabled", OrganizationRoles: "manager,client", TeamID: 4, ProjectIDs: "4, 5",
				ProjectRoles: "manager,developer", LanguageIDs: "en,uk", GroupIDs: "2,3",
				LastSeenFrom: "2024-01-10T10:41:33+00:00", LastSeenTo: "2024-01-10T10:41:33+00:00",
				ListOptions: ListOptions{Offset: 1, Limit: 10}},
			out: "groupIds=2%2C3&languageIds=en%2Cuk&lastSeenFrom=2024-01-10T10%3A41%3A33%2B00%3A00&lastSeenTo=2024-01-10T10%3A41%3A33%2B00%3A00&limit=10&offset=1&orderBy=createdAt+desc%2Cname%2Cpriority&organizationRoles=manager%2Cclient&projectIds=4%2C+5&projectRoles=manager%2Cdeveloper&search=test&status=active&teamId=4&twoFactor=enabled",
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
				assert.Empty(t, v)
			}
		})
	}
}

func TestInviteUserRequestValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *InviteUserRequest
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
			req:  &InviteUserRequest{},
			err:  "email is required",
		},
		{
			name: "missing email",
			req:  &InviteUserRequest{FirstName: "Test", LastName: "User"},
			err:  "email is required",
		},
		{
			name: "valid request",
			req: &InviteUserRequest{Email: "test@example.com", FirstName: "Test", LastName: "User", Timezone: "UTC",
				AdminAccess: toPtr(true)},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.err, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}

func TestLanguagesAccessUnmarshalJSON(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		expected LanguagesAccess
		err      string
	}{
		{
			name: "invalid data",
			data: []byte(`"invalid json"`),
			err:  "json: cannot unmarshal string into Go value of type map[string]*model.LanguageAccess",
		},
		{
			name: "valid data",
			data: []byte(`{"en":{"allContent":true,"workflowStepIds":[882]}}`),
			expected: map[string]*LanguageAccess{
				"en": {
					AllContent:      toPtr(true),
					WorkflowStepIDs: []int{882},
				},
			},
		},
		{
			name:     "valid data with empty array",
			data:     []byte(`[]`),
			expected: LanguagesAccess{},
		},
		{
			name:     "valid data with empty object",
			data:     []byte(`{}`),
			expected: LanguagesAccess{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var actual LanguagesAccess
			err := actual.UnmarshalJSON(tt.data)

			if len(tt.err) > 0 {
				assert.EqualError(t, err, tt.err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, actual)
			}
		})
	}
}

func TestUserIDUnmarshalJSON(t *testing.T) {
	tests := []struct {
		name     string
		data     []byte
		expected UserID
		err      string
	}{
		{
			name: "invalid data",
			data: []byte(`"invalid json"`),
			err:  "invalid userId value: invalid json",
		},
		{
			name: "invalid data",
			data: []byte(`[]`),
			err:  "invalid userId value: []",
		},
		{
			name:     "valid data (int)",
			data:     []byte(`1`),
			expected: 1,
		},
		{
			name:     "valid data (string num)",
			data:     []byte(`"2"`),
			expected: 2,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var actual UserID
			err := actual.UnmarshalJSON(tt.data)

			if len(tt.err) > 0 {
				assert.EqualError(t, err, tt.err)
				assert.Equal(t, tt.expected, actual)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expected, actual)
			}
		})
	}
}
