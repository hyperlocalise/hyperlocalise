package cmd

import "testing"

func TestParseSHA256Digest(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		in := "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
		got, err := parseSHA256Digest(in)
		if err != nil {
			t.Fatalf("parseSHA256Digest returned error: %v", err)
		}
		if got != "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" {
			t.Fatalf("unexpected digest: %q", got)
		}
	})

	t.Run("invalid prefix", func(t *testing.T) {
		if _, err := parseSHA256Digest("md5:abc"); err == nil {
			t.Fatalf("expected error for unsupported prefix")
		}
	})

	t.Run("invalid length", func(t *testing.T) {
		if _, err := parseSHA256Digest("sha256:abcd"); err == nil {
			t.Fatalf("expected error for invalid length")
		}
	})
}

func TestNormalizeTag(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{name: "empty", in: "", want: ""},
		{name: "already prefixed", in: "v1.2.3", want: "v1.2.3"},
		{name: "unprefixed", in: "1.2.3", want: "v1.2.3"},
		{name: "trimmed", in: " 1.2.3 ", want: "v1.2.3"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := normalizeTag(tc.in)
			if got != tc.want {
				t.Fatalf("normalizeTag(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}
