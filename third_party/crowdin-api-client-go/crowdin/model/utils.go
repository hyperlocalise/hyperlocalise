package model

import (
	"fmt"
	"strconv"
	"strings"
)

// JoinSlice is a helper function that joins the elements
// of the slice into a single comma-separated string.
func JoinSlice[T any](s []T) string {
	if len(s) == 0 {
		return ""
	}

	// Optimization: switch on the slice type to avoid per-element
	// interface conversion and type switching.
	switch val := any(s).(type) {
	case []int:
		var b strings.Builder
		for i, v := range val {
			if i > 0 {
				b.WriteByte(',')
			}
			b.WriteString(strconv.Itoa(v))
		}
		return b.String()

	case []string:
		return strings.Join(val, ",")
	}

	var b strings.Builder
	for i, v := range s {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%v", v)
	}

	return b.String()
}

// Helper used in model tests.
func toPtr[T any](v T) *T {
	return &v
}
