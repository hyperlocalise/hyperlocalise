package icuparser

import (
	"reflect"
	"testing"
)

func TestParseInvariantIncludesTypedBlockOptions(t *testing.T) {
	tests := []struct {
		name string
		msg  string
		want []BlockSignature
	}{
		{
			name: "number with style",
			msg:  "{n, number, currency}",
			want: []BlockSignature{
				{Arg: "n", Type: "number", Options: []string{"currency"}},
			},
		},
		{
			name: "date with style",
			msg:  "{d, date, short}",
			want: []BlockSignature{
				{Arg: "d", Type: "date", Options: []string{"short"}},
			},
		},
		{
			name: "time with style",
			msg:  "{t, time, ::Hmm}",
			want: []BlockSignature{
				{Arg: "t", Type: "time", Options: []string{"::Hmm"}},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inv, err := ParseInvariant(tt.msg)
			if err != nil {
				t.Fatalf("ParseInvariant failed: %v", err)
			}
			if !reflect.DeepEqual(inv.ICUBlocks, tt.want) {
				t.Errorf("ICUBlocks mismatch\n got: %s\nwant: %s", FormatICUBlocks(inv.ICUBlocks), FormatICUBlocks(tt.want))
			}
		})
	}
}
