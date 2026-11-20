package elevenlabs

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

const (
	voiceDesignPath         = "/v1/text-to-voice/design"
	voiceCreatePath         = "/v1/text-to-voice"
	defaultVoiceDesignModel = "eleven_ttv_v3"
	maxVoiceDescriptionRune = 1000
	minVoicePreviewTextRune = 100
	maxVoicePreviewTextRune = 1000
)

// VoiceDesignRequest describes a voice in words for ElevenLabs to make.
type VoiceDesignRequest struct {
	Description string
	// Text is what the previews say, 100–1,000 characters; ElevenLabs writes
	// a line that suits the voice when it is empty.
	Text         string
	ModelID      string
	OutputFormat string
}

// VoicePreview is one take on a designed voice. GeneratedVoiceID saves it
// as a voice of its own.
type VoicePreview struct {
	GeneratedVoiceID string
	Audio            Audio
	DurationSeconds  float64
	Language         string
}

// SaveVoiceRequest keeps a designed preview as a voice speech can use.
type SaveVoiceRequest struct {
	GeneratedVoiceID string
	Name             string
	Description      string
	Labels           map[string]string
}

type voiceDesignResponse struct {
	Previews []struct {
		AudioBase64      string  `json:"audio_base_64"`
		GeneratedVoiceID string  `json:"generated_voice_id"`
		MediaType        string  `json:"media_type"`
		DurationSecs     float64 `json:"duration_secs"`
		Language         string  `json:"language"`
	} `json:"previews"`
	Text string `json:"text"`
}

// DesignVoice returns a few previews of the described voice, and the text
// they say.
func (c *Client) DesignVoice(ctx context.Context, req VoiceDesignRequest) ([]VoicePreview, string, error) {
	description := strings.TrimSpace(req.Description)
	if description == "" {
		return nil, "", newError(ErrorCodeValidation, "a voice description is required", voiceDesignPath, 0)
	}
	if utf8.RuneCountInString(description) > maxVoiceDescriptionRune {
		return nil, "", newError(ErrorCodeValidation, "a voice description takes at most 1,000 characters", voiceDesignPath, 0)
	}
	payload := map[string]any{
		"voice_description": description,
		"model_id":          firstNonEmpty(req.ModelID, defaultVoiceDesignModel),
	}
	if text := strings.TrimSpace(req.Text); text != "" {
		runes := utf8.RuneCountInString(text)
		if runes < minVoicePreviewTextRune || runes > maxVoicePreviewTextRune {
			return nil, "", newError(ErrorCodeValidation, "preview text takes 100 to 1,000 characters", voiceDesignPath, 0)
		}
		payload["text"] = text
	} else {
		payload["auto_generate_text"] = true
	}
	query := url.Values{}
	query.Set("output_format", firstNonEmpty(req.OutputFormat, defaultOutputFormat))
	body, _, err := c.do(ctx, http.MethodPost, voiceDesignPath, query, payload)
	if err != nil {
		return nil, "", err
	}
	var parsed voiceDesignResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, "", newError(ErrorCodeInvalidResponse, "ElevenLabs returned invalid JSON", voiceDesignPath, 0)
	}
	previews := make([]VoicePreview, 0, len(parsed.Previews))
	for _, preview := range parsed.Previews {
		audio, err := base64.StdEncoding.DecodeString(preview.AudioBase64)
		if err != nil || len(audio) == 0 || strings.TrimSpace(preview.GeneratedVoiceID) == "" {
			continue
		}
		previews = append(previews, VoicePreview{
			GeneratedVoiceID: preview.GeneratedVoiceID,
			Audio:            Audio{Bytes: audio, ContentType: audioContentType(preview.MediaType, "audio/mpeg")},
			DurationSeconds:  preview.DurationSecs,
			Language:         preview.Language,
		})
	}
	if len(previews) == 0 {
		return nil, "", newError(ErrorCodeInvalidResponse, "ElevenLabs returned no voice previews", voiceDesignPath, 0)
	}
	return previews, parsed.Text, nil
}

// SaveVoice keeps a designed preview as a voice and returns its voice id.
func (c *Client) SaveVoice(ctx context.Context, req SaveVoiceRequest) (string, error) {
	generated := strings.TrimSpace(req.GeneratedVoiceID)
	name := strings.TrimSpace(req.Name)
	if generated == "" || name == "" {
		return "", newError(ErrorCodeValidation, "a generated voice id and a name are required", voiceCreatePath, 0)
	}
	payload := map[string]any{
		"voice_name":         name,
		"voice_description":  firstNonEmpty(req.Description, name),
		"generated_voice_id": generated,
	}
	if len(req.Labels) > 0 {
		payload["labels"] = req.Labels
	}
	var created struct {
		VoiceID string `json:"voice_id"`
	}
	if err := c.doJSON(ctx, http.MethodPost, voiceCreatePath, payload, &created); err != nil {
		return "", err
	}
	if strings.TrimSpace(created.VoiceID) == "" {
		return "", newError(ErrorCodeInvalidResponse, "ElevenLabs returned no voice id", voiceCreatePath, 0)
	}
	return created.VoiceID, nil
}
