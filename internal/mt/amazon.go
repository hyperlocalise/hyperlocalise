package mt

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"strings"
	"time"

	"golang.org/x/text/language"
)

const (
	amazonServiceName = "translate"

	amazonTargetHeader = "AWSShineFrontendService_20170701.TranslateText"

	amazonTranslateAction = "TranslateText"

	// TranslateText limits Text to 10,000 UTF-8 bytes.
	amazonMaxTextBytes = 10000
)

// AmazonClient translates text using Amazon Translate's TranslateText API,
// authenticating requests with AWS Signature Version 4.
type AmazonClient struct {
	accessKeyID     string
	secretAccessKey string
	sessionToken    string
	region          string
	baseURL         string
	httpClient      *http.Client
}

var _ Engine = (*AmazonClient)(nil)

// NewAmazonClient creates an Amazon Translate client.
func NewAmazonClient(cfg Config) (*AmazonClient, error) {
	if strings.TrimSpace(cfg.AccessKeyID) == "" {
		return nil, &Error{Code: ErrorCodeValidation, Message: "access key ID is required"}
	}
	if strings.TrimSpace(cfg.SecretAccessKey) == "" {
		return nil, &Error{Code: ErrorCodeValidation, Message: "secret access key is required"}
	}
	region := strings.TrimSpace(cfg.Region)
	if region == "" {
		return nil, &Error{Code: ErrorCodeValidation, Message: "region is required"}
	}

	baseURL := cfg.BaseURL
	if baseURL == "" {
		baseURL = fmt.Sprintf("https://translate.%s.amazonaws.com", region)
	}

	return &AmazonClient{
		accessKeyID:     cfg.AccessKeyID,
		secretAccessKey: cfg.SecretAccessKey,
		sessionToken:    cfg.SessionToken,
		region:          region,
		baseURL:         strings.TrimRight(baseURL, "/"),
		httpClient:      cfg.httpClient(),
	}, nil
}

type amazonTranslateRequest struct {
	Text               string `json:"Text"`
	SourceLanguageCode string `json:"SourceLanguageCode"`
	TargetLanguageCode string `json:"TargetLanguageCode"`
}

type amazonTranslateResponse struct {
	TranslatedText string `json:"TranslatedText"`
}

type amazonErrorResponse struct {
	Type       string `json:"__type"`
	Code       string `json:"code"`
	Message    string `json:"message"`
	MessageCap string `json:"Message"`
}

// Translate implements Engine using Amazon Translate.
func (c *AmazonClient) Translate(ctx context.Context, req Request) (Response, error) {
	if err := validateRequest(req); err != nil {
		return Response{}, err
	}

	for i, s := range req.Sources {
		if n := len(s); n == 0 || n > amazonMaxTextBytes {
			return Response{}, &Error{
				Code: ErrorCodeValidation,
				Message: fmt.Sprintf(
					"source %d must be between 1 and %d bytes, got %d", i, amazonMaxTextBytes, n),
			}
		}
	}

	sourceCode := amazonLanguageCode(req.SourceLocale)
	targetCode := amazonLanguageCode(req.TargetLocale)

	translations := make([]string, len(req.Sources))
	for i, s := range req.Sources {
		if err := ctx.Err(); err != nil {
			return Response{}, err
		}
		translated, err := c.translateOne(ctx, sourceCode, targetCode, s)
		if err != nil {
			return Response{}, err
		}
		translations[i] = translated
	}
	return Response{Translations: translations}, nil
}

func (c *AmazonClient) translateOne(ctx context.Context, sourceCode, targetCode, text string) (string, error) {
	body := amazonTranslateRequest{
		Text:               text,
		SourceLanguageCode: sourceCode,
		TargetLanguageCode: targetCode,
	}

	var out amazonTranslateResponse
	if err := c.request(ctx, body, &out); err != nil {
		return "", err
	}
	return out.TranslatedText, nil
}

func (c *AmazonClient) request(ctx context.Context, body, out any) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("mt: marshal amazon translate request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/", bytes.NewReader(encoded))
	if err != nil {
		return fmt.Errorf("mt: build amazon translate request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/x-amz-json-1.1")
	httpReq.Header.Set("X-Amz-Target", amazonTargetHeader)
	c.sign(httpReq, encoded, time.Now().UTC())

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return &Error{
			Code:    ErrorCodeUpstreamUnavailable,
			Message: "could not reach Amazon Translate",
			Path:    amazonTranslateAction,
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
			Message: "could not read Amazon Translate response",
			Path:    amazonTranslateAction,
		}
	}

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return amazonHTTPError(resp.StatusCode, resp.Header.Get("X-Amzn-Errortype"), respBody)
	}

	if err := json.Unmarshal(respBody, out); err != nil {
		return &Error{
			Code:       ErrorCodeUpstream,
			Message:    "Amazon Translate returned invalid JSON",
			StatusCode: resp.StatusCode,
			Path:       amazonTranslateAction,
		}
	}
	return nil
}

// SigV4/credential errors Amazon returns as HTTP 400.
var amazonAuthErrorTypes = map[string]bool{
	"UnrecognizedClientException":         true,
	"InvalidSignatureException":           true,
	"IncompleteSignatureException":        true,
	"MissingAuthenticationTokenException": true,
	"AccessDeniedException":               true,
	"ExpiredTokenException":               true,
}

func amazonHTTPError(statusCode int, headerType string, body []byte) *Error {
	var parsed amazonErrorResponse
	_ = json.Unmarshal(body, &parsed)
	errType := amazonErrorType(headerType, parsed)
	message := amazonErrorMessage(statusCode, parsed)

	switch {
	case statusCode == http.StatusBadRequest && errType == "UnsupportedLanguagePairException":
		return &Error{Code: ErrorCodeUnsupportedLanguagePair, Message: message, StatusCode: statusCode, Path: amazonTranslateAction}
	case statusCode == http.StatusBadRequest && errType == "TooManyRequestsException":
		return &Error{Code: ErrorCodeRateLimited, Message: message, StatusCode: statusCode, Path: amazonTranslateAction}
	case statusCode == http.StatusUnauthorized, statusCode == http.StatusForbidden:
		return &Error{Code: ErrorCodeAuthFailed, Message: message, StatusCode: statusCode, Path: amazonTranslateAction}
	case statusCode == http.StatusBadRequest && amazonAuthErrorTypes[errType]:
		return &Error{Code: ErrorCodeAuthFailed, Message: message, StatusCode: statusCode, Path: amazonTranslateAction}
	case statusCode >= 500:
		return &Error{Code: ErrorCodeUpstreamUnavailable, Message: message, StatusCode: statusCode, Path: amazonTranslateAction}
	default:
		return &Error{Code: ErrorCodeUpstream, Message: message, StatusCode: statusCode, Path: amazonTranslateAction}
	}
}

// Resolve the error type from the header, then "__type", then "code".
func amazonErrorType(headerType string, parsed amazonErrorResponse) string {
	if headerType != "" {
		return sanitizeAmazonErrorType(headerType)
	}
	if parsed.Type != "" {
		return sanitizeAmazonErrorType(parsed.Type)
	}
	return sanitizeAmazonErrorType(parsed.Code)
}

// Strip AWS error namespace and HTTP-status decorations.
func sanitizeAmazonErrorType(errType string) string {
	if idx := strings.IndexByte(errType, '#'); idx != -1 {
		errType = errType[idx+1:]
	}
	if idx := strings.IndexByte(errType, ':'); idx != -1 {
		errType = errType[:idx]
	}
	return errType
}

func amazonErrorMessage(statusCode int, parsed amazonErrorResponse) string {
	msg := parsed.Message
	if msg == "" {
		msg = parsed.MessageCap
	}
	if msg != "" {
		return fmt.Sprintf("Amazon Translate error (%d): %s", statusCode, msg)
	}
	return fmt.Sprintf("Amazon Translate error (%d)", statusCode)
}

// Region-qualified Amazon codes; pt-BR normalizes to bare "pt".
var amazonRegionOverrides = map[string]map[string]string{
	"fr": {"CA": "fr-CA"},
	"es": {"MX": "es-MX"},
	"pt": {"PT": "pt-PT"},
	"fa": {"AF": "fa-AF"},
}

func amazonLanguageCode(locale string) string {
	tag, err := language.Parse(locale)
	if err != nil {
		return locale
	}
	base, _ := tag.Base()
	baseCode := base.String()

	if baseCode == "zh" {
		if script, conf := tag.Script(); conf == language.Exact && script.String() == "Hant" {
			return "zh-TW"
		}
		if region, conf := tag.Region(); conf == language.Exact {
			switch region.String() {
			case "TW", "HK", "MO":
				return "zh-TW"
			}
		}
		return "zh"
	}

	if overrides, ok := amazonRegionOverrides[baseCode]; ok {
		if region, conf := tag.Region(); conf == language.Exact {
			if code, ok := overrides[region.String()]; ok {
				return code
			}
		}
	}
	return baseCode
}

func (c *AmazonClient) sign(req *http.Request, payload []byte, now time.Time) {
	const amzDateLayout = "20060102T150405Z"
	const dateLayout = "20060102"

	amzDate := now.Format(amzDateLayout)
	dateStamp := now.Format(dateLayout)
	payloadHash := sha256Hex(payload)

	req.Header.Set("Host", req.URL.Host)
	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	if c.sessionToken != "" {
		req.Header.Set("X-Amz-Security-Token", c.sessionToken)
	}

	signedHeaderNames := []string{"content-type", "host", "x-amz-content-sha256", "x-amz-date", "x-amz-target"}
	if c.sessionToken != "" {
		signedHeaderNames = append(signedHeaderNames, "x-amz-security-token")
	}
	sort.Strings(signedHeaderNames)

	var canonicalHeaders strings.Builder
	for _, name := range signedHeaderNames {
		canonicalHeaders.WriteString(name)
		canonicalHeaders.WriteString(":")
		canonicalHeaders.WriteString(strings.TrimSpace(req.Header.Get(name)))
		canonicalHeaders.WriteString("\n")
	}
	signedHeaders := strings.Join(signedHeaderNames, ";")

	canonicalRequest := strings.Join([]string{
		req.Method,
		req.URL.EscapedPath(),
		"",
		canonicalHeaders.String(),
		signedHeaders,
		payloadHash,
	}, "\n")

	credentialScope := strings.Join([]string{dateStamp, c.region, amazonServiceName, "aws4_request"}, "/")
	stringToSign := strings.Join([]string{
		"AWS4-HMAC-SHA256",
		amzDate,
		credentialScope,
		sha256Hex([]byte(canonicalRequest)),
	}, "\n")

	signingKey := amazonSigningKey(c.secretAccessKey, dateStamp, c.region)
	signature := hex.EncodeToString(hmacSHA256(signingKey, stringToSign))

	req.Header.Set("Authorization", strings.Join([]string{
		"AWS4-HMAC-SHA256 Credential=" + c.accessKeyID + "/" + credentialScope,
		"SignedHeaders=" + signedHeaders,
		"Signature=" + signature,
	}, ", "))
}

func amazonSigningKey(secretAccessKey, dateStamp, region string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+secretAccessKey), dateStamp)
	kRegion := hmacSHA256(kDate, region)
	kService := hmacSHA256(kRegion, amazonServiceName)
	return hmacSHA256(kService, "aws4_request")
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write([]byte(data))
	return h.Sum(nil)
}

func sha256Hex(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}
