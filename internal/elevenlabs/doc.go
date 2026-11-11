// Package elevenlabs provides a typed HTTP client for the ElevenLabs audio API.
//
// The client covers the endpoints Iris generation needs:
//   - text-to-speech
//   - music composition
//   - sound-effect generation
//   - voice lookup by name or id
//
// Authentication uses an ElevenLabs API key (ELEVENLABS_API_KEY) sent as the
// xi-api-key header. The package is a library client and does not expose an
// HTTP route.
package elevenlabs
