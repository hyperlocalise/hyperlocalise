package elevenlabs

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	speechToTextPath     = "/v1/speech-to-text"
	forcedAlignmentPath  = "/v1/forced-alignment"
	defaultScribeModel   = "scribe_v2"
	maxScribeSpeakers    = 32
	maxScribeKeyterms    = 1000
	maxKeytermRunes      = 50
	maxKeytermWords      = 5
	forbiddenKeytermRune = "<>{}[]\\"
)

// TimedWord is one word of a transcript and where it is said, in seconds.
type TimedWord struct {
	Text  string
	Start float64
	End   float64
	// Speaker is the diarized speaker, when the transcript was diarized.
	Speaker string
}

// Transcript is what was said, word by word.
type Transcript struct {
	Text     string
	Language string
	Words    []TimedWord
}

// TranscriptionRequest transcribes the speech of a video or audio file.
type TranscriptionRequest struct {
	Media        []byte
	ContentType  string
	ModelID      string
	LanguageCode string
	// Diarize tells the speakers apart; Speakers caps how many there are.
	Diarize  bool
	Speakers int
	// Keyterms are words and phrases to favour: brand names, product terms.
	Keyterms []string
}

// AlignmentRequest times known text against the speech that says it.
type AlignmentRequest struct {
	Media       []byte
	ContentType string
	Text        string
}

type scribeResponse struct {
	LanguageCode string `json:"language_code"`
	Text         string `json:"text"`
	Words        []struct {
		Text      string   `json:"text"`
		Type      string   `json:"type"`
		Start     *float64 `json:"start"`
		End       *float64 `json:"end"`
		SpeakerID *string  `json:"speaker_id"`
	} `json:"words"`
}

type alignmentResponse struct {
	Words []struct {
		Text  string  `json:"text"`
		Start float64 `json:"start"`
		End   float64 `json:"end"`
	} `json:"words"`
}

// Transcribe returns the speech of the media as timed words. Spacing and
// audio events ("(laughter)") are left out.
func (c *Client) Transcribe(ctx context.Context, req TranscriptionRequest) (Transcript, error) {
	if len(req.Media) == 0 {
		return Transcript{}, newError(ErrorCodeValidation, "media is required", speechToTextPath, 0)
	}
	fields := url.Values{
		"model_id":               {firstNonEmpty(req.ModelID, defaultScribeModel)},
		"timestamps_granularity": {"word"},
		"tag_audio_events":       {"false"},
		"diarize":                {strconv.FormatBool(req.Diarize)},
	}
	if language := strings.TrimSpace(req.LanguageCode); language != "" {
		fields.Set("language_code", language)
	}
	if req.Diarize && req.Speakers > 0 {
		fields.Set("num_speakers", strconv.Itoa(min(req.Speakers, maxScribeSpeakers)))
	}
	for _, term := range Keyterms(req.Keyterms) {
		fields.Add("keyterms", term)
	}
	body, _, err := c.doMultipart(ctx, speechToTextPath, nil, fields, "file", req.Media, req.ContentType)
	if err != nil {
		return Transcript{}, err
	}
	var parsed scribeResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return Transcript{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned invalid JSON", speechToTextPath, 0)
	}
	out := Transcript{Text: strings.TrimSpace(parsed.Text), Language: parsed.LanguageCode, Words: []TimedWord{}}
	for _, word := range parsed.Words {
		text := strings.TrimSpace(word.Text)
		if text == "" || (word.Type != "" && word.Type != "word") || word.Start == nil || word.End == nil {
			continue
		}
		timed := TimedWord{Text: text, Start: *word.Start, End: *word.End}
		if word.SpeakerID != nil {
			timed.Speaker = *word.SpeakerID
		}
		out.Words = append(out.Words, timed)
	}
	return out, nil
}

// Align returns each word of the text with where the media says it.
func (c *Client) Align(ctx context.Context, req AlignmentRequest) (Transcript, error) {
	text := strings.TrimSpace(req.Text)
	if len(req.Media) == 0 {
		return Transcript{}, newError(ErrorCodeValidation, "media is required", forcedAlignmentPath, 0)
	}
	if text == "" {
		return Transcript{}, newError(ErrorCodeValidation, "text is required", forcedAlignmentPath, 0)
	}
	body, _, err := c.doMultipart(ctx, forcedAlignmentPath, nil, url.Values{"text": {text}}, "file", req.Media, req.ContentType)
	if err != nil {
		return Transcript{}, err
	}
	var parsed alignmentResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return Transcript{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned invalid JSON", forcedAlignmentPath, 0)
	}
	out := Transcript{Text: text, Words: make([]TimedWord, 0, len(parsed.Words))}
	for _, word := range parsed.Words {
		if trimmed := strings.TrimSpace(word.Text); trimmed != "" {
			out.Words = append(out.Words, TimedWord{Text: trimmed, Start: word.Start, End: word.End})
		}
	}
	return out, nil
}

// Keyterms keeps the terms ElevenLabs takes: at most 50 characters and 5
// words each, none of <>{}[]\, no duplicates, at most 1,000.
func Keyterms(terms []string) []string {
	out := make([]string, 0, len(terms))
	seen := map[string]bool{}
	for _, term := range terms {
		term = strings.Join(strings.Fields(term), " ")
		if term == "" || utf8.RuneCountInString(term) > maxKeytermRunes || len(strings.Fields(term)) > maxKeytermWords || strings.ContainsAny(term, forbiddenKeytermRune) {
			continue
		}
		key := strings.ToLower(term)
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, term)
		if len(out) == maxScribeKeyterms {
			break
		}
	}
	return out
}
