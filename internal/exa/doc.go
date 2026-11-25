// Package exa provides a typed HTTP client for the Exa Search API.
//
// The client covers the Exa endpoints needed to pull live localisation
// context for a target market:
//   - Search: natural-language web search with optional page contents and
//     structured synthesis
//   - Contents: text, highlights, and summaries for known URLs
//   - Answer: a cited answer grounded in Exa search results
//   - MarketContext: a localisation brief (local competitors, cultural
//     references, trending terms, and advertising rules)
//
// Authentication uses an Exa API key (EXA_API_KEY) sent as `x-api-key`.
// The package is a library client and does not expose an HTTP route.
package exa
