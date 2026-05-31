package csvsafe

import "testing"

func TestEscapeFormula(t *testing.T) {
	tests := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"hello", "hello"},
		{"=1+1", "'=1+1"},
		{"+cmd", "'+cmd"},
		{"-sum", "'-sum"},
		{"@evil", "'@evil"},
		{"\tlead", "'\tlead"},
		{"\rlead", "'\rlead"},
		{" space", " space"},
		{"=", "'="},
	}
	for _, tt := range tests {
		if got := EscapeFormula(tt.in); got != tt.want {
			t.Fatalf("EscapeFormula(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestEscapeRow(t *testing.T) {
	got := EscapeRow([]string{"ok", "=bad"})
	want := []string{"ok", "'=bad"}
	if len(got) != len(want) {
		t.Fatalf("EscapeRow len = %d, want %d", len(got), len(want))
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("EscapeRow[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}
