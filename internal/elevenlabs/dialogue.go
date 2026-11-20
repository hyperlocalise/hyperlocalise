package elevenlabs

import (
	"context"
	"net/http"
	"net/url"
	"strings"
	"unicode/utf8"
)

const (
	dialoguePath         = "/v1/text-to-dialogue"
	defaultDialogueModel = "eleven_v3"
	// MaxDialogueVoices is how many distinct voices one dialogue may use.
	MaxDialogueVoices = 10
	// MaxDialogueRunes bounds the text of every line of a dialogue together.
	MaxDialogueRunes = 2000
)

// DialogueLine is one turn of a dialogue: what is said, and in which voice.
type DialogueLine struct {
	Text string
	// Voice is a voice id or a voice's name.
	Voice string
}

// DialogueRequest voices several speakers in one take, with the turn-taking,
// interruptions and timing of a real conversation.
type DialogueRequest struct {
	Lines          []DialogueLine
	ModelID        string
	LanguageCode   string
	OutputFormat   string
	Pronunciations []PronunciationLocator
}

// CreateDialogue returns the whole conversation as one audio file.
func (c *Client) CreateDialogue(ctx context.Context, req DialogueRequest) (Audio, error) {
	if len(req.Lines) == 0 {
		return Audio{}, newError(ErrorCodeValidation, "lines are required", dialoguePath, 0)
	}
	inputs := make([]map[string]string, 0, len(req.Lines))
	voices := map[string]bool{}
	runes := 0
	for _, line := range req.Lines {
		text := strings.TrimSpace(line.Text)
		if text == "" {
			return Audio{}, newError(ErrorCodeValidation, "every line needs text", dialoguePath, 0)
		}
		voiceID, err := c.ResolveVoice(ctx, line.Voice)
		if err != nil {
			return Audio{}, err
		}
		voices[voiceID] = true
		runes += utf8.RuneCountInString(text)
		inputs = append(inputs, map[string]string{"text": text, "voice_id": voiceID})
	}
	if len(voices) > MaxDialogueVoices {
		return Audio{}, newError(ErrorCodeValidation, "a dialogue takes at most 10 voices", dialoguePath, 0)
	}
	if runes > MaxDialogueRunes {
		return Audio{}, newError(ErrorCodeValidation, "a dialogue takes at most 2,000 characters", dialoguePath, 0)
	}
	payload := map[string]any{
		"inputs":   inputs,
		"model_id": firstNonEmpty(req.ModelID, defaultDialogueModel),
	}
	if language := strings.TrimSpace(req.LanguageCode); language != "" {
		payload["language_code"] = language
	}
	if locators := pronunciationLocators(req.Pronunciations); len(locators) > 0 {
		payload["pronunciation_dictionary_locators"] = locators
	}
	query := url.Values{}
	query.Set("output_format", firstNonEmpty(req.OutputFormat, defaultOutputFormat))
	body, contentType, err := c.do(ctx, http.MethodPost, dialoguePath, query, payload)
	if err != nil {
		return Audio{}, err
	}
	if len(body) == 0 {
		return Audio{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned empty audio", dialoguePath, 0)
	}
	return Audio{Bytes: body, ContentType: audioContentType(contentType, "audio/mpeg")}, nil
}
