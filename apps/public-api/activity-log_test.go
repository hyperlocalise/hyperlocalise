package main

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestFileActivityEvent(t *testing.T) {
	t.Parallel()
	for _, tt := range []struct {
		name, path, wantPath, wantName string
		err                            error
	}{
		{name: "plain", path: "locales/en.json", wantPath: "locales/en.json", wantName: "en.json"},
		{name: "backslash", path: `locales\fr.json`, wantPath: "locales/fr.json", wantName: "fr.json"},
		{name: "dot slash", path: "././messages/app.po", wantPath: "messages/app.po", wantName: "app.po"},
		{name: "double slash", path: "a//b///c.json", wantPath: "a/b/c.json", wantName: "c.json"},
		{name: "trailing slash keeps last name", path: "locales/en.json/", wantPath: "locales/en.json/", wantName: "en.json"},
		{name: "empty", path: "", err: errNoActivityTarget},
		{name: "only dots", path: "././", err: errNoActivityTarget},
		{name: "root slash", path: "//", wantPath: "/", wantName: "/"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			event, err := fileActivityEvent("file_translations_imported", "project-1", tt.path, map[string]any{"imported": 3})
			if tt.err != nil {
				require.ErrorIs(t, err, tt.err)
				require.Zero(t, event)
				return
			}
			require.NoError(t, err)
			require.Equal(t, "file_translations_imported", event.EventType)
			require.Equal(t, "file", event.TargetKind)
			require.Equal(t, "project-1:"+tt.wantPath, event.TargetID)
			require.Equal(t, tt.wantName, event.Payload["fileName"])
			require.Equal(t, tt.wantName, event.Payload["name"])
			require.Equal(t, "project-1", event.Payload["projectId"])
			require.Equal(t, tt.wantPath, event.Payload["sourcePath"])
			require.Equal(t, 3, event.Payload["imported"])
		})
	}
}

func FuzzFileActivityEvent(f *testing.F) {
	for _, seed := range []string{"", "././", "//", `.\a\\b.json`, "locales/en.json", "./foo//bar.po", "ab\xffcd.json"} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, path string) {
		event, err := fileActivityEvent("file_translations_imported", "p", path, nil)
		normalized := path
		normalized = strings.ReplaceAll(normalized, `\`, "/")
		for strings.HasPrefix(normalized, "./") {
			normalized = normalized[2:]
		}
		for strings.Contains(normalized, "//") {
			normalized = strings.ReplaceAll(normalized, "//", "/")
		}
		if normalized == "" {
			require.ErrorIs(t, err, errNoActivityTarget)
			require.Zero(t, event)
			return
		}
		require.NoError(t, err)
		require.Equal(t, "p:"+normalized, event.TargetID)
		require.Equal(t, normalized, event.Payload["sourcePath"])
		require.NotEmpty(t, event.Payload["fileName"])
	})
}
