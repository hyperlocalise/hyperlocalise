package runsvc

import (
	"path/filepath"
	"slices"
	"strings"
)

// stagedLocaleSep separates a shared-workbook target path from its locale in
// staged map keys. It cannot appear in filesystem paths.
const stagedLocaleSep = "\x00"

func sharedLocaleTargetPath(path string) bool {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".xlsx", ".csv", ".tsv":
		return true
	default:
		return false
	}
}

func stagedOutputKey(targetPath, targetLocale string) string {
	if !sharedLocaleTargetPath(targetPath) {
		return targetPath
	}
	locale := strings.TrimSpace(targetLocale)
	if locale == "" {
		return targetPath
	}
	return targetPath + stagedLocaleSep + locale
}

func stagedOutputPath(key string) string {
	path, _, _ := strings.Cut(key, stagedLocaleSep)
	return path
}

func sharedLocaleIdentitySuffix(targetPath, targetLocale string) string {
	if !sharedLocaleTargetPath(targetPath) {
		return ""
	}
	return strings.TrimSpace(targetLocale)
}

func taskLockIdentity(projectRoot, targetPath, targetLocale, entryKey string) string {
	identity := preferredTaskIdentity(projectRoot, targetPath, entryKey)
	if suffix := sharedLocaleIdentitySuffix(targetPath, targetLocale); suffix != "" {
		return identity + "::" + suffix
	}
	return identity
}

func snapshotStagedOutputsForPath(staged map[string]stagedOutput, targetPath string) []stagedOutput {
	outputs := make([]stagedOutput, 0)
	if output, ok := staged[targetPath]; ok {
		outputs = append(outputs, output)
	}
	prefix := targetPath + stagedLocaleSep
	for key, output := range staged {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		if strings.TrimSpace(output.targetLocale) == "" {
			output.targetLocale = strings.TrimPrefix(key, prefix)
		}
		outputs = append(outputs, output)
	}
	slices.SortFunc(outputs, func(a, b stagedOutput) int {
		return strings.Compare(a.targetLocale, b.targetLocale)
	})
	return outputs
}

func deleteStagedOutputsForPath(staged map[string]stagedOutput, targetPath string) {
	delete(staged, targetPath)
	prefix := targetPath + stagedLocaleSep
	for key := range staged {
		if strings.HasPrefix(key, prefix) {
			delete(staged, key)
		}
	}
}

func groupedStagedOutputPaths(staged map[string]stagedOutput) map[string][]stagedOutput {
	grouped := make(map[string][]stagedOutput, len(staged))
	for key, output := range staged {
		path := stagedOutputPath(key)
		if strings.TrimSpace(output.targetLocale) == "" {
			if _, locale, ok := strings.Cut(key, stagedLocaleSep); ok {
				output.targetLocale = locale
			}
		}
		grouped[path] = append(grouped[path], output)
	}
	for path, outputs := range grouped {
		slices.SortFunc(outputs, func(a, b stagedOutput) int {
			return strings.Compare(a.targetLocale, b.targetLocale)
		})
		grouped[path] = outputs
	}
	return grouped
}
