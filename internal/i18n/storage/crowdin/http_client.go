package crowdin

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	sdkcrowdin "github.com/crowdin/crowdin-api-client-go/crowdin"
	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage"
)

type HTTPClient struct {
	client *sdkcrowdin.Client
}

const (
	maxUpsertRetries = 3
	retryBaseDelay   = 250 * time.Millisecond
	pageLimit        = 500
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

	client, err := sdkcrowdin.NewClient(
		cfg.APIToken,
		sdkcrowdin.WithHTTPClient(httpClient),
	)
	if err != nil {
		return nil, fmt.Errorf("crowdin client init: %w", err)
	}

	return &HTTPClient{client: client}, nil
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

func (c *HTTPClient) resolveLocales(ctx context.Context, projectID int, inLocales []string) ([]string, error) {
	out := make([]string, 0, len(inLocales))
	seen := make(map[string]struct{}, len(inLocales))
	for _, locale := range inLocales {
		trimmed := strings.TrimSpace(locale)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	if len(out) > 0 {
		return out, nil
	}

	project, _, err := c.client.Projects.Get(ctx, projectID)
	if err != nil {
		return nil, fmt.Errorf("get project: %w", err)
	}
	if project == nil {
		return nil, fmt.Errorf("get project: empty response")
	}

	for _, locale := range project.TargetLanguageIDs {
		trimmed := strings.TrimSpace(locale)
		if trimmed == "" {
			continue
		}
		if _, exists := seen[trimmed]; exists {
			continue
		}
		seen[trimmed] = struct{}{}
		out = append(out, trimmed)
	}
	return out, nil
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
				locale,
				&model.LanguageTranslationsListOptions{
					ListOptions: model.ListOptions{
						Limit:  pageLimit,
						Offset: offset,
					},
				},
			)
			if listErr != nil {
				return nil, "", fmt.Errorf("list language translations (%s): %w", locale, listErr)
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
				if !entryFilter.matches(source.key, source.context, locale) {
					continue
				}
				entries = append(entries, StringTranslation{
					Key:     source.key,
					Context: source.context,
					Locale:  locale,
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
	translationsByTarget := make(map[translationLookupKey]map[string]struct{}, len(in.Entries))
	result := UpsertTranslationsResult{
		Applied:  make([]int, 0, len(in.Entries)),
		Skipped:  make([]int, 0, len(in.Entries)),
		Revision: time.Now().UTC().Format(time.RFC3339Nano),
	}

	for idx, entry := range in.Entries {
		outcome, upsertErr := c.upsertTranslationEntry(ctx, projectID, entry, sourceByKey, translationsByTarget)
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

	knownTexts, err := c.ensureKnownTranslationTexts(ctx, projectID, stringID, locale, translationsByTarget)
	if err != nil {
		return upsertTranslationOutcome{}, err
	}
	if _, exists := knownTexts[entry.Value]; exists {
		return upsertTranslationOutcome{}, nil
	}

	if err := c.addTranslationWithRetry(ctx, projectID, stringID, locale, entry.Value); err != nil {
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
