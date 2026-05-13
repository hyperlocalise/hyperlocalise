package lockfile

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

const DefaultPath = ".hyperlocalise.lock.json"

type File struct {
	Adapter       string                      `json:"adapter,omitempty"`
	ProjectID     string                      `json:"project_id,omitempty"`
	LastPullAt    *time.Time                  `json:"last_pull_at,omitempty"`
	ActiveRunID   string                      `json:"active_run_id,omitempty"`
	LocaleStates  map[string]LocaleCheckpoint `json:"locale_states,omitempty"`
	RunCompleted  map[string]RunCompletion    `json:"run_completed,omitempty"`
	RunCheckpoint map[string]RunCheckpoint    `json:"run_checkpoint,omitempty"`
}

type LocaleCheckpoint struct {
	Revision  string     `json:"revision,omitempty"`
	UpdatedAt *time.Time `json:"updated_at,omitempty"`
}

type RunCompletion struct {
	SourceHash string `json:"source_hash,omitempty"`
	TaskHash   string `json:"task_hash,omitempty"`
}

type RunCheckpoint struct {
	RunID        string    `json:"run_id,omitempty"`
	TargetPath   string    `json:"target_path,omitempty"`
	SourcePath   string    `json:"source_path,omitempty"`
	TargetLocale string    `json:"target_locale,omitempty"`
	EntryKey     string    `json:"entry_key,omitempty"`
	Value        string    `json:"value,omitempty"`
	SourceHash   string    `json:"source_hash,omitempty"`
	TaskHash     string    `json:"task_hash,omitempty"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type rawFile struct {
	Adapter       string                      `json:"adapter,omitempty"`
	ProjectID     string                      `json:"project_id,omitempty"`
	LastPullAt    *time.Time                  `json:"last_pull_at,omitempty"`
	ActiveRunID   string                      `json:"active_run_id,omitempty"`
	LocaleStates  map[string]LocaleCheckpoint `json:"locale_states,omitempty"`
	RunCompleted  json.RawMessage             `json:"run_completed,omitempty"`
	RunCheckpoint json.RawMessage             `json:"run_checkpoint,omitempty"`
}

type diskFile struct {
	Adapter       string                                  `json:"adapter,omitempty"`
	ProjectID     string                                  `json:"project_id,omitempty"`
	LastPullAt    *time.Time                              `json:"last_pull_at,omitempty"`
	ActiveRunID   string                                  `json:"active_run_id,omitempty"`
	LocaleStates  map[string]LocaleCheckpoint             `json:"locale_states,omitempty"`
	RunCompleted  map[string]map[string]diskRunCompletion `json:"run_completed,omitempty"`
	RunCheckpoint map[string]map[string]diskRunCheckpoint `json:"run_checkpoint,omitempty"`
}

type diskRunCompletion struct {
	SourceHash string `json:"s,omitempty"`
	TaskHash   string `json:"t,omitempty"`
}

type diskRunCheckpoint struct {
	RunID        string     `json:"r,omitempty"`
	SourcePath   string     `json:"p,omitempty"`
	TargetLocale string     `json:"l,omitempty"`
	Value        string     `json:"v,omitempty"`
	SourceHash   string     `json:"s,omitempty"`
	TaskHash     string     `json:"t,omitempty"`
	UpdatedAt    *time.Time `json:"u,omitempty"`
}

func Load(path string) (*File, error) {
	if path == "" {
		path = DefaultPath
	}

	content, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return &File{LocaleStates: map[string]LocaleCheckpoint{}, RunCompleted: map[string]RunCompletion{}, RunCheckpoint: map[string]RunCheckpoint{}}, nil
		}
		return nil, fmt.Errorf("read lockfile: %w", err)
	}

	var raw rawFile
	if err := json.Unmarshal(content, &raw); err != nil {
		return nil, fmt.Errorf("decode lockfile: %w", err)
	}
	completed, err := decodeRunCompleted(raw.RunCompleted)
	if err != nil {
		return nil, fmt.Errorf("decode lockfile run_completed: %w", err)
	}
	checkpoints, err := decodeRunCheckpoints(raw.RunCheckpoint)
	if err != nil {
		return nil, fmt.Errorf("decode lockfile run_checkpoint: %w", err)
	}
	f := File{
		Adapter:       raw.Adapter,
		ProjectID:     raw.ProjectID,
		LastPullAt:    raw.LastPullAt,
		ActiveRunID:   raw.ActiveRunID,
		LocaleStates:  raw.LocaleStates,
		RunCompleted:  completed,
		RunCheckpoint: checkpoints,
	}
	if f.LocaleStates == nil {
		f.LocaleStates = map[string]LocaleCheckpoint{}
	}
	if f.RunCompleted == nil {
		f.RunCompleted = map[string]RunCompletion{}
	}
	if f.RunCheckpoint == nil {
		f.RunCheckpoint = map[string]RunCheckpoint{}
	}

	return &f, nil
}

func Save(path string, f File) error {
	if path == "" {
		path = DefaultPath
	}
	if f.LocaleStates == nil {
		f.LocaleStates = map[string]LocaleCheckpoint{}
	}
	if f.RunCompleted == nil {
		f.RunCompleted = map[string]RunCompletion{}
	}
	if f.RunCheckpoint == nil {
		f.RunCheckpoint = map[string]RunCheckpoint{}
	}

	content, err := json.MarshalIndent(encodeDiskFile(f), "", "  ")
	if err != nil {
		return fmt.Errorf("marshal lockfile: %w", err)
	}
	content = append(content, '\n')

	if err := os.WriteFile(path, content, 0o644); err != nil {
		return fmt.Errorf("write lockfile: %w", err)
	}
	return nil
}

func decodeRunCompleted(raw json.RawMessage) (map[string]RunCompletion, error) {
	completed := map[string]RunCompletion{}
	if isEmptyRaw(raw) {
		return completed, nil
	}

	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, err
	}
	for key, value := range top {
		if isRunCompletionValue(key, value) {
			completion, err := decodeRunCompletion(value)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", key, err)
			}
			completed[key] = completion
			continue
		}

		var entries map[string]json.RawMessage
		if err := json.Unmarshal(value, &entries); err != nil {
			return nil, fmt.Errorf("%s: %w", key, err)
		}
		for entryKey, entryValue := range entries {
			completion, err := decodeRunCompletion(entryValue)
			if err != nil {
				return nil, fmt.Errorf("%s::%s: %w", key, entryKey, err)
			}
			completed[joinIdentity(key, entryKey)] = completion
		}
	}
	return completed, nil
}

func decodeRunCompletion(raw json.RawMessage) (RunCompletion, error) {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) > 0 && trimmed[0] == '[' {
		var tuple []string
		if err := json.Unmarshal(raw, &tuple); err != nil {
			return RunCompletion{}, err
		}
		completion := RunCompletion{}
		if len(tuple) > 0 {
			completion.SourceHash = compactFingerprint(tuple[0])
		}
		if len(tuple) > 1 {
			completion.TaskHash = compactFingerprint(tuple[1])
		}
		return completion, nil
	}

	var payload struct {
		SourceHash      string `json:"source_hash"`
		TaskHash        string `json:"task_hash"`
		ShortSourceHash string `json:"s"`
		ShortTaskHash   string `json:"t"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return RunCompletion{}, err
	}
	return RunCompletion{
		SourceHash: compactFingerprint(firstNonEmpty(payload.SourceHash, payload.ShortSourceHash)),
		TaskHash:   compactFingerprint(firstNonEmpty(payload.TaskHash, payload.ShortTaskHash)),
	}, nil
}

func decodeRunCheckpoints(raw json.RawMessage) (map[string]RunCheckpoint, error) {
	checkpoints := map[string]RunCheckpoint{}
	if isEmptyRaw(raw) {
		return checkpoints, nil
	}

	var top map[string]json.RawMessage
	if err := json.Unmarshal(raw, &top); err != nil {
		return nil, err
	}
	for key, value := range top {
		if isRunCheckpointValue(key, value) {
			targetPath, entryKey := splitIdentity(key)
			checkpoint, err := decodeRunCheckpoint(value, targetPath, entryKey)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", key, err)
			}
			checkpoints[joinIdentity(checkpoint.TargetPath, checkpoint.EntryKey)] = checkpoint
			continue
		}

		var entries map[string]json.RawMessage
		if err := json.Unmarshal(value, &entries); err != nil {
			return nil, fmt.Errorf("%s: %w", key, err)
		}
		for entryKey, entryValue := range entries {
			checkpoint, err := decodeRunCheckpoint(entryValue, key, entryKey)
			if err != nil {
				return nil, fmt.Errorf("%s::%s: %w", key, entryKey, err)
			}
			checkpoints[joinIdentity(checkpoint.TargetPath, checkpoint.EntryKey)] = checkpoint
		}
	}
	return checkpoints, nil
}

func decodeRunCheckpoint(raw json.RawMessage, impliedTargetPath, impliedEntryKey string) (RunCheckpoint, error) {
	var payload struct {
		RunID             string     `json:"run_id"`
		TargetPath        string     `json:"target_path"`
		SourcePath        string     `json:"source_path"`
		TargetLocale      string     `json:"target_locale"`
		EntryKey          string     `json:"entry_key"`
		Value             string     `json:"value"`
		SourceHash        string     `json:"source_hash"`
		TaskHash          string     `json:"task_hash"`
		UpdatedAt         *time.Time `json:"updated_at"`
		ShortRunID        string     `json:"r"`
		ShortSourcePath   string     `json:"p"`
		ShortTargetLocale string     `json:"l"`
		ShortValue        string     `json:"v"`
		ShortSourceHash   string     `json:"s"`
		ShortTaskHash     string     `json:"t"`
		ShortUpdatedAt    *time.Time `json:"u"`
	}
	if err := json.Unmarshal(raw, &payload); err != nil {
		return RunCheckpoint{}, err
	}

	updatedAt := time.Time{}
	if payload.ShortUpdatedAt != nil {
		updatedAt = *payload.ShortUpdatedAt
	}
	if payload.UpdatedAt != nil {
		updatedAt = *payload.UpdatedAt
	}

	return RunCheckpoint{
		RunID:        firstNonEmpty(payload.RunID, payload.ShortRunID),
		TargetPath:   firstNonEmpty(payload.TargetPath, impliedTargetPath),
		SourcePath:   firstNonEmpty(payload.SourcePath, payload.ShortSourcePath),
		TargetLocale: firstNonEmpty(payload.TargetLocale, payload.ShortTargetLocale),
		EntryKey:     firstNonEmpty(payload.EntryKey, impliedEntryKey),
		Value:        firstNonEmpty(payload.Value, payload.ShortValue),
		SourceHash:   compactFingerprint(firstNonEmpty(payload.SourceHash, payload.ShortSourceHash)),
		TaskHash:     compactFingerprint(firstNonEmpty(payload.TaskHash, payload.ShortTaskHash)),
		UpdatedAt:    updatedAt,
	}, nil
}

func encodeDiskFile(f File) diskFile {
	return diskFile{
		Adapter:       f.Adapter,
		ProjectID:     f.ProjectID,
		LastPullAt:    f.LastPullAt,
		ActiveRunID:   f.ActiveRunID,
		LocaleStates:  emptyMapAsNil(f.LocaleStates),
		RunCompleted:  encodeRunCompleted(f.RunCompleted),
		RunCheckpoint: encodeRunCheckpoints(f.RunCheckpoint),
	}
}

func encodeRunCompleted(completed map[string]RunCompletion) map[string]map[string]diskRunCompletion {
	if len(completed) == 0 {
		return nil
	}
	grouped := map[string]map[string]diskRunCompletion{}
	for identity, completion := range completed {
		targetPath, entryKey := splitIdentity(identity)
		if grouped[targetPath] == nil {
			grouped[targetPath] = map[string]diskRunCompletion{}
		}
		grouped[targetPath][entryKey] = diskRunCompletion{
			SourceHash: compactFingerprint(completion.SourceHash),
			TaskHash:   compactFingerprint(completion.TaskHash),
		}
	}
	return grouped
}

func encodeRunCheckpoints(checkpoints map[string]RunCheckpoint) map[string]map[string]diskRunCheckpoint {
	if len(checkpoints) == 0 {
		return nil
	}
	grouped := map[string]map[string]diskRunCheckpoint{}
	for identity, checkpoint := range checkpoints {
		targetPath, entryKey := splitCheckpointIdentity(identity, checkpoint)
		if grouped[targetPath] == nil {
			grouped[targetPath] = map[string]diskRunCheckpoint{}
		}
		diskCheckpoint := diskRunCheckpoint{
			RunID:        checkpoint.RunID,
			SourcePath:   checkpoint.SourcePath,
			TargetLocale: checkpoint.TargetLocale,
			Value:        checkpoint.Value,
			SourceHash:   compactFingerprint(checkpoint.SourceHash),
			TaskHash:     compactFingerprint(checkpoint.TaskHash),
		}
		if !checkpoint.UpdatedAt.IsZero() {
			updatedAt := checkpoint.UpdatedAt
			diskCheckpoint.UpdatedAt = &updatedAt
		}
		grouped[targetPath][entryKey] = diskCheckpoint
	}
	return grouped
}

func isRunCompletionValue(key string, raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return false
	}
	if trimmed[0] == '[' || strings.Contains(key, "::") {
		return true
	}
	if trimmed[0] != '{' {
		return false
	}
	return rawObjectHasStringField(trimmed, "source_hash", "task_hash", "s", "t")
}

func isRunCheckpointValue(key string, raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	if len(trimmed) == 0 {
		return false
	}
	if strings.Contains(key, "::") {
		return true
	}
	if trimmed[0] != '{' {
		return false
	}
	return rawObjectHasStringField(
		trimmed,
		"run_id",
		"target_path",
		"source_path",
		"target_locale",
		"entry_key",
		"value",
		"source_hash",
		"task_hash",
		"updated_at",
		"r",
		"p",
		"l",
		"v",
		"s",
		"t",
		"u",
	)
}

func rawObjectHasStringField(raw json.RawMessage, names ...string) bool {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil {
		return false
	}
	if len(object) == 0 {
		return true
	}
	for _, name := range names {
		field, ok := object[name]
		if !ok {
			continue
		}
		var value string
		if err := json.Unmarshal(field, &value); err == nil {
			return true
		}
	}
	return false
}

func isEmptyRaw(raw json.RawMessage) bool {
	trimmed := bytes.TrimSpace(raw)
	return len(trimmed) == 0 || bytes.Equal(trimmed, []byte("null"))
}

func splitIdentity(identity string) (string, string) {
	targetPath, entryKey, ok := strings.Cut(identity, "::")
	if !ok {
		return identity, ""
	}
	return targetPath, entryKey
}

func splitCheckpointIdentity(identity string, checkpoint RunCheckpoint) (string, string) {
	targetPath, entryKey, ok := strings.Cut(identity, "::")
	if ok {
		return targetPath, entryKey
	}
	if checkpoint.TargetPath != "" || checkpoint.EntryKey != "" {
		return checkpoint.TargetPath, checkpoint.EntryKey
	}
	return identity, ""
}

func joinIdentity(targetPath, entryKey string) string {
	return targetPath + "::" + entryKey
}

func compactFingerprint(value string) string {
	if len(value) != 128 {
		return value
	}
	for _, c := range value {
		if !isHex(c) {
			return value
		}
	}
	return strings.ToLower(value[:32])
}

func isHex(c rune) bool {
	return ('0' <= c && c <= '9') || ('a' <= c && c <= 'f') || ('A' <= c && c <= 'F')
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func emptyMapAsNil[K comparable, V any](m map[K]V) map[K]V {
	if len(m) == 0 {
		return nil
	}
	return m
}
