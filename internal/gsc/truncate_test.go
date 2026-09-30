package gsc

import (
	"strings"
	"testing"
)

func TestTruncate(t *testing.T) {
	if got := truncate("  hi  ", 10); got != "hi" {
		t.Fatalf("short = %q", got)
	}
	long := strings.Repeat("a", 8)
	if got := truncate("  "+long, 4); got != "aaaa..." {
		t.Fatalf("long = %q", got)
	}
}
