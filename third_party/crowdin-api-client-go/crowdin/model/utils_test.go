package model

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestJoinSlice(t *testing.T) {
	type customType string
	const (
		customTypeX customType = "x"
		customTypeY customType = "y"
		customTypeZ customType = "z"
	)

	tests := []struct {
		name  string
		slice []any
		want  string
	}{
		{
			name:  "int slice",
			slice: []any{1, 2, 3},
			want:  "1,2,3",
		},
		{
			name:  "string slice",
			slice: []any{"a", "b", "c"},
			want:  "a,b,c",
		},
		{
			name:  "custom type slice",
			slice: []any{customTypeX, customTypeY, customTypeZ},
			want:  "x,y,z",
		},
		{
			name:  "bool slice",
			slice: []any{true, false, true},
			want:  "true,false,true",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, JoinSlice(tt.slice))
		})
	}
}
