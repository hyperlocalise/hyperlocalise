package main

import "testing"

func TestResolveConfigPath(t *testing.T) {
	got, err := resolveConfigPath("apps/web", "i18n.yml")
	if err != nil {
		t.Fatalf("resolve config path: %v", err)
	}
	if got != "apps/web/i18n.yml" {
		t.Fatalf("resolveConfigPath() = %q, want apps/web/i18n.yml", got)
	}

	got, err = resolveConfigPath(".", "/tmp/i18n.yml")
	if err != nil {
		t.Fatalf("resolve absolute config path: %v", err)
	}
	if got != "/tmp/i18n.yml" {
		t.Fatalf("resolveConfigPath() = %q, want /tmp/i18n.yml", got)
	}
}
