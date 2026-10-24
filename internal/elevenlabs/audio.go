package elevenlabs

import (
	"context"
	"net/url"
	"strings"
)

const (
	defaultSpeechModel      = "eleven_multilingual_v2"
	defaultMusicModel       = "music_v1"
	defaultSoundEffectModel = "eleven_text_to_sound_v2"
	defaultOutputFormat     = "mp3_44100_128"

	minMusicLengthMS = 3000
	maxMusicLengthMS = 600000
	minSFXSeconds    = 0.5
	maxSFXSeconds    = 30
)

// Audio is a generated audio payload.
type Audio struct {
	Bytes       []byte
	ContentType string
}

// SpeechRequest converts text to speech.
type SpeechRequest struct {
	Text         string
	Voice        string
	ModelID      string
	LanguageCode string
	OutputFormat string
}

// MusicRequest composes a song from a prompt.
type MusicRequest struct {
	Prompt          string
	ModelID         string
	DurationSeconds float64
	OutputFormat    string
}

// SoundEffectRequest turns a prompt into a sound effect.
type SoundEffectRequest struct {
	Text            string
	ModelID         string
	DurationSeconds float64
	OutputFormat    string
}

// CreateSpeech converts text into speech for the requested voice.
func (c *Client) CreateSpeech(ctx context.Context, req SpeechRequest) (Audio, error) {
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return Audio{}, newError(ErrorCodeValidation, "text is required", "/v1/text-to-speech", 0)
	}
	voiceID, err := c.ResolveVoice(ctx, req.Voice)
	if err != nil {
		return Audio{}, err
	}
	payload := map[string]any{
		"text":     text,
		"model_id": firstNonEmpty(req.ModelID, defaultSpeechModel),
	}
	if language := strings.TrimSpace(req.LanguageCode); language != "" {
		payload["language_code"] = language
	}
	query := url.Values{}
	query.Set("output_format", firstNonEmpty(req.OutputFormat, defaultOutputFormat))
	body, contentType, err := c.do(ctx, "POST", "/v1/text-to-speech/"+url.PathEscape(voiceID), query, payload)
	if err != nil {
		return Audio{}, err
	}
	if len(body) == 0 {
		return Audio{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned empty audio", "/v1/text-to-speech", 0)
	}
	return Audio{Bytes: body, ContentType: audioContentType(contentType, "audio/mpeg")}, nil
}

// ComposeMusic composes a song from a prompt.
func (c *Client) ComposeMusic(ctx context.Context, req MusicRequest) (Audio, error) {
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		return Audio{}, newError(ErrorCodeValidation, "prompt is required", "/v1/music", 0)
	}
	payload := map[string]any{
		"prompt":   prompt,
		"model_id": firstNonEmpty(req.ModelID, defaultMusicModel),
	}
	if req.DurationSeconds > 0 {
		payload["music_length_ms"] = clampInt(int(req.DurationSeconds*1000), minMusicLengthMS, maxMusicLengthMS)
	}
	query := url.Values{}
	query.Set("output_format", firstNonEmpty(req.OutputFormat, defaultOutputFormat))
	body, contentType, err := c.do(ctx, "POST", "/v1/music", query, payload)
	if err != nil {
		return Audio{}, err
	}
	if len(body) == 0 {
		return Audio{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned empty audio", "/v1/music", 0)
	}
	return Audio{Bytes: body, ContentType: audioContentType(contentType, "audio/mpeg")}, nil
}

// CreateSoundEffect turns a prompt into a sound effect.
func (c *Client) CreateSoundEffect(ctx context.Context, req SoundEffectRequest) (Audio, error) {
	text := strings.TrimSpace(req.Text)
	if text == "" {
		return Audio{}, newError(ErrorCodeValidation, "text is required", "/v1/sound-generation", 0)
	}
	payload := map[string]any{
		"text":     text,
		"model_id": firstNonEmpty(req.ModelID, defaultSoundEffectModel),
	}
	if req.DurationSeconds > 0 {
		payload["duration_seconds"] = clampFloat(req.DurationSeconds, minSFXSeconds, maxSFXSeconds)
	}
	query := url.Values{}
	query.Set("output_format", firstNonEmpty(req.OutputFormat, defaultOutputFormat))
	body, contentType, err := c.do(ctx, "POST", "/v1/sound-generation", query, payload)
	if err != nil {
		return Audio{}, err
	}
	if len(body) == 0 {
		return Audio{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned empty audio", "/v1/sound-generation", 0)
	}
	return Audio{Bytes: body, ContentType: audioContentType(contentType, "audio/mpeg")}, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func clampInt(value, min, max int) int {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func clampFloat(value, min, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
