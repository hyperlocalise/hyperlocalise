// Package gsc provides a typed HTTP client for the Google Search Console API.
//
// The client covers the endpoints needed for Domains SEO features:
//   - listing verified properties
//   - Search Analytics performance queries
//   - URL Inspection
//
// Authentication is OAuth 2.0. Pass an oauth2.TokenSource minted by the web
// app's Google Search Console connection; this package does not store or refresh
// tokens itself. Unlike DataForSEO, GSC calls are free and carry no billing
// metadata.
package gsc
