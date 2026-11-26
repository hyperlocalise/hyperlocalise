package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

// irisDesktopGoSvcRoutes lists HTTP patterns the Iris desktop client calls on
// go-svc. Each entry is a substring that must appear in a route registration
// (route("METHOD "+...) or registerAuthenticated) under apps/go-svc.
var irisDesktopGoSvcRoutes = []struct {
	method, pathSuffix string
}{
	{"POST", "/files/translate"},
	{"POST", "/files/translations/import"},
	{"GET", "/files/download"},
	{"POST", "/files/detail/cat/recommendation"},
	{"GET", "/projects/{projectId}/assets/{fileId}"},
	{"POST", "/validate/segment"},
	{"POST", "/editor-export/filtered/serialize"},
	{"POST", "/jobs/{jobId}/retry"},
	{"POST", "/jobs/{jobId}/cancel"},
	{"POST", "/jobs/{jobId}/mark-failed"},
	{"POST", "/jobs/{jobId}/mark-done"},
}

func TestIrisDesktopGoSvcRoutesRegistered(t *testing.T) {
	t.Parallel()
	root := goSvcSourceRoot(t)
	var sources strings.Builder
	err := filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		raw, readErr := os.ReadFile(path)
		if readErr != nil {
			return readErr
		}
		sources.Write(raw)
		sources.WriteByte('\n')
		return nil
	})
	require.NoError(t, err)
	blob := sources.String()
	for _, route := range irisDesktopGoSvcRoutes {
		needle := `"` + route.method + " "
		require.Contains(t, blob, needle, "missing method %s registration", route.method)
		require.Contains(t, blob, route.pathSuffix, "Iris expects %s %s on go-svc", route.method, route.pathSuffix)
	}
}

func goSvcSourceRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	require.True(t, ok)
	return filepath.Dir(file)
}
