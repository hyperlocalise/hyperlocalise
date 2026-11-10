package main

import "testing"

func TestParseLiveProjectID(t *testing.T) {
	t.Parallel()
	got, ok := parseLiveProjectID("ext:crowdin:123")
	if !ok || got.providerKind != "crowdin" || got.externalProjectID != "123" {
		t.Fatalf("parseLiveProjectID = %+v, %v", got, ok)
	}
	if got, ok := parseLiveProjectID("ext:smartling:a:b"); !ok || got.externalProjectID != "a:b" {
		t.Fatalf("ids may hold colons: %+v, %v", got, ok)
	}
	for _, raw := range []string{"proj_1", "ext:unknown:1", "ext:crowdin:", "ext:crowdin"} {
		if _, ok := parseLiveProjectID(raw); ok {
			t.Errorf("parseLiveProjectID(%q) ok, want not live", raw)
		}
	}
}
