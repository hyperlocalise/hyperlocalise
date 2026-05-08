package model

import (
	"errors"
)

// Notification represents a notification request.
// It can be used to send a notification to an authenticated user,
// organization members, or project members.
type Notification struct {
	// Message text. Up to 10000 characters.
	Message string `json:"message,omitempty"`

	// User identifiers.
	UserIDs []int `json:"userIds,omitempty"`

	// Enum: owner, manager.
	Role string `json:"role,omitempty"`
}

// Validate checks if the request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *Notification) Validate() error {
	if r == nil {
		return ErrNilRequest
	}
	if len(r.Message) > 10000 {
		return errors.New("message can't be longer than 10000 characters")
	}
	if len(r.UserIDs) > 0 && r.Role != "" {
		return errors.New("can't specify both user IDs and role")
	}
	if r.Role != "" && r.Role != "owner" && r.Role != "manager" {
		return errors.New("role must be either owner or manager")
	}

	return nil
}
