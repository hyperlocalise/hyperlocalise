package memoryinterchange

import (
	"embed"
	"testing"
)

//go:embed testdata/*
var testdataFS embed.FS

func ReadTestdata(t *testing.T, name string) []byte {
	t.Helper()
	data, err := testdataFS.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatalf("ReadTestdata(%q): %v", name, err)
	}
	return data
}
