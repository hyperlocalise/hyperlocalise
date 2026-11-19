package nativeproject

import "testing"

func TestValidBranchName(t *testing.T) {
	t.Parallel()
	for _, name := range []string{"main", "feature-checkout", "release/ios", "a", "a.b_c"} {
		if !ValidBranchName(name) {
			t.Fatalf("expected %q to be valid", name)
		}
	}
	for _, name := range []string{"", "-main", "main-", "a//b", ".hidden", "has space", stringsRepeat()} {
		if ValidBranchName(name) {
			t.Fatalf("expected %q to be invalid", name)
		}
	}
	if got := NormalizeBranchName("  /feature/ios/ "); got != "feature/ios" {
		t.Fatalf("NormalizeBranchName = %q", got)
	}
}

func stringsRepeat() string {
	return "a" + string(make([]byte, branchNameMax))
}

func TestResolveBranchName(t *testing.T) {
	t.Parallel()

	cases := []struct {
		in, want string
	}{
		{"", DefaultBranchName},
		{"  ", DefaultBranchName},
		{"main", "main"},
		{" feature/ios ", "feature/ios"},
	}
	for _, tc := range cases {
		if got := ResolveBranchName(tc.in); got != tc.want {
			t.Fatalf("ResolveBranchName(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}
}
