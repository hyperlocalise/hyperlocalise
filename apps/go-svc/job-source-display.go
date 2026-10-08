package main

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"net/url"
	"regexp"
	"slices"
	"strings"
)

var (
	storedFileIDPattern     = regexp.MustCompile(`(?i)^file_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
	vercelBlobHostPattern   = regexp.MustCompile(`(?i)\.blob\.vercel-storage\.com/`)
	storageKeyPrefixPattern = regexp.MustCompile(`(?:^|/)organizations/[^/]+/(?:projects/[^/]+|workspace)/files/[^/]+/`)
	httpURLPrefixPattern    = regexp.MustCompile(`(?i)^https?://`)
	leadingDotSlashPattern  = regexp.MustCompile(`^(?:\./)+`)
	repeatedSlashPattern    = regexp.MustCompile(`/+`)
)

type jobSourceFileInput struct {
	organizationID string
	inputPayload   []byte
}

type jobSourceFileDisplay struct {
	SourceFilename *string `json:"sourceFilename"`
	SourcePath     *string `json:"sourcePath"`
}

type jobInputPayloadSource struct {
	sourceFileID, metadataFilename, metadataSourcePath string
}

func isStoredFileID(value string) bool {
	return storedFileIDPattern.MatchString(trimDictionaryInput(value))
}

func isInternalStorageFilename(value string) bool {
	trimmed := trimDictionaryInput(value)
	if trimmed == "" {
		return false
	}
	if isStoredFileID(trimmed) || vercelBlobHostPattern.MatchString(trimmed) || storageKeyPrefixPattern.MatchString(trimmed) {
		return true
	}
	return strings.HasPrefix(trimmed, "organizations/") && strings.Contains(trimmed, "/files/")
}

func originalFilenameFromStoredName(filename string) string {
	trimmed := trimDictionaryInput(filename)
	if trimmed == "" || isStoredFileID(trimmed) {
		return "file"
	}
	candidate := trimmed
	if httpURLPrefixPattern.MatchString(candidate) {
		if parsed, err := url.Parse(candidate); err == nil {
			candidate = parsed.Path
		}
	}
	if location := storageKeyPrefixPattern.FindStringIndex(candidate); location != nil {
		candidate = candidate[:location[0]] + candidate[location[1]:]
	}
	if name := basenameFromSourcePath(candidate); name != "" {
		return name
	}
	return "file"
}

func basenameFromSourcePath(path string) string {
	normalized := strings.ReplaceAll(path, `\`, "/")
	normalized = leadingDotSlashPattern.ReplaceAllString(normalized, "")
	normalized = repeatedSlashPattern.ReplaceAllString(normalized, "/")
	parts := slices.DeleteFunc(strings.Split(normalized, "/"), func(part string) bool { return part == "" })
	if len(parts) == 0 {
		return normalized
	}
	return parts[len(parts)-1]
}

func nativeFileJobSourceDisplayFields(filename, sourcePath string) jobSourceFileDisplay {
	sourceFilename := originalFilenameFromStoredName(filename)
	displayPath := sourceFilename
	if trimmed := trimDictionaryInput(sourcePath); trimmed != "" && !isInternalStorageFilename(trimmed) {
		displayPath = trimmed
	}
	return jobSourceFileDisplay{SourceFilename: &sourceFilename, SourcePath: &displayPath}
}

func parseJobInputPayloadSource(raw []byte) jobInputPayloadSource {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(raw, &payload); err != nil {
		return jobInputPayloadSource{}
	}
	source := jobInputPayloadSource{sourceFileID: jsonTrimmedString(payload["sourceFileId"])}
	var metadata map[string]json.RawMessage
	if err := json.Unmarshal(payload["metadata"], &metadata); err == nil {
		source.metadataFilename = jsonTrimmedString(metadata["sourceFilename"])
		source.metadataSourcePath = jsonTrimmedString(metadata["sourcePath"])
	}
	return source
}

func jsonTrimmedString(raw json.RawMessage) string {
	var value string
	if len(raw) == 0 || raw[0] != '"' || json.Unmarshal(raw, &value) != nil {
		return ""
	}
	return trimDictionaryInput(value)
}

func (source jobInputPayloadSource) metadataDisplay() (jobSourceFileDisplay, bool) {
	if source.sourceFileID == "" || (source.metadataFilename == "" && source.metadataSourcePath == "") {
		return jobSourceFileDisplay{}, false
	}
	filename := source.metadataFilename
	if filename == "" {
		filename = source.metadataSourcePath
	}
	return nativeFileJobSourceDisplayFields(filename, source.metadataSourcePath), true
}

func resolveJobSourceFileDisplays(ctx context.Context, db dictionaryDB, jobs []jobSourceFileInput) ([]jobSourceFileDisplay, error) {
	displays := make([]jobSourceFileDisplay, len(jobs))
	pending := map[string][]int{}
	fileIDs := make([]string, len(jobs))
	for i, job := range jobs {
		source := parseJobInputPayloadSource(job.inputPayload)
		if display, ok := source.metadataDisplay(); ok {
			displays[i] = display
			continue
		}
		if source.sourceFileID == "" {
			continue
		}
		fileIDs[i] = source.sourceFileID
		pending[job.organizationID] = append(pending[job.organizationID], i)
	}
	for _, organizationID := range slices.Sorted(maps.Keys(pending)) {
		indexes := pending[organizationID]
		ids := make([]string, 0, len(indexes))
		for _, index := range indexes {
			if !slices.Contains(ids, fileIDs[index]) {
				ids = append(ids, fileIDs[index])
			}
		}
		found, err := lookupStoredFileSourceDisplays(ctx, db, organizationID, ids)
		if err != nil {
			return nil, err
		}
		for _, index := range indexes {
			displays[index] = found[fileIDs[index]]
		}
	}
	return displays, nil
}

func lookupStoredFileSourceDisplays(ctx context.Context, db dictionaryDB, organizationID string, fileIDs []string) (map[string]jobSourceFileDisplay, error) {
	rows, err := db.Query(ctx, `
        select f.id, f.filename, v.source_path,
            case when jsonb_typeof(f.metadata->'sourcePath') = 'string' then f.metadata->>'sourcePath' end
        from stored_files f
        left join repository_source_file_versions v on v.stored_file_id = f.id
        where f.organization_id = $1 and f.id = any($2)`,
		organizationID, fileIDs)
	if err != nil {
		return nil, fmt.Errorf("lookup job source files: %w", err)
	}
	defer rows.Close()
	displays := make(map[string]jobSourceFileDisplay, len(fileIDs))
	for rows.Next() {
		var fileID, filename string
		var versionSourcePath, metadataSourcePath *string
		if err := rows.Scan(&fileID, &filename, &versionSourcePath, &metadataSourcePath); err != nil {
			return nil, fmt.Errorf("scan job source file: %w", err)
		}
		sourcePath := versionSourcePath
		if sourcePath == nil {
			sourcePath = metadataSourcePath
		}
		var path string
		if sourcePath != nil {
			path = *sourcePath
		}
		displays[fileID] = nativeFileJobSourceDisplayFields(filename, path)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate job source files: %w", err)
	}
	return displays, nil
}
