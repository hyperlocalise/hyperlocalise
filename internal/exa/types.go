package exa

import "encoding/json"

// SearchType selects an Exa retrieval mode. Omit or use SearchTypeAuto for
// the default balanced search.
type SearchType string

const (
	SearchTypeAuto     SearchType = "auto"
	SearchTypeLite     SearchType = "lite"
	SearchTypeDeepLite SearchType = "deep-lite"
	SearchTypeDeep     SearchType = "deep"
)

// SearchRequest is the body for POST /search.
//
// Only Query is required. Contents.Highlights is the recommended baseline for
// token-efficient excerpts. Set OutputSchema to receive synthesized JSON in
// SearchResponse.Output.
type SearchRequest struct {
	Query              string           `json:"query"`
	Type               SearchType       `json:"type,omitempty"`
	Category           string           `json:"category,omitempty"`
	NumResults         int              `json:"numResults,omitempty"`
	IncludeDomains     []string         `json:"includeDomains,omitempty"`
	ExcludeDomains     []string         `json:"excludeDomains,omitempty"`
	StartPublishedDate string           `json:"startPublishedDate,omitempty"`
	EndPublishedDate   string           `json:"endPublishedDate,omitempty"`
	UserLocation       *UserLocation    `json:"userLocation,omitempty"`
	Contents           *ContentsOptions `json:"contents,omitempty"`
	OutputSchema       *OutputSchema    `json:"outputSchema,omitempty"`
	Objective          string           `json:"objective,omitempty"`
	SystemPrompt       string           `json:"systemPrompt,omitempty"`
	UserIdentifier     string           `json:"userIdentifier,omitempty"`
	Moderation         *bool            `json:"moderation,omitempty"`
}

// ContentsOptions controls page text, highlights, summaries, and freshness on
// /search. Highlights and Text accept a bool or an options object.
type ContentsOptions struct {
	Highlights  any  `json:"highlights,omitempty"`
	Text        any  `json:"text,omitempty"`
	Summary     any  `json:"summary,omitempty"`
	MaxAgeHours *int `json:"maxAgeHours,omitempty"`
}

// OutputSchema is a JSON Schema for synthesized Search or Answer output.
//
// Search object schemas are limited to 10 properties in total (nested object
// and array-item properties count) and two levels of nesting.
type OutputSchema struct {
	Type                 string         `json:"type"`
	Description          string         `json:"description,omitempty"`
	Properties           map[string]any `json:"properties,omitempty"`
	Required             []string       `json:"required,omitempty"`
	AdditionalProperties *bool          `json:"additionalProperties,omitempty"`
}

// SearchResponse is the JSON body returned by POST /search.
type SearchResponse struct {
	RequestID  string           `json:"requestId,omitempty"`
	Results    []Result         `json:"results"`
	Output     *SynthesisOutput `json:"output,omitempty"`
	Cost       *CostDollars     `json:"costDollars,omitempty"`
	SearchTime float64          `json:"searchTime,omitempty"`
	Warnings   []Notice         `json:"warnings,omitempty"`
	Notices    []Notice         `json:"notices,omitempty"`
}

// SynthesisOutput is returned when the search request set OutputSchema.
type SynthesisOutput struct {
	Content   json.RawMessage      `json:"content"`
	Grounding []SynthesisGrounding `json:"grounding,omitempty"`
}

// SynthesisGrounding cites sources for one field in synthesized output.
type SynthesisGrounding struct {
	Field      string      `json:"field"`
	Citations  []SourceRef `json:"citations"`
	Confidence string      `json:"confidence,omitempty"`
}

// SourceRef is a title and URL pair used in grounding and citations.
type SourceRef struct {
	Title string `json:"title"`
	URL   string `json:"url"`
	ID    string `json:"id,omitempty"`
}

// Result is one ranked page from Search, Contents, or Answer citations.
type Result struct {
	Title         string   `json:"title"`
	URL           string   `json:"url"`
	PublishedDate string   `json:"publishedDate,omitempty"`
	Author        *string  `json:"author,omitempty"`
	ID            string   `json:"id,omitempty"`
	Image         string   `json:"image,omitempty"`
	Favicon       string   `json:"favicon,omitempty"`
	Text          string   `json:"text,omitempty"`
	Highlights    []string `json:"highlights,omitempty"`
	Summary       string   `json:"summary,omitempty"`
}

// Notice is a warning (developer-facing) or notice (model-facing) from Search.
type Notice struct {
	Code    string          `json:"code"`
	Path    string          `json:"path,omitempty"`
	Message string          `json:"message"`
	Details json.RawMessage `json:"details,omitempty"`
}

// CostDollars is the estimated dollar cost of a completed Exa request.
type CostDollars struct {
	Total    float64 `json:"total"`
	Summary  float64 `json:"summary,omitempty"`
	Search   any     `json:"search,omitempty"`
	Contents any     `json:"contents,omitempty"`
}

// ContentsRequest is the body for POST /contents.
//
// Supply URLs or document IDs from a prior search. Highlights and Text accept
// a bool or an options object, matching the Contents API (top-level fields,
// not nested under `contents`).
type ContentsRequest struct {
	URLs             []string `json:"urls,omitempty"`
	IDs              []string `json:"ids,omitempty"`
	Highlights       any      `json:"highlights,omitempty"`
	Text             any      `json:"text,omitempty"`
	Summary          any      `json:"summary,omitempty"`
	MaxAgeHours      *int     `json:"maxAgeHours,omitempty"`
	LivecrawlTimeout *int     `json:"livecrawlTimeout,omitempty"`
	UserIdentifier   string   `json:"userIdentifier,omitempty"`
}

// ContentsResponse is the JSON body returned by POST /contents.
type ContentsResponse struct {
	RequestID string          `json:"requestId,omitempty"`
	Results   []Result        `json:"results"`
	Statuses  []ContentStatus `json:"statuses,omitempty"`
	Cost      *CostDollars    `json:"costDollars,omitempty"`
}

// ContentStatus reports a per-URL fetch outcome. A failed URL does not fail
// the whole Contents request.
type ContentStatus struct {
	ID     string              `json:"id"`
	Status string              `json:"status"`
	Error  *ContentStatusError `json:"error,omitempty"`
}

// ContentStatusError is the URL-level failure from /contents.
type ContentStatusError struct {
	Tag            string `json:"tag"`
	HTTPStatusCode int    `json:"httpStatusCode,omitempty"`
}

// AnswerRequest is the body for POST /answer.
type AnswerRequest struct {
	Query          string        `json:"query"`
	Model          string        `json:"model,omitempty"`
	Text           *bool         `json:"text,omitempty"`
	SystemPrompt   string        `json:"systemPrompt,omitempty"`
	UserLocation   *UserLocation `json:"userLocation,omitempty"`
	OutputSchema   *OutputSchema `json:"outputSchema,omitempty"`
	UserIdentifier string        `json:"userIdentifier,omitempty"`
}

// AnswerResponse is the JSON body returned by POST /answer.
//
// Answer is a JSON string by default, or a structured object when OutputSchema
// is set.
type AnswerResponse struct {
	RequestID string          `json:"requestId,omitempty"`
	Answer    json.RawMessage `json:"answer"`
	Citations []Result        `json:"citations,omitempty"`
	Cost      *CostDollars    `json:"costDollars,omitempty"`
}
