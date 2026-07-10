package segmentvalidate

import (
	"reflect"
	"testing"
)

func TestExtractExtraPlaceholdersObjectiveC(t *testing.T) {
	tests := []struct {
		text string
		want []string
	}{
		{
			text: "Hello %@!",
			want: []string{"%@"},
		},
		{
			text: "Hello %s!",
			want: []string{"%s"},
		},
		{
			text: "Value is %d",
			want: []string{"%d"},
		},
		{
			text: "Objective-C object: %@",
			want: []string{"%@"},
		},
		{
			text: "%@ is at the start",
			want: []string{"%@"},
		},
		{
			text: "Double %@ and %@",
			want: []string{"%@", "%@"},
		},
		{
			text: "Mixed %@ and %s",
			want: []string{"%@", "%s"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.text, func(t *testing.T) {
			got := extractExtraPlaceholders(tt.text)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("extractExtraPlaceholders(%q) = %v, want %v", tt.text, got, tt.want)
			}
		})
	}
}
