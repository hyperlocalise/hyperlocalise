package model

import (
	"errors"
	"fmt"
)

// PatchOp defines the type of operation to perform.
type PatchOp string

const (
	OpAdd     PatchOp = "add"
	OpReplace PatchOp = "replace"
	OpRemove  PatchOp = "remove"
	OpTest    PatchOp = "test"
)

// UpdateRequest defines the structure of a request to update a resource.
type UpdateRequest struct {
	// Patch operation to perform.
	Op PatchOp `json:"op"`
	// A JSON Pointer as defined by RFC 6901.
	Path string `json:"path"`
	// Value must be one of boolean, integer, string, array of strings,
	// array of integers or map.
	Value any `json:"value,omitempty"`
}

// Validate checks if the update request is valid.
// It implements the crowdin.RequestValidator interface.
func (r *UpdateRequest) Validate() error {
	if r == nil {
		return ErrNilRequest
	}

	switch r.Op {
	case OpAdd, OpReplace, OpRemove, OpTest: // valid
	default:
		return fmt.Errorf("invalid op: %q, must be one of %s, %s, %s, %s",
			r.Op, OpAdd, OpReplace, OpRemove, OpTest)
	}

	if r.Path == "" {
		return errors.New("path is required")
	}
	if r.Value == nil && r.Op != OpRemove {
		return errors.New("value is required")
	}
	return nil
}
