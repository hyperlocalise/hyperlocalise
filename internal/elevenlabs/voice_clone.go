package elevenlabs

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

const (
	voiceAddPath = "/v1/voices/add"
	voicesPath   = "/v1/voices"
	// MaxCloneSamples is how many recordings one instant clone takes.
	MaxCloneSamples = 25
)

// VoiceSample is one recording of the speaker a clone learns from.
type VoiceSample struct {
	Bytes       []byte
	ContentType string
}

// CloneVoiceRequest makes an instant voice clone from recordings of a
// speaker who agreed to be cloned.
type CloneVoiceRequest struct {
	Name        string
	Description string
	Labels      map[string]string
	Samples     []VoiceSample
	// RemoveBackgroundNoise cleans the samples first; it can hurt samples
	// that are already clean.
	RemoveBackgroundNoise bool
}

// CloneVoice makes an instant voice clone and returns its voice id.
func (c *Client) CloneVoice(ctx context.Context, req CloneVoiceRequest) (string, error) {
	name := strings.TrimSpace(req.Name)
	if name == "" {
		return "", newError(ErrorCodeValidation, "a voice name is required", voiceAddPath, 0)
	}
	if len(req.Samples) == 0 {
		return "", newError(ErrorCodeValidation, "at least one voice sample is required", voiceAddPath, 0)
	}
	if len(req.Samples) > MaxCloneSamples {
		return "", newError(ErrorCodeValidation, fmt.Sprintf("a clone takes at most %d samples", MaxCloneSamples), voiceAddPath, 0)
	}
	files := make([]multipartFile, 0, len(req.Samples))
	for i, sample := range req.Samples {
		if len(sample.Bytes) == 0 {
			return "", newError(ErrorCodeValidation, "a voice sample is empty", voiceAddPath, 0)
		}
		files = append(files, multipartFile{
			Field:       "files",
			Name:        "sample-" + strconv.Itoa(i+1),
			Bytes:       sample.Bytes,
			ContentType: sample.ContentType,
		})
	}
	fields := url.Values{}
	fields.Set("name", name)
	if description := strings.TrimSpace(req.Description); description != "" {
		fields.Set("description", description)
	}
	if len(req.Labels) > 0 {
		labels, err := json.Marshal(req.Labels)
		if err != nil {
			return "", fmt.Errorf("elevenlabs: encode labels: %w", err)
		}
		fields.Set("labels", string(labels))
	}
	fields.Set("remove_background_noise", strconv.FormatBool(req.RemoveBackgroundNoise))
	body, _, err := c.doMultipartFiles(ctx, voiceAddPath, nil, fields, files)
	if err != nil {
		return "", err
	}
	var created struct {
		VoiceID string `json:"voice_id"`
	}
	if err := json.Unmarshal(body, &created); err != nil {
		return "", newError(ErrorCodeInvalidResponse, "ElevenLabs returned invalid JSON", voiceAddPath, 0)
	}
	if strings.TrimSpace(created.VoiceID) == "" {
		return "", newError(ErrorCodeInvalidResponse, "ElevenLabs returned no voice id", voiceAddPath, 0)
	}
	return created.VoiceID, nil
}

// DeleteVoice removes a voice from the account. A voice that is already
// gone counts as deleted.
func (c *Client) DeleteVoice(ctx context.Context, voiceID string) error {
	id := strings.TrimSpace(voiceID)
	if !voiceIDPattern.MatchString(id) {
		return newError(ErrorCodeValidation, "a voice id is required", voicesPath, 0)
	}
	_, _, err := c.do(ctx, http.MethodDelete, voicesPath+"/"+url.PathEscape(id), nil, nil)
	if typed, ok := AsError(err); ok && typed.StatusCode == http.StatusNotFound {
		return nil
	}
	return err
}
