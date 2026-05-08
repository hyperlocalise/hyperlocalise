package model

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNotificationValidate(t *testing.T) {
	tests := []struct {
		name  string
		req   *Notification
		err   string
		valid bool
	}{
		{
			name: "nil request",
			err:  "request cannot be nil",
		},
		{
			name: "message too long",
			req: &Notification{
				Message: strings.Repeat("a", 10001),
			},
			err: "message can't be longer than 10000 characters",
		},
		{
			name: "both user IDs and role",
			req: &Notification{
				UserIDs: []int{1, 2, 3},
				Role:    "owner",
				Message: "notification message",
			},
			err: "can't specify both user IDs and role",
		},
		{
			name: "invalid role",
			req: &Notification{
				Role:    "invalid",
				Message: "notification message",
			},
			err: "role must be either owner or manager",
		},
		{
			name:  "valid request (message only)",
			req:   &Notification{Message: "notification message"},
			valid: true,
		},
		{
			name: "valid request (with role)",
			req: &Notification{
				Role:    "owner",
				Message: "notification message",
			},
			valid: true,
		},
		{
			name: "valid request (with user IDs)",
			req: &Notification{
				UserIDs: []int{1, 2, 3},
				Message: "notification message",
			},
			valid: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tt.req.Validate(); tt.valid {
				assert.NoError(t, err)
			} else {
				require.Error(t, err)
				assert.EqualError(t, err, tt.err)
			}
		})
	}
}
