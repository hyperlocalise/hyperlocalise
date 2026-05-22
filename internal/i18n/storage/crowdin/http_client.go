package crowdin

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"time"

	sdkcrowdin "github.com/crowdin/crowdin-api-client-go/crowdin"
	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

type HTTPClient struct {
	client      *sdkcrowdin.Client
	httpClient  *http.Client
	debugWriter io.Writer
}

const (
	maxUpsertRetries = 3
	retryBaseDelay   = 250 * time.Millisecond
	pageLimit        = 500

	envCrowdinDebug      = "HYPERLOCALISE_CROWDIN_DEBUG"
	envCrowdinDebugColor = "HYPERLOCALISE_CROWDIN_DEBUG_COLOR"
	envGenericDebug      = "DEBUG"
)

type partialUpsertError struct {
	sentIndexes []int
	cause       error
}

func (e *partialUpsertError) Error() string {
	return fmt.Sprintf("partial upsert: sent %d entries before failure: %v", len(e.sentIndexes), e.cause)
}

func (e *partialUpsertError) Unwrap() error { return e.cause }

func retryDelay(attempt int, err error) time.Duration {
	var apiErr *model.ErrorResponse
	if errors.As(err, &apiErr) && apiErr.Response != nil {
		retryAfter := strings.TrimSpace(apiErr.Response.Header.Get("Retry-After"))
		if retryAfter != "" {
			if seconds, convErr := strconv.Atoi(retryAfter); convErr == nil && seconds > 0 {
				return time.Duration(seconds) * time.Second
			}
		}
	}

	delay := retryBaseDelay
	for i := 0; i < attempt; i++ {
		delay *= 2
	}
	return delay
}

func isRetryableUpsertError(err error) bool {
	var apiErr *model.ErrorResponse
	if errors.As(err, &apiErr) && apiErr.Response != nil {
		code := apiErr.Response.StatusCode
		return code == http.StatusTooManyRequests || code >= http.StatusInternalServerError
	}

	var netErr net.Error
	return errors.As(err, &netErr)
}

func waitForRetry(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func NewHTTPClient(cfg Config) (*HTTPClient, error) {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	httpClient := &http.Client{Timeout: timeout}
	if strings.TrimSpace(cfg.APIBaseURL) != "" {
		overrideURL, err := url.Parse(cfg.APIBaseURL)
		if err != nil {
			return nil, fmt.Errorf("crowdin client init: parse apiBaseURL: %w", err)
		}
		httpClient.Transport = &apiBaseURLRoundTripper{
			base:      http.DefaultTransport,
			override:  overrideURL,
			cloudHost: "api.crowdin.com",
		}
	}
	debug := debugEnabled(os.Getenv(envCrowdinDebug)) || debugEnabled(os.Getenv(envGenericDebug))
	if debug {
		httpClient.Transport = &debugRoundTripper{
			base:   httpClient.Transport,
			writer: os.Stdout,
			color:  debugEnabled(os.Getenv(envCrowdinDebugColor)),
		}
	}

	client, err := sdkcrowdin.NewClient(
		cfg.APIToken,
		sdkcrowdin.WithHTTPClient(httpClient),
	)
	if err != nil {
		return nil, fmt.Errorf("crowdin client init: %w", err)
	}

	httpCrowdinClient := &HTTPClient{client: client, httpClient: httpClient}
	if debug {
		httpCrowdinClient.debugWriter = os.Stdout
	}
	return httpCrowdinClient, nil
}

func debugEnabled(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func (c *HTTPClient) debugf(format string, args ...any) {
	if c == nil || c.debugWriter == nil {
		return
	}
	_, _ = fmt.Fprintf(c.debugWriter, "crowdin debug: "+format+"\n", args...)
}

type debugRoundTripper struct {
	base   http.RoundTripper
	writer io.Writer
	color  bool
}

func (rt *debugRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	base := rt.base
	if base == nil {
		base = http.DefaultTransport
	}

	start := time.Now()
	resp, err := base.RoundTrip(req)
	duration := time.Since(start)
	rt.write(req, resp, duration, err)
	return resp, err
}

func (rt *debugRoundTripper) write(req *http.Request, resp *http.Response, duration time.Duration, err error) {
	if rt == nil || rt.writer == nil || req == nil {
		return
	}

	status := "error"
	statusCode := 0
	if resp != nil {
		status = resp.Status
		statusCode = resp.StatusCode
	}

	method := req.Method
	if method == "" {
		method = http.MethodGet
	}
	endpoint := sanitizeHTTPDebugEndpoint(req.URL)
	line := fmt.Sprintf("crowdin http: %s %s status=%s duration=%s", method, endpoint, status, duration.Round(time.Millisecond))
	if err != nil {
		line += " error=" + sanitizeHTTPDebugError(err)
	}
	if rt.color {
		line = colorHTTPDebugLine(line, statusCode, err)
	}
	_, _ = fmt.Fprintln(rt.writer, line)
}

func sanitizeHTTPDebugEndpoint(u *url.URL) string {
	if u == nil {
		return "<unknown>"
	}
	if !strings.HasPrefix(u.Path, "/api/v2/") {
		return "crowdin-artifact"
	}

	parts := strings.Split(strings.Trim(u.Path, "/"), "/")
	for i, part := range parts {
		if isSensitiveHTTPDebugPathSegment(part) {
			parts[i] = ":id"
		}
	}
	return "/" + strings.Join(parts, "/")
}

func isSensitiveHTTPDebugPathSegment(part string) bool {
	if part == "" {
		return false
	}
	allDigits := true
	for _, r := range part {
		if r < '0' || r > '9' {
			allDigits = false
			break
		}
	}
	if allDigits {
		return true
	}
	if len(part) < 24 {
		return false
	}
	for _, r := range part {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			continue
		}
		return false
	}
	return true
}

func sanitizeHTTPDebugError(err error) string {
	if err == nil {
		return ""
	}
	message := err.Error()
	if parsed, parseErr := url.Parse(message); parseErr == nil && parsed.Scheme != "" && parsed.Host != "" {
		return parsed.Scheme + "://" + parsed.Host + "/..."
	}
	return strings.ReplaceAll(message, "\n", " ")
}

func colorHTTPDebugLine(line string, statusCode int, err error) string {
	const (
		reset  = "\x1b[0m"
		dim    = "\x1b[2m"
		green  = "\x1b[32m"
		yellow = "\x1b[33m"
		red    = "\x1b[31m"
	)

	color := green
	if err != nil || statusCode >= 500 {
		color = red
	} else if statusCode >= 400 {
		color = yellow
	}
	return dim + "crowdin http:" + reset + color + strings.TrimPrefix(line, "crowdin http:") + reset
}

type apiBaseURLRoundTripper struct {
	base      http.RoundTripper
	override  *url.URL
	cloudHost string
}

func (rt *apiBaseURLRoundTripper) RoundTrip(req *http.Request) (*http.Response, error) {
	transport := rt.base
	if transport == nil {
		transport = http.DefaultTransport
	}

	if req == nil || req.URL == nil || rt.override == nil {
		return transport.RoundTrip(req)
	}

	if !strings.EqualFold(req.URL.Host, rt.cloudHost) {
		return transport.RoundTrip(req)
	}

	rewritten := req.Clone(req.Context())
	rewritten.URL.Scheme = rt.override.Scheme
	rewritten.URL.Host = rt.override.Host
	rewritten.URL.Path = joinURLPath(rt.override.Path, req.URL.Path)
	rewritten.URL.RawPath = ""
	rewritten.Host = rt.override.Host

	return transport.RoundTrip(rewritten)
}

func joinURLPath(prefix, path string) string {
	trimmedPrefix := strings.TrimSuffix(prefix, "/")
	trimmedPath := strings.TrimPrefix(path, "/")

	if trimmedPrefix == "" {
		return "/" + trimmedPath
	}
	if trimmedPath == "" {
		return trimmedPrefix
	}

	return trimmedPrefix + "/" + trimmedPath
}

type sourceStringKey struct {
	key     string
	context string
}

type sourceStringMeta struct {
	key     string
	context string
}

type translationLookupKey struct {
	stringID int
	locale   string
}

func parseProjectID(raw string) (int, error) {
	projectID, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil || projectID <= 0 {
		return 0, fmt.Errorf("invalid projectID %q: expected positive integer", raw)
	}
	return projectID, nil
}

func indexSourceString(byID map[int]sourceStringMeta, byKey map[sourceStringKey]int, src *model.SourceString) {
	if src == nil || src.ID <= 0 {
		return
	}
	key := strings.TrimSpace(src.Identifier)
	if key == "" {
		return
	}
	context := strings.TrimSpace(src.Context)
	byID[src.ID] = sourceStringMeta{key: key, context: context}
	indexKey := sourceStringKey{key: key, context: context}
	if existingID, exists := byKey[indexKey]; exists && existingID != src.ID {
		// Ambiguous mapping across multiple source strings.
		byKey[indexKey] = -1
		return
	}

	if _, exists := byKey[indexKey]; !exists {
		byKey[indexKey] = src.ID
	}
}

func (c *HTTPClient) listSourceStrings(
	ctx context.Context,
	projectID int,
) (map[int]sourceStringMeta, map[sourceStringKey]int, error) {
	byID := make(map[int]sourceStringMeta)
	byKey := make(map[sourceStringKey]int)
	offset := 0

	for {
		strs, _, err := c.client.SourceStrings.List(ctx, projectID, &model.SourceStringsListOptions{
			ListOptions: model.ListOptions{
				Limit:  pageLimit,
				Offset: offset,
			},
		})
		if err != nil {
			return nil, nil, fmt.Errorf("list source strings: %w", err)
		}

		for _, src := range strs {
			indexSourceString(byID, byKey, src)
		}

		if len(strs) < pageLimit {
			break
		}
		offset += pageLimit
	}

	return byID, byKey, nil
}

func (c *HTTPClient) listTranslationTexts(
	ctx context.Context,
	projectID, stringID int,
	locale string,
) (map[string]struct{}, error) {
	texts := make(map[string]struct{})
	offset := 0

	for {
		translations, _, err := c.client.StringTranslations.ListStringTranslations(
			ctx,
			projectID,
			&model.StringTranslationsListOptions{
				StringID:   stringID,
				LanguageID: locale,
				ListOptions: model.ListOptions{
					Limit:  pageLimit,
					Offset: offset,
				},
			},
		)
		if err != nil {
			return nil, fmt.Errorf("list string translations: %w", err)
		}

		for _, tr := range translations {
			if tr == nil {
				continue
			}
			texts[tr.Text] = struct{}{}
		}

		if len(translations) < pageLimit {
			break
		}
		offset += pageLimit
	}

	return texts, nil
}

func (c *HTTPClient) resolveLocales(ctx context.Context, projectID int, inLocales []string) ([]ResolvedLocale, error) {
	requested := make([]string, 0, len(inLocales))
	requestedSeen := make(map[string]struct{}, len(inLocales))
	for _, locale := range inLocales {
		trimmed := strings.TrimSpace(locale)
		if trimmed == "" {
			continue
		}
		if _, exists := requestedSeen[trimmed]; exists {
			continue
		}
		requestedSeen[trimmed] = struct{}{}
		requested = append(requested, trimmed)
	}

	if len(requested) > 0 {
		out := make([]ResolvedLocale, 0, len(requested))
		for _, locale := range requested {
			out = append(out, ResolvedLocale{LanguageID: locale, Locale: locale})
		}
		c.debugf("action=resolve-locales project_id=%d requested=%s resolved=%s", projectID, strings.Join(requested, ","), strings.Join(resolvedLocaleIDs(out), ","))
		return out, nil
	}

	project, _, err := c.client.Projects.Get(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("get project: empty response")
	}

	targetIDs := make(map[string]struct{}, len(project.TargetLanguageIDs))
	for _, locale := range project.TargetLanguageIDs {
		trimmed := strings.TrimSpace(locale)
		if trimmed == "" {
			continue
		}
		targetIDs[trimmed] = struct{}{}
	}

	languages, err := c.supportedLanguageLookup(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]ResolvedLocale, 0, len(project.TargetLanguageIDs))
	seen := make(map[string]struct{}, len(project.TargetLanguageIDs))
	for _, languageID := range project.TargetLanguageIDs {
		trimmedID := strings.TrimSpace(languageID)
		if trimmedID == "" {
			continue
		}
		if _, exists := seen[trimmedID]; exists {
			continue
		}
		seen[trimmedID] = struct{}{}
		out = append(out, ResolvedLocale{LanguageID: trimmedID, Locale: resolveFolderLocale(trimmedID, project.TargetLanguages, languages.localeByID)})
	}
	c.debugf("action=resolve-locales project_id=%d requested=all resolved=%s", projectID, strings.Join(resolvedLocaleIDs(out), ","))
	return out, nil
}

type supportedLanguageLookup struct {
	localeByID map[string]string
}

func (c *HTTPClient) supportedLanguageLookup(ctx context.Context) (supportedLanguageLookup, error) {
	out := supportedLanguageLookup{
		localeByID: make(map[string]string),
	}
	offset := 0
	for {
		languages, _, err := c.client.Languages.List(ctx, &model.ListOptions{
			Limit:  pageLimit,
			Offset: offset,
		})
		if err != nil {
			return supportedLanguageLookup{}, fmt.Errorf("list supported languages: %w", err)
		}
		for _, language := range languages {
			addLanguageLookup(out.localeByID, language)
		}
		if len(languages) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return out, nil
}

func addLanguageLookup(localeByID map[string]string, language *model.Language) {
	if language == nil || strings.TrimSpace(language.ID) == "" {
		return
	}
	id := strings.TrimSpace(language.ID)
	if locale := strings.TrimSpace(language.Locale); locale != "" {
		localeByID[id] = locale
	}
}

func resolveFolderLocale(languageID string, projectLanguages []*model.Language, supportedLocaleByID map[string]string) string {
	for _, language := range projectLanguages {
		if language == nil || strings.TrimSpace(language.ID) != languageID {
			continue
		}
		if locale := strings.TrimSpace(language.Locale); locale != "" {
			return locale
		}
	}
	if locale := supportedLocaleByID[languageID]; locale != "" {
		return locale
	}
	return languageID
}

func resolvedLocaleIDs(locales []ResolvedLocale) []string {
	out := make([]string, 0, len(locales))
	for _, locale := range locales {
		out = append(out, locale.LanguageID)
	}
	return out
}

func (c *HTTPClient) ResolveLocales(ctx context.Context, projectID string, requested []string) ([]ResolvedLocale, error) {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return nil, err
	}
	return c.resolveLocales(ctx, projectInt, requested)
}

func (c *HTTPClient) ResolveBranch(ctx context.Context, projectID, branch string) (int, error) {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return 0, err
	}
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return 0, nil
	}
	offset := 0
	for {
		branches, _, err := c.client.Branches.List(ctx, projectInt, &model.BranchesListOptions{
			Name: branch,
			ListOptions: model.ListOptions{
				Limit:  pageLimit,
				Offset: offset,
			},
		})
		if err != nil {
			return 0, fmt.Errorf("list branches for %q: %w", branch, err)
		}
		for _, item := range branches {
			if item != nil && item.Name == branch {
				return item.ID, nil
			}
		}
		if len(branches) < pageLimit {
			break
		}
		offset += pageLimit
	}
	return 0, fmt.Errorf("crowdin branch %q not found", branch)
}

func (c *HTTPClient) EnsureDirectory(ctx context.Context, projectID string, branchID int, path string) (int, error) {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return 0, err
	}
	normalized := strings.Trim(strings.TrimSpace(filepath.ToSlash(path)), "/")
	if normalized == "" {
		return 0, nil
	}

	parentID := 0
	for _, segment := range strings.Split(normalized, "/") {
		directory, err := c.findDirectory(ctx, projectInt, branchID, parentID, segment)
		if err != nil {
			return 0, err
		}
		if directory == nil {
			req := &model.DirectoryAddRequest{Name: segment}
			if parentID > 0 {
				req.DirectoryID = parentID
			} else if branchID > 0 {
				req.BranchID = branchID
			}
			directory, _, err = c.client.SourceFiles.AddDirectory(ctx, projectInt, req)
			if err != nil {
				if !isConflictError(err) {
					return 0, fmt.Errorf("create directory %q: %w", segment, err)
				}
				directory, err = c.findDirectory(ctx, projectInt, branchID, parentID, segment)
				if err != nil {
					return 0, err
				}
				if directory == nil {
					return 0, fmt.Errorf("create directory %q: %w", segment, err)
				}
			}
		}
		parentID = directory.ID
	}
	return parentID, nil
}

func (c *HTTPClient) FindDirectory(ctx context.Context, projectID string, branchID int, path string) (int, error) {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return 0, err
	}
	normalized := strings.Trim(strings.TrimSpace(filepath.ToSlash(path)), "/")
	if normalized == "" {
		return 0, nil
	}

	parentID := 0
	for _, segment := range strings.Split(normalized, "/") {
		directory, err := c.findDirectory(ctx, projectInt, branchID, parentID, segment)
		if err != nil {
			return 0, err
		}
		if directory == nil {
			return 0, fmt.Errorf("remote directory %q not found", normalized)
		}
		parentID = directory.ID
	}
	return parentID, nil
}

func (c *HTTPClient) UpsertSourceFile(ctx context.Context, projectID string, branchID, directoryID int, name, localPath string, group storage.FileGroupSpec) (int, error) {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return 0, err
	}
	storageID, err := c.uploadStorage(ctx, localPath)
	if err != nil {
		return 0, err
	}

	file, err := c.findFile(ctx, projectInt, branchID, directoryID, name)
	if err != nil {
		return 0, err
	}
	if file == nil {
		req := &model.FileAddRequest{
			StorageID:               storageID,
			Name:                    name,
			ExcludedTargetLanguages: append([]string(nil), group.ExcludedTargetLanguages...),
		}
		if directoryID > 0 {
			req.DirectoryID = directoryID
		} else if branchID > 0 {
			req.BranchID = branchID
		}
		file, _, err = c.client.SourceFiles.AddFile(ctx, projectInt, req)
		if err != nil {
			return 0, fmt.Errorf("add source file %q: %w", name, err)
		}
		return file.ID, nil
	}

	file, _, err = c.client.SourceFiles.UpdateOrRestoreFile(ctx, projectInt, file.ID, &model.FileUpdateRestoreRequest{
		StorageID:    storageID,
		Name:         name,
		UpdateOption: "keep_translations_and_approvals",
	})
	if err != nil {
		return 0, fmt.Errorf("update source file %q: %w", name, err)
	}
	if excludedTargetLanguagesDiffer(file.ExcludeTargetLanguages, group.ExcludedTargetLanguages) {
		file, _, err = c.client.SourceFiles.EditFile(ctx, projectInt, file.ID, []*model.UpdateRequest{{
			Op:    model.OpReplace,
			Path:  "/excludedTargetLanguages",
			Value: normalizeDistinct(group.ExcludedTargetLanguages),
		}})
		if err != nil {
			return 0, fmt.Errorf("update excluded target languages for %q: %w", name, err)
		}
	}
	return file.ID, nil
}

func (c *HTTPClient) FindFile(ctx context.Context, projectID string, branchID, directoryID int, name string) (int, error) {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return 0, err
	}
	file, err := c.findFile(ctx, projectInt, branchID, directoryID, name)
	if err != nil {
		return 0, err
	}
	if file == nil {
		return 0, fmt.Errorf("remote source file %q not found", name)
	}
	return file.ID, nil
}

func (c *HTTPClient) UploadTranslationFile(ctx context.Context, projectID, languageID string, fileID int, localPath string) error {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return err
	}
	storageID, err := c.uploadStorage(ctx, localPath)
	if err != nil {
		return err
	}
	_, _, err = c.client.Translations.UploadTranslations(ctx, projectInt, languageID, &model.UploadTranslationsRequest{
		StorageID: storageID,
		FileID:    fileID,
	})
	if err != nil {
		return fmt.Errorf("upload translations for %s: %w", languageID, err)
	}
	return nil
}

func (c *HTTPClient) DownloadSourceFile(ctx context.Context, projectID string, fileID int) ([]byte, error) {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return nil, err
	}
	c.debugf("action=download-source project_id=%d file_id=%d phase=request-link", projectInt, fileID)
	link, _, err := c.client.SourceFiles.DownloadFile(ctx, projectInt, fileID)
	if err != nil {
		return nil, fmt.Errorf("download source file %d: %w", fileID, err)
	}
	if link == nil || strings.TrimSpace(link.URL) == "" {
		return nil, fmt.Errorf("download source file %d: empty download link", fileID)
	}
	c.debugf("action=download-source project_id=%d file_id=%d phase=download-artifact", projectInt, fileID)
	return c.downloadURL(ctx, link.URL)
}

func (c *HTTPClient) DownloadTranslationFile(ctx context.Context, projectID string, fileID int, languageID string, opts storage.FileExportOptions) ([]byte, error) {
	projectInt, err := parseProjectID(projectID)
	if err != nil {
		return nil, err
	}
	req := &model.BuildProjectFileTranslationRequest{
		TargetLanguageID:        languageID,
		SkipUntranslatedStrings: opts.SkipUntranslatedStrings,
		SkipUntranslatedFiles:   opts.SkipUntranslatedFiles,
		ExportApprovedOnly:      opts.ExportOnlyApproved,
	}
	c.debugf("action=download-translation project_id=%d file_id=%d language_id=%s skip_untranslated_strings=%s skip_untranslated_files=%s export_approved_only=%s phase=build-link", projectInt, fileID, languageID, debugBoolPtr(opts.SkipUntranslatedStrings), debugBoolPtr(opts.SkipUntranslatedFiles), debugBoolPtr(opts.ExportOnlyApproved))
	link, _, err := c.client.Translations.BuildProjectFileTranslation(ctx, projectInt, fileID, req, "")
	if err != nil {
		return nil, fmt.Errorf("build translation for file %d locale %s: %w", fileID, languageID, err)
	}
	if link == nil || strings.TrimSpace(link.URL) == "" {
		c.debugf("action=download-translation project_id=%d file_id=%d language_id=%s phase=skipped", projectInt, fileID, languageID)
		return nil, nil
	}
	c.debugf("action=download-translation project_id=%d file_id=%d language_id=%s phase=download-artifact", projectInt, fileID, languageID)
	return c.downloadURL(ctx, link.URL)
}

func debugBoolPtr(value *bool) string {
	if value == nil {
		return "unset"
	}
	if *value {
		return "true"
	}
	return "false"
}

func (c *HTTPClient) uploadStorage(ctx context.Context, localPath string) (int, error) {
	file, err := os.Open(localPath)
	if err != nil {
		return 0, fmt.Errorf("open local file %q: %w", localPath, err)
	}
	defer func() {
		_ = file.Close()
	}()

	store, _, err := c.client.Storages.Add(ctx, file)
	if err != nil {
		return 0, fmt.Errorf("upload storage %q: %w", localPath, err)
	}
	if store == nil || store.ID <= 0 {
		return 0, fmt.Errorf("upload storage %q: empty storage id", localPath)
	}
	return store.ID, nil
}

func (c *HTTPClient) findDirectory(ctx context.Context, projectID, branchID, parentDirectoryID int, name string) (*model.Directory, error) {
	opts := &model.DirectoryListOptions{Filter: name, ListOptions: model.ListOptions{Limit: pageLimit}}
	if parentDirectoryID > 0 {
		opts.DirectoryID = parentDirectoryID
	} else if branchID > 0 {
		opts.BranchID = branchID
	}
	directories, _, err := c.client.SourceFiles.ListDirectories(ctx, projectID, opts)
	if err != nil {
		return nil, fmt.Errorf("list directories for %q: %w", name, err)
	}
	for _, directory := range directories {
		if directory != nil && directory.Name == name {
			return directory, nil
		}
	}
	return nil, nil
}

func (c *HTTPClient) findFile(ctx context.Context, projectID, branchID, directoryID int, name string) (*model.File, error) {
	opts := &model.FileListOptions{Filter: name, ListOptions: model.ListOptions{Limit: pageLimit}}
	if directoryID > 0 {
		opts.DirectoryID = directoryID
	} else if branchID > 0 {
		opts.BranchID = branchID
	}
	files, _, err := c.client.SourceFiles.ListFiles(ctx, projectID, opts)
	if err != nil {
		return nil, fmt.Errorf("list files for %q: %w", name, err)
	}
	for _, file := range files {
		if file != nil && file.Name == name {
			return file, nil
		}
	}
	return nil, nil
}

func (c *HTTPClient) downloadURL(ctx context.Context, rawURL string) ([]byte, error) {
	httpClient := c.httpClient
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, fmt.Errorf("create download request: %w", err)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("download artifact: %w", err)
	}
	defer func() {
		_ = resp.Body.Close()
	}()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download artifact: unexpected status %s", resp.Status)
	}
	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read artifact: %w", err)
	}
	return payload, nil
}

func (c *HTTPClient) ListStrings(ctx context.Context, in ListStringsInput) ([]StringTranslation, string, error) {
	projectID, err := parseProjectID(in.ProjectID)
	if err != nil {
		return nil, "", err
	}

	sourceByID, _, err := c.listSourceStrings(ctx, projectID)
	if err != nil {
		return nil, "", err
	}
	locales, err := c.resolveLocales(ctx, projectID, in.Locales)
	if err != nil {
		return nil, "", err
	}

	entries := make([]StringTranslation, 0)
	entryFilter := buildEntryFilter(in)
	for _, locale := range locales {
		offset := 0
		for {
			translations, _, listErr := c.client.StringTranslations.ListLanguageTranslations(
				ctx,
				projectID,
				locale.LanguageID,
				&model.LanguageTranslationsListOptions{
					ListOptions: model.ListOptions{
						Limit:  pageLimit,
						Offset: offset,
					},
				},
			)
			if listErr != nil {
				return nil, "", fmt.Errorf("list language translations (%s): %w", locale.LanguageID, listErr)
			}

			for _, tr := range translations {
				if tr == nil || tr.StringID <= 0 || tr.Text == nil {
					continue
				}
				value := strings.TrimSpace(*tr.Text)
				if value == "" {
					continue
				}
				source, exists := sourceByID[tr.StringID]
				if !exists {
					continue
				}
				if !entryFilter.matches(source.key, source.context, locale.Locale) {
					continue
				}
				entries = append(entries, StringTranslation{
					Key:     source.key,
					Context: source.context,
					Locale:  locale.Locale,
					Value:   value,
				})
			}

			if len(translations) < pageLimit {
				break
			}
			offset += pageLimit
		}
	}

	return entries, time.Now().UTC().Format(time.RFC3339Nano), nil
}

func (c *HTTPClient) UpsertTranslations(ctx context.Context, in UpsertTranslationsInput) (UpsertTranslationsResult, error) {
	projectID, err := parseProjectID(in.ProjectID)
	if err != nil {
		return UpsertTranslationsResult{}, err
	}
	_, sourceByKey, err := c.listSourceStrings(ctx, projectID)
	if err != nil {
		return UpsertTranslationsResult{}, err
	}
	var languageIDByLocale map[string]string
	translationsByTarget := make(map[translationLookupKey]map[string]struct{}, len(in.Entries))
	result := UpsertTranslationsResult{
		Applied:  make([]int, 0, len(in.Entries)),
		Skipped:  make([]int, 0, len(in.Entries)),
		Revision: time.Now().UTC().Format(time.RFC3339Nano),
	}

	for idx, entry := range in.Entries {
		outcome, upsertErr := c.upsertTranslationEntry(ctx, projectID, entry, sourceByKey, &languageIDByLocale, translationsByTarget)
		if upsertErr != nil {
			return result, &partialUpsertError{sentIndexes: result.Applied, cause: upsertErr}
		}
		switch {
		case outcome.conflict != nil:
			result.Conflicts = append(result.Conflicts, UpsertConflict{
				Index:   idx,
				Reason:  outcome.conflict.reason,
				Message: outcome.conflict.message,
			})
		case outcome.sent:
			result.Applied = append(result.Applied, idx)
		default:
			result.Skipped = append(result.Skipped, idx)
		}
	}

	return result, nil
}

type upsertConflict struct {
	reason  string
	message string
}

type upsertTranslationOutcome struct {
	sent     bool
	conflict *upsertConflict
}

func (c *HTTPClient) upsertTranslationEntry(
	ctx context.Context,
	projectID int,
	entry StringTranslation,
	sourceByKey map[sourceStringKey]int,
	languageIDByLocale *map[string]string,
	translationsByTarget map[translationLookupKey]map[string]struct{},
) (upsertTranslationOutcome, error) {
	key, locale := strings.TrimSpace(entry.Key), strings.TrimSpace(entry.Locale)
	if key == "" || locale == "" {
		return upsertTranslationOutcome{}, nil
	}

	stringID, err := resolveSourceStringID(sourceByKey, key, entry.Context)
	if err != nil {
		return upsertTranslationOutcome{conflict: classifySourceStringConflict(err)}, nil
	}

	languageID, err := c.resolveCrowdinLanguageID(ctx, projectID, locale, languageIDByLocale)
	if err != nil {
		return upsertTranslationOutcome{}, err
	}
	knownTexts, err := c.ensureKnownTranslationTexts(ctx, projectID, stringID, languageID, translationsByTarget)
	if err != nil {
		return upsertTranslationOutcome{}, err
	}
	if _, exists := knownTexts[entry.Value]; exists {
		return upsertTranslationOutcome{}, nil
	}

	if err := c.addTranslationWithRetry(ctx, projectID, stringID, languageID, entry.Value); err != nil {
		return upsertTranslationOutcome{}, fmt.Errorf("add translation: %w", err)
	}

	knownTexts[entry.Value] = struct{}{}
	return upsertTranslationOutcome{sent: true}, nil
}

func resolveSourceStringID(sourceByKey map[sourceStringKey]int, key, context string) (int, error) {
	ctx := strings.TrimSpace(context)
	stringID, exists := sourceByKey[sourceStringKey{key: key, context: ctx}]
	if !exists {
		return 0, fmt.Errorf("source string not found for key=%q context=%q", key, ctx)
	}
	if stringID < 0 {
		return 0, fmt.Errorf("ambiguous source string for key=%q context=%q", key, ctx)
	}
	return stringID, nil
}

func (c *HTTPClient) resolveCrowdinLanguageID(ctx context.Context, projectID int, locale string, languageIDByLocale *map[string]string) (string, error) {
	locale = strings.TrimSpace(locale)
	if !mayBeCrowdinFolderLocale(locale) {
		return locale, nil
	}
	if languageIDByLocale == nil {
		return locale, nil
	}
	if *languageIDByLocale == nil {
		lookup, err := c.languageIDLookupByLocale(ctx, projectID)
		if err != nil {
			return "", err
		}
		*languageIDByLocale = lookup
	}
	if languageID := strings.TrimSpace((*languageIDByLocale)[locale]); languageID != "" {
		return languageID, nil
	}
	return locale, nil
}

func mayBeCrowdinFolderLocale(locale string) bool {
	return strings.ContainsAny(locale, "-_")
}

func (c *HTTPClient) languageIDLookupByLocale(ctx context.Context, projectID int) (map[string]string, error) {
	project, _, err := c.client.Projects.Get(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("get project: empty response")
	}

	languages, err := c.supportedLanguageLookup(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]string, len(project.TargetLanguageIDs)*2)
	for _, languageID := range project.TargetLanguageIDs {
		trimmedID := strings.TrimSpace(languageID)
		if trimmedID == "" {
			continue
		}
		out[trimmedID] = trimmedID
		if locale := strings.TrimSpace(resolveFolderLocale(trimmedID, project.TargetLanguages, languages.localeByID)); locale != "" {
			out[locale] = trimmedID
		}
	}
	return out, nil
}

func isConflictError(err error) bool {
	var apiErr *model.ErrorResponse
	if errors.As(err, &apiErr) && apiErr.Response != nil {
		return apiErr.Response.StatusCode == http.StatusConflict
	}

	var validationErr *model.ValidationErrorResponse
	return errors.As(err, &validationErr) && validationErr.Status == http.StatusConflict
}

func excludedTargetLanguagesDiffer(current, desired []string) bool {
	return !slices.Equal(normalizeDistinct(current), normalizeDistinct(desired))
}

func (c *HTTPClient) ensureKnownTranslationTexts(
	ctx context.Context,
	projectID, stringID int,
	locale string,
	translationsByTarget map[translationLookupKey]map[string]struct{},
) (map[string]struct{}, error) {
	target := translationLookupKey{stringID: stringID, locale: locale}
	if knownTexts, exists := translationsByTarget[target]; exists {
		return knownTexts, nil
	}

	knownTexts, err := c.listTranslationTexts(ctx, projectID, stringID, locale)
	if err != nil {
		return nil, err
	}
	translationsByTarget[target] = knownTexts
	return knownTexts, nil
}

func (c *HTTPClient) addTranslationWithRetry(ctx context.Context, projectID, stringID int, locale, value string) error {
	var lastErr error
	for attempt := 0; attempt <= maxUpsertRetries; attempt++ {
		_, _, reqErr := c.client.StringTranslations.AddTranslation(
			ctx,
			projectID,
			&model.TranslationAddRequest{StringID: stringID, LanguageID: locale, Text: value},
		)
		if reqErr == nil {
			return nil
		}
		lastErr = reqErr
		if !isRetryableUpsertError(lastErr) || attempt == maxUpsertRetries {
			break
		}
		if err := waitForRetry(ctx, retryDelay(attempt, lastErr)); err != nil {
			return err
		}
	}
	return lastErr
}

type entryFilter struct {
	keyPrefixes []string
	entryIDs    map[storage.EntryID]struct{}
}

func buildEntryFilter(in ListStringsInput) entryFilter {
	filter := entryFilter{
		keyPrefixes: make([]string, 0, len(in.KeyPrefixes)),
		entryIDs:    make(map[storage.EntryID]struct{}, len(in.EntryIDs)),
	}
	for _, prefix := range in.KeyPrefixes {
		trimmed := strings.TrimSpace(prefix)
		if trimmed == "" {
			continue
		}
		filter.keyPrefixes = append(filter.keyPrefixes, trimmed)
	}
	for _, id := range in.EntryIDs {
		filter.entryIDs[id] = struct{}{}
	}
	return filter
}

func (f entryFilter) matches(key, context, locale string) bool {
	if len(f.entryIDs) > 0 {
		if _, exists := f.entryIDs[storage.EntryID{Key: key, Context: context, Locale: locale}]; exists {
			return true
		}
		return false
	}
	if len(f.keyPrefixes) == 0 {
		return true
	}
	for _, prefix := range f.keyPrefixes {
		if strings.HasPrefix(key, prefix) {
			return true
		}
	}
	return false
}

func classifySourceStringConflict(err error) *upsertConflict {
	if err == nil {
		return nil
	}
	msg := err.Error()
	switch {
	case strings.Contains(msg, "not found"):
		return &upsertConflict{reason: "source_string_not_found", message: msg}
	case strings.Contains(msg, "ambiguous"):
		return &upsertConflict{reason: "ambiguous_source_string", message: msg}
	default:
		return &upsertConflict{reason: "unresolved_remote_identity", message: msg}
	}
}
