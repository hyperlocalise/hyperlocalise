package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSecurityLogsListOptionsValues(t *testing.T) {
	tests := []struct {
		name string
		opts *SecurityLogsListOptions
		out  string
	}{
		{
			name: "nil options",
			opts: nil,
		},
		{
			name: "empty options",
			opts: &SecurityLogsListOptions{},
		},
		{
			name: "with pagination",
			opts: &SecurityLogsListOptions{ListOptions: ListOptions{Offset: 5, Limit: 10}},
			out:  "limit=10&offset=5",
		},
		{
			name: "with event",
			opts: &SecurityLogsListOptions{Event: Login},
			out:  "event=login",
		},
		{
			name: "with created after",
			opts: &SecurityLogsListOptions{CreatedAfter: "2021-01-01T00:00:00Z"},
			out:  "createdAfter=2021-01-01T00%3A00%3A00Z",
		},
		{
			name: "with created before",
			opts: &SecurityLogsListOptions{CreatedBefore: "2021-01-01T00:00:00Z"},
			out:  "createdBefore=2021-01-01T00%3A00%3A00Z",
		},
		{
			name: "with ip address",
			opts: &SecurityLogsListOptions{IPAddress: "127.0.0.1"},
			out:  "ipAddress=127.0.0.1",
		},
		{
			name: "with user id",
			opts: &SecurityLogsListOptions{UserID: 1},
			out:  "userId=1",
		},
		{
			name: "with all options",
			opts: &SecurityLogsListOptions{
				Event:         PasswordChange,
				CreatedAfter:  "2021-01-01T00:00:00Z",
				CreatedBefore: "2021-01-01T00:00:00Z",
				IPAddress:     "127.0.0.1",
				UserID:        1,
				ListOptions:   ListOptions{Offset: 5, Limit: 10},
			},
			out: "createdAfter=2021-01-01T00%3A00%3A00Z&createdBefore=2021-01-01T00%3A00%3A00Z&event=password.change&ipAddress=127.0.0.1&limit=10&offset=5&userId=1",
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
