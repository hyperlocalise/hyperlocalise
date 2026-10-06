package fixtures

import "embed"

//go:embed testdata/*
var testdata embed.FS

// Read returns embedded interchange fixture bytes by file name (for example "crowdin-two-column.csv").
func Read(name string) ([]byte, error) {
	return testdata.ReadFile("testdata/" + name)
}
