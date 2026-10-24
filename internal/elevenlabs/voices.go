package elevenlabs

import (
	"context"
	"regexp"
	"strings"
	"unicode"
)

var voiceIDPattern = regexp.MustCompile(`^[A-Za-z0-9]{16,}$`)

// ResolveVoice returns a voice id. Names are resolved against GET /v1/voices.
func (c *Client) ResolveVoice(ctx context.Context, voice string) (string, error) {
	trimmed := strings.TrimSpace(voice)
	if trimmed == "" {
		return "", newError(ErrorCodeValidation, "voice is required", "/v1/voices", 0)
	}
	if voiceIDPattern.MatchString(trimmed) {
		return trimmed, nil
	}
	voices, err := c.listVoices(ctx)
	if err != nil {
		return "", err
	}
	if id, ok := voices[normalizeVoiceName(trimmed)]; ok {
		return id, nil
	}
	return "", newError(ErrorCodeValidation, "unknown ElevenLabs voice", "/v1/voices", 0)
}

func (c *Client) listVoices(ctx context.Context) (map[string]string, error) {
	c.voicesMu.Lock()
	if len(c.voices) > 0 {
		out := copyVoiceMap(c.voices)
		c.voicesMu.Unlock()
		return out, nil
	}
	c.voicesMu.Unlock()

	var parsed struct {
		Voices []struct {
			VoiceID string `json:"voice_id"`
			Name    string `json:"name"`
		} `json:"voices"`
	}
	if err := c.doJSON(ctx, "GET", "/v1/voices", nil, &parsed); err != nil {
		return nil, err
	}

	voices := make(map[string]string, len(parsed.Voices))
	for _, voice := range parsed.Voices {
		id := strings.TrimSpace(voice.VoiceID)
		name := strings.TrimSpace(voice.Name)
		if id == "" || name == "" {
			continue
		}
		voices[normalizeVoiceName(name)] = id
	}

	c.voicesMu.Lock()
	c.voices = voices
	c.voicesMu.Unlock()
	return copyVoiceMap(voices), nil
}

func normalizeVoiceName(value string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(value)) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func copyVoiceMap(in map[string]string) map[string]string {
	out := make(map[string]string, len(in))
	for key, value := range in {
		out[key] = value
	}
	return out
}
