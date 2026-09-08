package mt

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"golang.org/x/text/language"
)

const (
	// MicrosoftGlobalBaseURL is Azure AI Translator's global resource endpoint.
	MicrosoftGlobalBaseURL = "https://api.cognitive.microsofttranslator.com"

	microsoftTranslatePath = "/translate"
	microsoftAPIVersion    = "3.0"

	// Azure AI Translator per-request limits for the Translate operation.
	// https://learn.microsoft.com/en-us/azure/ai-services/translator/service-limits
	microsoftMaxTextsPerRequest = 1000
	microsoftMaxCharsPerText    = 50000
	microsoftMaxCharsPerRequest = 50000
)

type MicrosoftClient struct {
	subscriptionKey string
	region          string
	customModel     string
	baseURL         string
	httpClient      *http.Client
}

var _ Engine = (*MicrosoftClient)(nil)

// NewMicrosoftClient creates an Azure AI Translator Text v3 client.
func NewMicrosoftClient(cfg Config) (*MicrosoftClient, error) {
	if strings.TrimSpace(cfg.SubscriptionKey) == "" {
		return nil, &Error{Code: ErrorCodeValidation, Message: "subscription key is required"}
	}
	if strings.TrimSpace(cfg.Region) == "" {
		return nil, &Error{Code: ErrorCodeValidation, Message: "region is required"}
	}
	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = MicrosoftGlobalBaseURL
	}
	return &MicrosoftClient{
		subscriptionKey: cfg.SubscriptionKey,
		region:          cfg.Region,
		customModel:     strings.TrimSpace(cfg.CustomModel),
		baseURL:         strings.TrimRight(baseURL, "/"),
		httpClient:      cfg.httpClient(),
	}, nil
}

type microsoftTranslateItem struct {
	Text string `json:"Text"`
}

type microsoftTranslateResult struct {
	Translations []struct {
		Text string `json:"text"`
	} `json:"translations"`
}

// Accept Azure error codes as either JSON numbers or quoted strings.
type microsoftErrorCode int

func (c *microsoftErrorCode) UnmarshalJSON(b []byte) error {
	s := strings.Trim(string(b), `"`)
	n, err := strconv.Atoi(s)
	if err != nil {
		*c = 0
		return nil
	}
	*c = microsoftErrorCode(n)
	return nil
}

type microsoftErrorResponse struct {
	Error struct {
		Code    microsoftErrorCode `json:"code"`
		Message string             `json:"message"`
	} `json:"error"`
}

// Translate implements Engine using Azure AI Translator Text v3.
func (c *MicrosoftClient) Translate(ctx context.Context, req Request) (Response, error) {
	if err := validateRequest(req); err != nil {
		return Response{}, err
	}

	for i, s := range req.Sources {
		if n := microsoftCharCount(s); n > microsoftMaxCharsPerText {
			return Response{}, &Error{
				Code: ErrorCodeValidation,
				Message: fmt.Sprintf(
					"source %d has %d characters, exceeding the Microsoft Translator limit of %d",
					i, n, microsoftMaxCharsPerText),
			}
		}
	}

	from := microsoftLanguageCode(req.SourceLocale)
	to := microsoftLanguageCode(req.TargetLocale)

	translations := make([]string, 0, len(req.Sources))
	for _, chunk := range microsoftChunkRanges(req.Sources) {
		chunkTranslations, err := c.translateChunk(ctx, from, to, req.Sources[chunk.start:chunk.end])
		if err != nil {
			return Response{}, err
		}
		translations = append(translations, chunkTranslations...)
	}

	return Response{Translations: translations}, nil
}

type microsoftChunkRange struct {
	start, end int
}

func microsoftChunkRanges(sources []string) []microsoftChunkRange {
	if len(sources) == 0 {
		return nil
	}

	var ranges []microsoftChunkRange
	start := 0
	count := 0
	chars := 0
	for i, s := range sources {
		n := microsoftCharCount(s)
		if i > start && (count+1 > microsoftMaxTextsPerRequest || chars+n > microsoftMaxCharsPerRequest) {
			ranges = append(ranges, microsoftChunkRange{start: start, end: i})
			start = i
			count = 0
			chars = 0
		}
		count++
		chars += n
	}
	ranges = append(ranges, microsoftChunkRange{start: start, end: len(sources)})
	return ranges
}

func microsoftCharCount(s string) int {
	n := 0
	for _, r := range s {
		n++
		if r > 0xFFFF {
			n++
		}
	}
	return n
}

func (c *MicrosoftClient) translateChunk(ctx context.Context, from, to string, sources []string) ([]string, error) {
	values := url.Values{}
	values.Set("api-version", microsoftAPIVersion)
	values.Set("from", from)
	values.Set("to", to)
	if c.customModel != "" {
		values.Set("category", c.customModel)
	}
	requestURL := c.baseURL + microsoftTranslatePath + "?" + values.Encode()

	body := make([]microsoftTranslateItem, len(sources))
	for i, s := range sources {
		body[i] = microsoftTranslateItem{Text: s}
	}

	var out []microsoftTranslateResult
	if err := c.request(ctx, http.MethodPost, requestURL, body, &out); err != nil {
		return nil, err
	}

	if len(out) != len(sources) {
		return nil, &Error{
			Code:    ErrorCodeUpstream,
			Message: fmt.Sprintf("Microsoft Translator returned %d results for %d inputs", len(out), len(sources)),
			Path:    microsoftTranslatePath,
		}
	}

	translations := make([]string, len(out))
	for i, result := range out {
		if len(result.Translations) != 1 {
			return nil, &Error{
				Code: ErrorCodeUpstream,
				Message: fmt.Sprintf(
					"Microsoft Translator returned %d translations for input %d, expected 1",
					len(result.Translations), i),
				Path: microsoftTranslatePath,
			}
		}
		translations[i] = result.Translations[0].Text
	}
	return translations, nil
}

func (c *MicrosoftClient) request(ctx context.Context, method, requestURL string, body, out any) error {
	encoded, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("mt: marshal microsoft translate request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, method, requestURL, bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("mt: build microsoft translate request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json; charset=UTF-8")
	httpReq.Header.Set("Ocp-Apim-Subscription-Key", c.subscriptionKey)
	httpReq.Header.Set("Ocp-Apim-Subscription-Region", c.region)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return &Error{
			Code:    ErrorCodeUpstreamUnavailable,
			Message: "could not reach Microsoft Translator",
			Path:    microsoftTranslatePath,
		}
	}
	defer func() { _ = resp.Body.Close() }()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return &Error{
			Code:    ErrorCodeUpstreamUnavailable,
			Message: "could not read Microsoft Translator response",
			Path:    microsoftTranslatePath,
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return microsoftHTTPError(resp.StatusCode, microsoftTranslatePath, respBody)
	}

	if err := json.Unmarshal(respBody, out); err != nil {
		return &Error{
			Code:       ErrorCodeUpstream,
			Message:    "Microsoft Translator returned invalid JSON",
			StatusCode: resp.StatusCode,
			Path:       microsoftTranslatePath,
		}
	}
	return nil
}

// Azure error codes that indicate an unsupported source/target language pair.
// 400079 is excluded because it indicates an invalid custom model.
var microsoftUnsupportedLanguagePairCodes = map[int]bool{
	400019: true, // one of the specified languages isn't supported
	400023: true, // one of the specified language pair isn't valid
	400035: true, // the source language ("From" field) isn't valid
	400036: true, // the target language ("To" field) is missing or invalid
	400075: true, // the language pair and category combination isn't valid
}

func microsoftHTTPError(statusCode int, path string, body []byte) *Error {
	var parsed microsoftErrorResponse
	_ = json.Unmarshal(body, &parsed)
	message := microsoftErrorMessage(statusCode, parsed)

	switch {
	case statusCode == http.StatusBadRequest && microsoftUnsupportedLanguagePairCodes[int(parsed.Error.Code)]:
		return &Error{Code: ErrorCodeUnsupportedLanguagePair, Message: message, StatusCode: statusCode, Path: path}
	case statusCode == http.StatusUnauthorized, statusCode == http.StatusForbidden:
		return &Error{Code: ErrorCodeAuthFailed, Message: message, StatusCode: statusCode, Path: path}
	case statusCode == http.StatusRequestTimeout:
		// Azure documents 408 as retryable for unavailable custom translation systems.
		return &Error{Code: ErrorCodeUpstreamUnavailable, Message: message, StatusCode: statusCode, Path: path}
	case statusCode == http.StatusTooManyRequests:
		return &Error{Code: ErrorCodeRateLimited, Message: message, StatusCode: statusCode, Path: path}
	case statusCode >= 500:
		return &Error{Code: ErrorCodeUpstreamUnavailable, Message: message, StatusCode: statusCode, Path: path}
	default:
		return &Error{Code: ErrorCodeUpstream, Message: message, StatusCode: statusCode, Path: path}
	}
}

func microsoftErrorMessage(statusCode int, parsed microsoftErrorResponse) string {
	if parsed.Error.Message != "" {
		return fmt.Sprintf("Microsoft Translator error (%d): %s", statusCode, parsed.Error.Message)
	}
	return fmt.Sprintf("Microsoft Translator error (%d)", statusCode)
}

var microsoftScriptOverrides = map[string]map[string]string{
	"zh":  {"Hans": "zh-Hans", "Hant": "zh-Hant"},
	"sr":  {"Cyrl": "sr-Cyrl", "Latn": "sr-Latn"},
	"mn":  {"Cyrl": "mn-Cyrl", "Mong": "mn-Mong"},
	"iu":  {"Latn": "iu-Latn"},
	"tlh": {"Latn": "tlh-Latn", "Piqd": "tlh-Piqd"},
}

var microsoftRegionOverrides = map[string]string{
	"pt-PT": "pt-pt",
	"fr-CA": "fr-ca",
}

var microsoftLegacyAliases = map[string]string{
	"no": "nb",  // Azure has no bare Norwegian code; Bokmål is the supported variant.
	"tl": "fil", // Tagalog's Azure-supported code is Filipino.
}

func microsoftLanguageCode(locale string) string {
	tag, err := language.Parse(locale)
	if err != nil {
		return locale
	}
	base, _ := tag.Base()
	code := base.String()

	if scripts, ok := microsoftScriptOverrides[code]; ok {
		if script, _ := tag.Script(); script.String() != "" {
			if candidate, ok := scripts[script.String()]; ok {
				return candidate
			}
		}
	}

	if region, conf := tag.Region(); conf == language.Exact {
		if candidate, ok := microsoftRegionOverrides[code+"-"+region.String()]; ok {
			return candidate
		}
	}

	if alias, ok := microsoftLegacyAliases[code]; ok {
		return alias
	}

	return code
}
