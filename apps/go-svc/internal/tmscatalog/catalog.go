// Package tmscatalog lists and exports the glossaries and translation memories
// held in a workspace's connected TMS, so go-svc can copy them into native ones.
// Callers mint the access token (see tmsauth); this package only spends it.
package tmscatalog

import (
	"context"
	"errors"
	"net/http"
	"strings"
)

// ErrUnsupported means the provider has no glossary or memory export here yet.
var ErrUnsupported = errors.New("tmscatalog: provider is not supported")

// HTTPDoer is the subset of http.Client the providers use.
type HTTPDoer interface {
	Do(req *http.Request) (*http.Response, error)
}

// Credentials is a minted provider token: where to call and the header to send.
type Credentials struct {
	BaseURL     string
	HeaderName  string
	HeaderValue string
}

// Resource is one glossary or translation memory in the TMS.
type Resource struct {
	ExternalID    string
	Name          string
	SourceLocale  *string
	TargetLocales []string
	// Count is terms for a glossary, segments for a memory, when the TMS says.
	Count *int
}

// Export is a glossary as TBX or a memory as TMX, ready for the interchange queue.
type Export struct {
	Format  string
	Content []byte
}

// Provider reads one TMS.
type Provider interface {
	ListGlossaries(ctx context.Context) ([]Resource, error)
	ListMemories(ctx context.Context) ([]Resource, error)
	// ExportGlossary returns TBX no larger than maxBytes.
	ExportGlossary(ctx context.Context, externalID string, maxBytes int64) (Export, error)
	// ExportMemory returns TMX no larger than maxBytes.
	ExportMemory(ctx context.Context, externalID string, maxBytes int64) (Export, error)
}

// Supported reports whether New can build a Provider for providerKind.
func Supported(providerKind string) bool {
	return strings.EqualFold(providerKind, "crowdin")
}

// New returns the Provider for providerKind, or ErrUnsupported.
func New(providerKind string, credentials Credentials, httpClient HTTPDoer) (Provider, error) {
	if httpClient == nil {
		httpClient = http.DefaultClient
	}
	switch strings.ToLower(providerKind) {
	case "crowdin":
		return newCrowdin(credentials, httpClient), nil
	default:
		return nil, ErrUnsupported
	}
}

// ProviderError is a TMS refusing a request, with its own message when it gave one.
type ProviderError struct {
	Status  int
	Message string
}

func (e *ProviderError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return "the TMS answered HTTP " + http.StatusText(e.Status)
}
