// Package dataforseo provides a typed HTTP client for the DataForSEO API.
//
// The client is organized into feature groups that mirror the Domains SEO
// roadmap:
//   - Labs: keyword research and domain overview
//   - SERP: live SERP inspection and rank tracking
//   - AI: brand lookup (LLM mentions) and prompt explorer (LLM responses)
//
// Authentication uses a base64-encoded API key (DATAFORSEO_API_KEY). Login and
// password fields exist for programmatic config only. Every successful call
// returns provider billing metadata alongside the parsed payload so upstream
// services can meter usage later.
package dataforseo
