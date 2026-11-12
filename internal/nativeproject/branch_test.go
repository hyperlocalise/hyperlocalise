package nativeproject

import "testing"

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
