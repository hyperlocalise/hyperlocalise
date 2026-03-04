package cmd

import "testing"

func TestParseSHA256Digest(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		in := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
		got, err := parseSHA256Hex(in)
		if err != nil {
			t.Fatalf("parseSHA256Hex returned error: %v", err)
		}
		if got != "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef" {
			t.Fatalf("unexpected digest: %q", got)
		}
	})

	t.Run("invalid length", func(t *testing.T) {
		if _, err := parseSHA256Hex("abcd"); err == nil {
			t.Fatalf("expected error for invalid length")
		}
	})
}

func TestChecksumForAsset(t *testing.T) {
	t.Run("find checksum with double-space format", func(t *testing.T) {
		checksums := []byte("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  install.sh\n")
		got, err := checksumForAsset(checksums, "install.sh")
		if err != nil {
			t.Fatalf("checksumForAsset returned error: %v", err)
		}
		if want := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; got != want {
			t.Fatalf("unexpected checksum: got %q want %q", got, want)
		}
	})

	t.Run("find checksum with star format", func(t *testing.T) {
		checksums := []byte("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb *install.sh\n")
		got, err := checksumForAsset(checksums, "install.sh")
		if err != nil {
			t.Fatalf("checksumForAsset returned error: %v", err)
		}
		if want := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"; got != want {
			t.Fatalf("unexpected checksum: got %q want %q", got, want)
		}
	})

	t.Run("missing asset checksum", func(t *testing.T) {
		checksums := []byte("cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc  other.sh\n")
		if _, err := checksumForAsset(checksums, "install.sh"); err == nil {
			t.Fatalf("expected missing checksum error")
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
