package model

import (
	"fmt"
	"strings"
)

// JoinSlice is a helper function that joins the elements
// of the slice into a single comma-separated string.
func JoinSlice[T any](s []T) string {
	res := make([]string, len(s))
	for i, v := range s {
		res[i] = fmt.Sprintf("%v", v)
	}

	return strings.Join(res, ",")
}

// Helper used in model tests.
func toPtr[T any](v T) *T {
	return &v
}
