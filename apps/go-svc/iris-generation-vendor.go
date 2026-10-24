package main

import (
	"context"
	"encoding/base64"
	"fmt"
	"net/url"
	"os"
	"path"
	"strings"
	"time"

	"github.com/hyperlocalise/hyperlocalise/internal/elevenlabs"
	"github.com/hyperlocalise/hyperlocalise/internal/fal"
)

type irisMediaFetcher func(context.Context, string) ([]byte, string, error)

type irisCompositeProvider struct {
	gateway    irisGenerationProvider
	elevenlabs *elevenlabs.Client
	fal        *fal.Client
	fetch      irisMediaFetcher
}

func newIrisGenerationProvider() irisGenerationProvider {
	provider := &irisCompositeProvider{
		gateway: newIrisGatewayProvider(),
		fetch:   fetchHTTPS,
	}
	if key := strings.TrimSpace(os.Getenv("ELEVENLABS_API_KEY")); key != "" {
		if client, err := elevenlabs.NewClient(elevenlabs.Config{
			APIKey:  key,
			BaseURL: strings.TrimSpace(os.Getenv("ELEVENLABS_BASE_URL")),
		}); err == nil {
			provider.elevenlabs = client
		}
	}
	if key := strings.TrimSpace(os.Getenv("FAL_KEY")); key != "" {
		if client, err := fal.NewClient(fal.Config{
			APIKey:       key,
			QueueBaseURL: strings.TrimSpace(os.Getenv("FAL_QUEUE_URL")),
			PollInterval: 750 * time.Millisecond,
		}); err == nil {
			provider.fal = client
		}
	}
	return provider
}

func (p *irisCompositeProvider) Generate(ctx context.Context, req irisProviderRequest) ([]irisProviderOutput, error) {
	switch req.Model.Provider {
	case irisProviderElevenLabs:
		if p.elevenlabs != nil {
			return generateElevenLabs(ctx, p.elevenlabs, req)
		}
	case irisProviderFal:
		if p.fal != nil {
			return generateFal(ctx, p.fal, p.fetcher(), req)
		}
	}
	if p.gateway != nil {
		return p.gateway.Generate(ctx, req)
	}
	return nil, fmt.Errorf("generation provider is not configured (set AI_GATEWAY_API_KEY, ELEVENLABS_API_KEY, or FAL_KEY)")
}

func (p *irisCompositeProvider) fetcher() irisMediaFetcher {
	if p.fetch != nil {
		return p.fetch
	}
	return fetchHTTPS
}

func generateElevenLabs(ctx context.Context, client *elevenlabs.Client, req irisProviderRequest) ([]irisProviderOutput, error) {
	var (
		audio elevenlabs.Audio
		err   error
	)
	switch req.Model.ID {
	case "elevenlabs-music":
		audio, err = client.ComposeMusic(ctx, elevenlabs.MusicRequest{
			Prompt:          req.Prompt,
			ModelID:         req.Model.NativeID,
			DurationSeconds: req.Duration,
		})
	case "elevenlabs-sfx":
		audio, err = client.CreateSoundEffect(ctx, elevenlabs.SoundEffectRequest{
			Text:            req.Prompt,
			ModelID:         req.Model.NativeID,
			DurationSeconds: req.Duration,
		})
	default:
		audio, err = client.CreateSpeech(ctx, elevenlabs.SpeechRequest{
			Text:         req.Prompt,
			Voice:        req.Voice,
			ModelID:      req.Model.NativeID,
			LanguageCode: req.Language,
		})
	}
	if err != nil {
		return nil, err
	}
	ext := "mp3"
	if strings.Contains(audio.ContentType, "wav") {
		ext = "wav"
	}
	return []irisProviderOutput{{
		Bytes:       audio.Bytes,
		Filename:    "speech." + ext,
		ContentType: defaultType(audio.ContentType, "audio/mpeg"),
	}}, nil
}

func generateFal(ctx context.Context, client *fal.Client, fetch irisMediaFetcher, req irisProviderRequest) ([]irisProviderOutput, error) {
	endpoint := req.Model.NativeID
	if req.Model.FalRefID != "" && irisHasReferenceInput(req) {
		endpoint = req.Model.FalRefID
	}
	if strings.TrimSpace(endpoint) == "" {
		return nil, fmt.Errorf("fal endpoint is not configured for %s", req.Model.ID)
	}
	result, err := client.Run(ctx, endpoint, falInput(req))
	if err != nil {
		return nil, err
	}
	urls := fal.MediaURLs(result)
	if len(urls) == 0 {
		return nil, fmt.Errorf("fal returned no media")
	}
	stem, ext, contentType := falOutputMeta(req.Model.Kind)
	out := make([]irisProviderOutput, 0, len(urls))
	for i, mediaURL := range urls {
		raw, fetchedType, err := fetch(ctx, mediaURL)
		if err != nil {
			return nil, err
		}
		name := falFilename(mediaURL, stem, ext, i, len(urls))
		out = append(out, irisProviderOutput{
			Bytes:       raw,
			Filename:    name,
			ContentType: defaultType(fetchedType, contentType),
		})
	}
	return out, nil
}

func falInput(req irisProviderRequest) map[string]any {
	input := map[string]any{}
	if prompt := strings.TrimSpace(req.Prompt); prompt != "" {
		input["prompt"] = prompt
	}
	if req.Duration > 0 {
		input["duration"] = req.Duration
	}
	if aspect := strings.TrimSpace(req.AspectRatio); aspect != "" {
		input["aspect_ratio"] = aspect
	}
	if size := falImageSize(req.Resolution, req.AspectRatio); size != "" && req.Model.Kind == irisKindImage {
		input["image_size"] = size
	}
	if req.Count > 1 {
		input["num_images"] = req.Count
	}
	images := inputsByRole(req.Inputs, "image", "start", "end")
	if len(images) == 1 {
		input["image_url"] = irisDataURI(images[0], "image/png")
	} else if len(images) > 1 {
		urls := make([]string, 0, len(images))
		for _, image := range images {
			urls = append(urls, irisDataURI(image, "image/png"))
		}
		input["image_url"] = urls[0]
		input["image_urls"] = urls
	}
	if video, ok := firstInput(req.Inputs, "video"); ok {
		input["video_url"] = irisDataURI(video, "video/mp4")
	}
	if audio, ok := firstInput(req.Inputs, "audio", "media"); ok {
		input["audio_url"] = irisDataURI(audio, "audio/wav")
	}
	return input
}

func irisHasReferenceInput(req irisProviderRequest) bool {
	_, hasImage := firstInput(req.Inputs, "image", "start", "end")
	_, hasVideo := firstInput(req.Inputs, "video")
	return hasImage || hasVideo
}

func irisDataURI(input irisProviderInput, fallback string) string {
	return "data:" + defaultType(input.ContentType, fallback) + ";base64," + base64.StdEncoding.EncodeToString(input.Bytes)
}

func falImageSize(resolution, aspect string) string {
	switch strings.TrimSpace(aspect) {
	case "16:9":
		return "landscape_16_9"
	case "9:16":
		return "portrait_16_9"
	default:
		if resolution == "4K" || resolution == "2K" {
			return "square_hd"
		}
		if resolution == "" && aspect == "" {
			return ""
		}
		return "square"
	}
}

func falOutputMeta(kind irisModelKind) (stem, ext, contentType string) {
	switch kind {
	case irisKindVideo:
		return "video", "mp4", "video/mp4"
	case irisKindVoice, irisKindAudio:
		return "audio", "mp3", "audio/mpeg"
	default:
		return "image", "png", "image/png"
	}
}

func falFilename(rawURL, stem, ext string, index, total int) string {
	if parsed, err := url.Parse(rawURL); err == nil {
		if name := path.Base(parsed.Path); name != "" && name != "/" && name != "." {
			return name
		}
	}
	if total == 1 {
		return stem + "." + ext
	}
	return fmt.Sprintf("%s-%d.%s", stem, index+1, ext)
}
