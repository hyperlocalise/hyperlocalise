package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Job creation follows the platform's POST /api/v1/jobs: the same body, checks, and stored rows.
// It records the job only. String and file jobs are not started on an AI run here, and no
// usage is reserved for them.

const (
	maxJobMetadataEntries   = 50
	maxKeyJobTags           = 10
	maxIdempotencyKeyLength = 255
)

var (
	errJobSourceFileNotFound    = errors.New("job source file not found")
	errJobSourceFileUnsupported = errors.New("job source file format is not supported")
	errJobBudgetExceeded        = errors.New("organization job budget exceeded")
	errIdempotencyKeyReused     = errors.New("idempotency key reused with a different request")
	errKeyJobNoStrings          = errors.New("no strings match the key job selection")
	errAfterJobNotFound         = errors.New("the job to come after is not in the project")
)

// taskStepStored is how a file task's step is saved and titled, as the web app's
// TASK_STEP_STORED: the visual workflow Assign task step saves post-edit as edit.
var taskStepStored = map[string]struct{ Step, TitlePrefix string }{
	"post_edit": {"edit", "Post-edit"},
	"proofread": {"proofread", "Proofread"},
}

// jobLocaleError is a locale the project does not accept, with the platform's code and message.
type jobLocaleError struct {
	Code    string
	Message string
}

func (e jobLocaleError) Error() string { return e.Message }

// jobFormatMismatchError names the format the source file's name implies.
type jobFormatMismatchError struct{ Expected string }

func (e jobFormatMismatchError) Error() string { return "source file format mismatch" }

// jobBudgetError carries the budget message the platform returns.
type jobBudgetError struct{ Message string }

func (e jobBudgetError) Error() string { return e.Message }
func (e jobBudgetError) Unwrap() error { return errJobBudgetExceeded }

// fileJobFormatsByExtension is the web app's formatsByExtension. Every format it names is a file
// job format; Office formats are included because the pinned sandbox CLI parses them.
var fileJobFormatsByExtension = map[string]string{
	".json": "json", ".jsonc": "jsonc", ".yaml": "yaml", ".yml": "yaml", ".arb": "arb",
	".xlf": "xliff", ".xlif": "xliff", ".xliff": "xliff", ".po": "po", ".pot": "po", ".ts": "qt-ts",
	".html": "html", ".htm": "html", ".md": "markdown", ".markdown": "markdown", ".mdown": "markdown",
	".mkdn": "markdown", ".mdwn": "markdown", ".mkd": "markdown", ".mdx": "mdx", ".adoc": "asciidoc",
	".asciidoc": "asciidoc", ".asc": "asciidoc", ".txt": "txt", ".strings": "strings",
	".stringsdict": "stringsdict", ".xcstrings": "xcstrings", ".csv": "csv", ".tsv": "tsv",
	".toml": "toml", ".ini": "ini", ".xml": "xml", ".resx": "resx", ".resw": "resw",
	".properties": "properties", ".php": "php", ".ftl": "ftl", ".js": "javascript", ".jsx": "javascript",
	".mjs": "javascript", ".cjs": "javascript", ".tsx": "javascript", ".mts": "javascript",
	".cts": "javascript", ".liquid": "liquid", ".srt": "srt", ".vtt": "vtt", ".sbv": "sbv", ".svg": "svg",
	".lottie": "lottie", ".png": "png", ".jpg": "jpeg", ".jpeg": "jpeg", ".webp": "webp", ".mp4": "mp4",
	".docx": "docx", ".xlsx": "xlsx", ".xls": "xls", ".pptx": "pptx", ".pdf": "pdf",
}

func fileJobFormatOf(filename string) (string, bool) {
	dot := strings.LastIndex(filename, ".")
	if dot < 0 {
		return "", false
	}
	format, ok := fileJobFormatsByExtension[strings.ToLower(filename[dot:])]
	return format, ok
}

func validFileJobFormat(format string) bool {
	for _, known := range fileJobFormatsByExtension {
		if known == format {
			return true
		}
	}
	return false
}

var (
	projectBranchPattern = regexp.MustCompile(`^[A-Za-z0-9._](?:[A-Za-z0-9._/-]{0,126}[A-Za-z0-9._])?$`)
	keyTagPattern        = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)
)

func normalizeBranchName(value string) string {
	return strings.Trim(strings.TrimSpace(value), "/")
}

func validBranchName(value string) bool {
	name := normalizeBranchName(value)
	return projectBranchPattern.MatchString(name) && !strings.Contains(name, "//")
}

// normalizeJobProjectID follows the web app's normalizeProjectId: trimmed, and URL-decoded at
// most twice.
func normalizeJobProjectID(value string) string {
	projectID := strings.TrimSpace(value)
	for i := 0; i < 2 && strings.Contains(projectID, "%"); i++ {
		decoded, err := url.PathUnescape(projectID)
		if err != nil || decoded == projectID {
			break
		}
		projectID = decoded
	}
	return projectID
}

// normalizeJobSourcePath is the web app's normalizeSourcePath.
func normalizeJobSourcePath(value string) string {
	value = strings.ReplaceAll(value, `\`, "/")
	for strings.HasPrefix(value, "./") {
		value = value[2:]
	}
	for strings.Contains(value, "//") {
		value = strings.ReplaceAll(value, "//", "/")
	}
	return value
}

type jobCreateBody struct {
	Type        string          `json:"type"`
	ProjectID   string          `json:"projectId"`
	Title       *string         `json:"title"`
	Description *string         `json:"description"`
	DueAt       *string         `json:"dueAt"`
	OwnerEmail  *string         `json:"ownerEmail"`
	StringInput *stringJobInput `json:"stringInput"`
	FileInput   *fileJobInput   `json:"fileInput"`
	KeysInput   *keysJobInput   `json:"keysInput"`
}

type stringJobInput struct {
	SourceText    string            `json:"sourceText"`
	SourceLocale  string            `json:"sourceLocale"`
	TargetLocales []string          `json:"targetLocales"`
	Metadata      map[string]string `json:"metadata,omitempty"`
	Context       *string           `json:"context,omitempty"`
	MaxLength     *int              `json:"maxLength,omitempty"`
}

type fileJobInput struct {
	SourceFileID  string            `json:"sourceFileId"`
	FileFormat    string            `json:"fileFormat"`
	SourceLocale  string            `json:"sourceLocale"`
	TargetLocales []string          `json:"targetLocales"`
	Metadata      map[string]string `json:"metadata,omitempty"`
	Branch        *string           `json:"branch,omitempty"`
	// Step makes the job a task for a person (post_edit or proofread) instead of AI work.
	Step *string `json:"step,omitempty"`
	// After is the job a task comes after: it waits until that job is marked done or cancelled.
	After *string `json:"after,omitempty"`
}

type keysJobInput struct {
	SourceLocale        string            `json:"sourceLocale"`
	TargetLocales       []string          `json:"targetLocales"`
	Metadata            map[string]string `json:"metadata,omitempty"`
	StringIDs           []string          `json:"stringIds,omitempty"`
	Keys                []string          `json:"keys,omitempty"`
	Tags                []string          `json:"tags,omitempty"`
	OverwriteUnapproved *bool             `json:"overwriteUnapproved,omitempty"`
}

// jobCreate is a checked create request.
type jobCreate struct {
	Type        string
	ProjectID   string
	Title       string
	Description string
	DueAt       *time.Time
	OwnerEmail  string
	String      *stringJobInput
	File        *fileJobInput
	Keys        *keysJobInput
}

// jobIdempotency is the Idempotency-Key header and the request's hash.
type jobIdempotency struct {
	Key         string
	RequestHash string
}

type createdJobResult struct {
	ID     string `json:"id"`
	Type   string `json:"type"`
	Status string `json:"status"`
}

func trimLocales(values []string) ([]string, bool) {
	if len(values) == 0 || len(values) > maxJobTargetLocales {
		return nil, false
	}
	out := make([]string, len(values))
	for i, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || len(value) > 32 {
			return nil, false
		}
		out[i] = value
	}
	return out, true
}

func validJobMetadata(metadata map[string]string) bool {
	if len(metadata) > maxJobMetadataEntries {
		return false
	}
	for key, value := range metadata {
		if len([]rune(key)) > 100 || len([]rune(value)) > 1000 {
			return false
		}
	}
	return true
}

func trimmedSourceLocale(value string) (string, bool) {
	value = strings.TrimSpace(value)
	return value, value != "" && len(value) <= 32
}

// check trims and validates the body as the platform's createPublicJobBodySchema does.
func (b jobCreateBody) check() (jobCreate, bool) {
	out := jobCreate{Type: b.Type, ProjectID: normalizeJobProjectID(b.ProjectID)}
	if out.ProjectID == "" || len(out.ProjectID) > 128 {
		return jobCreate{}, false
	}
	if b.Title != nil {
		out.Title = strings.TrimSpace(*b.Title)
		if out.Title == "" || len([]rune(out.Title)) > 256 {
			return jobCreate{}, false
		}
	}
	if b.Description != nil {
		out.Description = strings.TrimSpace(*b.Description)
		if len([]rune(out.Description)) > 2048 {
			return jobCreate{}, false
		}
	}
	if b.DueAt != nil {
		due, err := time.Parse(time.RFC3339, *b.DueAt)
		if err != nil {
			return jobCreate{}, false
		}
		out.DueAt = &due
	}
	if b.OwnerEmail != nil {
		out.OwnerEmail = strings.TrimSpace(*b.OwnerEmail)
		if !validEmail(out.OwnerEmail) {
			return jobCreate{}, false
		}
	}

	inputs := 0
	for _, set := range []bool{b.StringInput != nil, b.FileInput != nil, b.KeysInput != nil} {
		if set {
			inputs++
		}
	}
	if inputs != 1 {
		return jobCreate{}, false
	}
	var ok bool
	switch b.Type {
	case "string":
		if b.StringInput == nil {
			return jobCreate{}, false
		}
		input := *b.StringInput
		input.SourceText = strings.TrimSpace(input.SourceText)
		if input.SourceText == "" || len([]rune(input.SourceText)) > 100_000 {
			return jobCreate{}, false
		}
		if input.SourceLocale, ok = trimmedSourceLocale(input.SourceLocale); !ok {
			return jobCreate{}, false
		}
		if input.TargetLocales, ok = trimLocales(input.TargetLocales); !ok {
			return jobCreate{}, false
		}
		if !validJobMetadata(input.Metadata) || (input.Context != nil && len([]rune(*input.Context)) > 20_000) ||
			(input.MaxLength != nil && (*input.MaxLength < 1 || *input.MaxLength > 100_000)) {
			return jobCreate{}, false
		}
		out.String = &input
	case "file":
		if b.FileInput == nil {
			return jobCreate{}, false
		}
		input := *b.FileInput
		input.SourceFileID = strings.TrimSpace(input.SourceFileID)
		if input.SourceFileID == "" || len(input.SourceFileID) > 128 || !validFileJobFormat(input.FileFormat) {
			return jobCreate{}, false
		}
		if input.SourceLocale, ok = trimmedSourceLocale(input.SourceLocale); !ok {
			return jobCreate{}, false
		}
		if input.TargetLocales, ok = trimLocales(input.TargetLocales); !ok {
			return jobCreate{}, false
		}
		if !validJobMetadata(input.Metadata) {
			return jobCreate{}, false
		}
		if input.Branch != nil {
			trimmed := strings.TrimSpace(*input.Branch)
			if trimmed == "" || len(trimmed) > 128 || !validBranchName(trimmed) {
				return jobCreate{}, false
			}
			normalized := normalizeBranchName(trimmed)
			input.Branch = &normalized
		}
		if input.Step != nil {
			if _, known := taskStepStored[*input.Step]; !known {
				return jobCreate{}, false
			}
		}
		if input.After != nil {
			after := strings.TrimSpace(*input.After)
			if input.Step == nil || after == "" || len(after) > 128 {
				return jobCreate{}, false
			}
			input.After = &after
		}
		out.File = &input
	case "keys":
		if b.KeysInput == nil {
			return jobCreate{}, false
		}
		input := *b.KeysInput
		if input.SourceLocale, ok = trimmedSourceLocale(input.SourceLocale); !ok {
			return jobCreate{}, false
		}
		if input.TargetLocales, ok = trimLocales(input.TargetLocales); !ok {
			return jobCreate{}, false
		}
		if !validJobMetadata(input.Metadata) || (input.OverwriteUnapproved != nil && *input.OverwriteUnapproved) {
			return jobCreate{}, false
		}
		selections := 0
		if input.StringIDs != nil {
			selections++
			if len(input.StringIDs) == 0 || len(input.StringIDs) > maxJobStrings {
				return jobCreate{}, false
			}
			for _, id := range input.StringIDs {
				if _, err := uuid.Parse(id); err != nil || len(id) != 36 {
					return jobCreate{}, false
				}
			}
		}
		if input.Keys != nil {
			selections++
			if len(input.Keys) == 0 || len(input.Keys) > maxJobStrings {
				return jobCreate{}, false
			}
			for i, key := range input.Keys {
				input.Keys[i] = strings.TrimSpace(key)
				if input.Keys[i] == "" || len([]rune(input.Keys[i])) > 1000 {
					return jobCreate{}, false
				}
			}
		}
		if input.Tags != nil {
			selections++
			if len(input.Tags) == 0 || len(input.Tags) > maxKeyJobTags {
				return jobCreate{}, false
			}
			for _, tag := range input.Tags {
				if !keyTagPattern.MatchString(tag) {
					return jobCreate{}, false
				}
			}
		}
		if selections != 1 {
			return jobCreate{}, false
		}
		out.Keys = &input
	default:
		return jobCreate{}, false
	}
	return out, true
}

func optionalText(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func sortedUnique(values []string) []string {
	if values == nil {
		return nil
	}
	seen := map[string]struct{}{}
	out := []string{}
	for _, value := range values {
		if _, dup := seen[value]; !dup {
			seen[value] = struct{}{}
			out = append(out, value)
		}
	}
	sort.Strings(out)
	return out
}

func hashedLocale(value string) string {
	if canonical, ok := canonicalLocale(value); ok {
		return canonical
	}
	return value
}

func nonEmptyMetadata(metadata map[string]string) map[string]string {
	if len(metadata) == 0 {
		return nil
	}
	return metadata
}

// requestHash ports the platform's hashPublicJobRequest, field for field and in the same key
// order, so an Idempotency-Key used on either API matches the same request.
func (j jobCreate) requestHash() (string, error) {
	type shared struct {
		Type        string  `json:"type"`
		ProjectID   string  `json:"projectId"`
		Title       *string `json:"title,omitempty"`
		Description *string `json:"description,omitempty"`
		DueAt       *string `json:"dueAt,omitempty"`
		OwnerEmail  *string `json:"ownerEmail,omitempty"`
	}
	base := shared{
		Type: j.Type, ProjectID: j.ProjectID, Title: optionalText(j.Title),
		Description: optionalText(j.Description), OwnerEmail: optionalText(strings.ToLower(j.OwnerEmail)),
	}
	if j.DueAt != nil {
		due := j.DueAt.UTC().Format("2006-01-02T15:04:05.000Z")
		base.DueAt = &due
	}
	var canonical any
	switch j.Type {
	case "keys":
		targets := make([]string, len(j.Keys.TargetLocales))
		for i, locale := range j.Keys.TargetLocales {
			targets[i] = hashedLocale(locale)
		}
		canonical = struct {
			shared
			KeysInput keysJobHashInput `json:"keysInput"`
		}{base, keysJobHashInput{
			SourceLocale:  hashedLocale(j.Keys.SourceLocale),
			TargetLocales: sortedUnique(targets),
			Metadata:      nonEmptyMetadata(j.Keys.Metadata),
			StringIDs:     sortedUnique(j.Keys.StringIDs),
			Keys:          sortedUnique(j.Keys.Keys),
			Tags:          sortedUnique(j.Keys.Tags),
		}}
	case "string":
		input := *j.String
		input.Metadata = nonEmptyMetadata(input.Metadata)
		canonical = struct {
			shared
			StringInput stringJobInput `json:"stringInput"`
		}{base, input}
	default:
		input := *j.File
		input.Metadata = nonEmptyMetadata(input.Metadata)
		canonical = struct {
			shared
			FileInput fileJobInput `json:"fileInput"`
		}{base, input}
	}
	var buf bytes.Buffer
	encoder := json.NewEncoder(&buf)
	// JSON.stringify leaves <, > and & as they are.
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(canonical); err != nil {
		return "", err
	}
	sum := sha256.Sum256(bytes.TrimSuffix(buf.Bytes(), []byte("\n")))
	return hex.EncodeToString(sum[:]), nil
}

// keysJobHashInput is a key job's input as the request hash canonicalizes it.
type keysJobHashInput struct {
	SourceLocale  string            `json:"sourceLocale"`
	TargetLocales []string          `json:"targetLocales"`
	Metadata      map[string]string `json:"metadata,omitempty"`
	StringIDs     []string          `json:"stringIds,omitempty"`
	Keys          []string          `json:"keys,omitempty"`
	Tags          []string          `json:"tags,omitempty"`
}

func validIdempotencyKey(key string) bool {
	if key == "" || len(key) > maxIdempotencyKeyLength {
		return false
	}
	for i := 0; i < len(key); i++ {
		if key[i] < 0x21 || key[i] > 0x7e {
			return false
		}
	}
	return true
}

// createJob records a job, as the platform's POST /api/v1/jobs does, without starting it.
func (s apiServer) createJob(w http.ResponseWriter, r *http.Request) {
	p, ok := s.authenticateWithStore(w, r, "jobs:write")
	if !ok {
		return
	}
	var body jobCreateBody
	if !decodeJSONBodyLimit(w, r, &body, 1<<20) {
		return
	}
	input, valid := body.check()
	if !valid {
		writeError(w, http.StatusBadRequest, "invalid_job_payload", "Invalid job payload")
		return
	}
	var idempotency *jobIdempotency
	if keys := r.Header.Values("Idempotency-Key"); len(keys) > 0 {
		if len(keys) != 1 || !validIdempotencyKey(keys[0]) {
			writeError(w, http.StatusBadRequest, "invalid_idempotency_key", "Idempotency-Key must be 1 to 255 printable ASCII characters")
			return
		}
		hash, err := input.requestHash()
		if err != nil {
			writeStoreError(w, err, "hash job request")
			return
		}
		idempotency = &jobIdempotency{Key: keys[0], RequestHash: hash}
	}
	created, replayed, err := s.store.createJob(r.Context(), p, input, idempotency)
	if err != nil {
		writeJobCreateError(w, err)
		return
	}
	status := http.StatusCreated
	if replayed {
		w.Header().Set("Idempotent-Replayed", "true")
		status = http.StatusOK
	}
	writeJSON(w, status, struct {
		Job createdJobResult `json:"job"`
	}{created})
}

func writeJobCreateError(w http.ResponseWriter, err error) {
	var localeErr jobLocaleError
	var mismatch jobFormatMismatchError
	var budget jobBudgetError
	switch {
	case errors.As(err, &localeErr):
		writeError(w, http.StatusBadRequest, localeErr.Code, localeErr.Message)
	case errors.As(err, &mismatch):
		writeJSON(w, http.StatusBadRequest, struct {
			Error   string            `json:"error"`
			Message string            `json:"message"`
			Details map[string]string `json:"details"`
		}{
			"source_file_format_mismatch", "Source file format does not match the requested format",
			map[string]string{"expectedFileFormat": mismatch.Expected},
		})
	case errors.As(err, &budget):
		writeError(w, http.StatusTooManyRequests, "organization_job_budget_exceeded", budget.Message)
	case errors.Is(err, errJobSourceFileNotFound):
		writeError(w, http.StatusNotFound, "source_file_not_found", "Source file not found")
	case errors.Is(err, errJobSourceFileUnsupported):
		writeError(w, http.StatusBadRequest, "unsupported_source_file_format", "Unsupported source file format")
	case errors.Is(err, errJobOwnerNotFound):
		writeError(w, http.StatusBadRequest, "owner_not_found", "Owner must be a member of this workspace")
	case errors.Is(err, errIdempotencyKeyReused):
		writeError(w, http.StatusUnprocessableEntity, "idempotency_key_reused", "Idempotency-Key was already used with a different request")
	case errors.Is(err, errAfterJobNotFound):
		writeError(w, http.StatusBadRequest, "after_job_not_found", "after must be a job in the same project")
	case errors.Is(err, errKeyJobNoStrings):
		writeError(w, http.StatusBadRequest, "no_strings_matched", "No visible strings in the project's files match the selection")
	case errors.Is(err, errKeyJobTooManyStrings):
		writeError(w, http.StatusBadRequest, "too_many_strings", "A key job holds at most 5,000 strings")
	case errors.Is(err, errProjectNotNative):
		writeError(w, http.StatusConflict, "project_not_native", "Tasks made of strings are for native projects")
	default:
		writeStoreError(w, err, "create job")
	}
}
