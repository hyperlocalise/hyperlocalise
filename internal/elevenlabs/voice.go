package elevenlabs

import (
	"context"
	"net/url"
	"strconv"
)

const (
	audioIsolationPath      = "/v1/audio-isolation"
	speechToSpeechPath      = "/v1/speech-to-speech"
	defaultSpeechToSpeechID = "eleven_multilingual_sts_v2"
)

// IsolationRequest takes the speech out of a video or audio file, leaving
// its music, noise and room behind.
type IsolationRequest struct {
	Media       []byte
	ContentType string
}

// VoiceChangeRequest re-voices the speech of a video or audio file in
// another voice, keeping its timing and delivery.
type VoiceChangeRequest struct {
	Media       []byte
	ContentType string
	// Voice is a voice id or a voice's name.
	Voice   string
	ModelID string
	// RemoveBackgroundNoise takes noise out of the speech before it is re-voiced.
	RemoveBackgroundNoise bool
	OutputFormat          string
}

// IsolateVoice returns the speech of the media alone, as long as the media.
func (c *Client) IsolateVoice(ctx context.Context, req IsolationRequest) (Audio, error) {
	if len(req.Media) == 0 {
		return Audio{}, newError(ErrorCodeValidation, "media is required", audioIsolationPath, 0)
	}
	body, contentType, err := c.doMultipart(ctx, audioIsolationPath, nil, nil, "audio", req.Media, req.ContentType)
	if err != nil {
		return Audio{}, err
	}
	if len(body) == 0 {
		return Audio{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned empty audio", audioIsolationPath, 0)
	}
	return Audio{Bytes: body, ContentType: audioContentType(contentType, "audio/mpeg")}, nil
}

// ChangeVoice returns the speech of the media in the requested voice.
func (c *Client) ChangeVoice(ctx context.Context, req VoiceChangeRequest) (Audio, error) {
	if len(req.Media) == 0 {
		return Audio{}, newError(ErrorCodeValidation, "media is required", speechToSpeechPath, 0)
	}
	voiceID, err := c.ResolveVoice(ctx, req.Voice)
	if err != nil {
		return Audio{}, err
	}
	fields := url.Values{
		"model_id":                {firstNonEmpty(req.ModelID, defaultSpeechToSpeechID)},
		"remove_background_noise": {strconv.FormatBool(req.RemoveBackgroundNoise)},
	}
	query := url.Values{}
	query.Set("output_format", firstNonEmpty(req.OutputFormat, defaultOutputFormat))
	body, contentType, err := c.doMultipart(ctx, speechToSpeechPath+"/"+url.PathEscape(voiceID), query, fields, "audio", req.Media, req.ContentType)
	if err != nil {
		return Audio{}, err
	}
	if len(body) == 0 {
		return Audio{}, newError(ErrorCodeInvalidResponse, "ElevenLabs returned empty audio", speechToSpeechPath, 0)
	}
	return Audio{Bytes: body, ContentType: audioContentType(contentType, "audio/mpeg")}, nil
}
