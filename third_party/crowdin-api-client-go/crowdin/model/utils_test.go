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
		slice any
		want  string
	}{
		{
			name:  "int slice",
			slice: []int{1, 2, 3},
			want:  "1,2,3",
		},
		{
			name:  "string slice",
			slice: []string{"a", "b", "c"},
			want:  "a,b,c",
		},
		{
			name:  "custom type slice",
			slice: []customType{customTypeX, customTypeY, customTypeZ},
			want:  "x,y,z",
		},
		{
			name:  "bool slice",
			slice: []bool{true, false, true},
			want:  "true,false,true",
		},
		{
			name:  "TaskStatus slice",
			slice: []TaskStatus{TaskStatusTodo, TaskStatusInProgress, TaskStatusDone},
			want:  "todo,in_progress,done",
		},
		{
			name:  "TaskType slice",
			slice: []TaskType{TaskTypeTranslate, TaskTypeProofread},
			want:  "0,1",
		},
		{
			name:  "empty slice",
			slice: []int{},
			want:  "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			switch s := tt.slice.(type) {
			case []int:
				assert.Equal(t, tt.want, JoinSlice(s))
			case []string:
				assert.Equal(t, tt.want, JoinSlice(s))
			case []customType:
				assert.Equal(t, tt.want, JoinSlice(s))
			case []bool:
				assert.Equal(t, tt.want, JoinSlice(s))
			case []TaskStatus:
				assert.Equal(t, tt.want, JoinSlice(s))
			case []TaskType:
				assert.Equal(t, tt.want, JoinSlice(s))
			}
		})
	}
}
