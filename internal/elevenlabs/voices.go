package elevenlabs

import (
	"context"
	"regexp"
	"strings"
	"unicode"
)

var voiceIDPattern = regexp.MustCompile(`^[A-Za-z0-9]{16,}$`)

const premadeVoiceCategory = "premade"

// ResolveVoice returns a voice id. Names are resolved against the premade
// voices of GET /v1/voices only: the account also holds the voices that
// workspaces clone or design, and a name must never reach another
// workspace's voice. Callers resolve a workspace's own voices themselves.
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
	if id, ok := voices[NormalizeVoiceName(trimmed)]; ok {
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
			VoiceID  string `json:"voice_id"`
			Name     string `json:"name"`
			Category string `json:"category"`
		} `json:"voices"`
	}
	if err := c.doJSON(ctx, "GET", voicesPath, nil, &parsed); err != nil {
		return nil, err
	}

	voices := make(map[string]string, len(parsed.Voices))
	for _, voice := range parsed.Voices {
		id := strings.TrimSpace(voice.VoiceID)
		name := strings.TrimSpace(voice.Name)
		if id == "" || name == "" || voice.Category != premadeVoiceCategory {
			continue
		}
		voices[NormalizeVoiceName(name)] = id
	}

	c.voicesMu.Lock()
	c.voices = voices
	c.voicesMu.Unlock()
	return copyVoiceMap(voices), nil
}

// NormalizeVoiceName is the key a voice name is matched by: lower case,
// letters and digits only.
func NormalizeVoiceName(value string) string {
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
