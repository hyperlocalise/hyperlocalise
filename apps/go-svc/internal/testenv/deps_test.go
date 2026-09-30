package testenv

import "testing"

func TestMissingDeps(t *testing.T) {
	t.Setenv(EnvDatabaseURL, "")
	t.Setenv(EnvValkeyURL, "")
	if got := missingDeps(); len(got) != 2 || got[0] != EnvDatabaseURL || got[1] != EnvValkeyURL {
		t.Fatalf("missing = %v", got)
	}
	t.Setenv(EnvDatabaseURL, "postgres://local/db")
	if got := missingDeps(); len(got) != 1 || got[0] != EnvValkeyURL {
		t.Fatalf("missing = %v", got)
	}
	t.Setenv(EnvValkeyURL, "redis://local")
	if got := missingDeps(); len(got) != 0 {
		t.Fatalf("missing = %v", got)
	}
}

func TestRequireReturnsWhenDependenciesPresent(t *testing.T) {
	t.Setenv(EnvDatabaseURL, "postgres://local/db")
	t.Setenv(EnvValkeyURL, "redis://local")
	t.Setenv(EnvIntegration, "")
	Require(t)
}

func TestRequireSkipsWhenDependenciesMissing(t *testing.T) {
	t.Setenv(EnvDatabaseURL, "")
	t.Setenv(EnvValkeyURL, "")
	t.Setenv(EnvIntegration, "")
	Require(t)
	t.Fatal("expected skip")
}
