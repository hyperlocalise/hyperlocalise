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

	var b strings.Builder
	for i, v := range s {
		if i > 0 {
			b.WriteByte(',')
		}

		switch val := any(v).(type) {
		case int:
			b.WriteString(strconv.Itoa(val))
		case string:
			b.WriteString(val)
		default:
			fmt.Fprintf(&b, "%v", val)
		}
	}

	return b.String()
}

// Helper used in model tests.
func toPtr[T any](v T) *T {
	return &v
}
