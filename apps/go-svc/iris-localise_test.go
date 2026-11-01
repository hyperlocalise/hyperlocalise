package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

type stubIrisText struct {
	reply   string
	request irisChatRequest
}

func (s *stubIrisText) Complete(_ context.Context, req irisChatRequest) (irisChatReply, error) {
	s.request = req
	return irisChatReply{Text: s.reply, Model: req.Model, InputTokens: 10, OutputTokens: 5}, nil
}

const testAsset = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func assetField() map[string]any { return map[string]any{"kind": "asset", "id": testAsset} }

func TestValidateIrisLocaliseModels(t *testing.T) {
	cases := []struct {
		name string
		req  irisGenerateRequest
		err  string
	}{
		{"dub ok", irisGenerateRequest{"model": "elevenlabs-dubbing", "media": assetField(), "targetLanguage": "fr-FR"}, ""},
		{"dub needs media", irisGenerateRequest{"model": "elevenlabs-dubbing", "targetLanguage": "fr"}, "media is required"},
		{"dub needs language", irisGenerateRequest{"model": "elevenlabs-dubbing", "media": assetField()}, "targetLanguage"},
		{"dub rejects bad source", irisGenerateRequest{"model": "elevenlabs-dubbing", "media": assetField(), "targetLanguage": "fr", "sourceLanguage": "english!"}, "sourceLanguage"},
		{"lipsync ok", irisGenerateRequest{"model": "sync-lipsync-2", "video": assetField(), "audio": assetField(), "syncMode": "loop"}, ""},
		{"lipsync needs audio", irisGenerateRequest{"model": "sync-lipsync-2", "video": assetField()}, "audio is required"},
		{"lipsync mode", irisGenerateRequest{"model": "sync-lipsync-2", "video": assetField(), "audio": assetField(), "syncMode": "stretch"}, "syncMode"},
		{"image localise ok", irisGenerateRequest{"model": "image-localise", "image": assetField(), "targetLocale": "ja-JP"}, ""},
		{"image localise locale", irisGenerateRequest{"model": "image-localise", "image": assetField()}, "targetLocale"},
		{"image text ok", irisGenerateRequest{"model": "image-text", "image": assetField()}, ""},
		{"image text needs image", irisGenerateRequest{"model": "image-text"}, "image is required"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := validateIrisGenerateRequest(tc.req)
			if tc.err == "" {
				require.NoError(t, err)
			} else {
				require.ErrorContains(t, err, tc.err)
			}
		})
	}
}

func TestIsIrisLocale(t *testing.T) {
	for _, ok := range []string{"fr", "fr-FR", "pt_BR", "zh-Hans-CN", "es-419"} {
		require.True(t, isIrisLocale(ok), ok)
	}
	for _, bad := range []string{"", "f", "french language", "fr--FR", "12-FR", "fr-F"} {
		require.False(t, isIrisLocale(bad), bad)
	}
}

func TestIrisTranslationsField(t *testing.T) {
	req := irisGenerateRequest{"translations": []any{
		map[string]any{"source": "Sale", "target": "Soldes"},
		map[string]any{"source": " ", "target": "x"},
		"junk",
	}}
	require.Equal(t, []irisTranslationPair{{Source: "Sale", Target: "Soldes"}}, req.translations())
}

func TestIrisImageLocalisePrompt(t *testing.T) {
	prompt := irisImageLocalisePrompt("fr-FR", []irisTranslationPair{{Source: "Shop now", Target: "Acheter"}}, "Keep the price in euros.")
	require.Contains(t, prompt, "fr-FR")
	require.Contains(t, prompt, `"Shop now" → "Acheter"`)
	require.Contains(t, prompt, "Keep the price in euros.")
	require.Contains(t, prompt, "leave logos and brand names untranslated")
}

func TestSamePlaceholders(t *testing.T) {
	require.True(t, samePlaceholders("Hi {name}", "Salut {name}"))
	require.True(t, samePlaceholders("{count, plural, one {# day} other {# days}}", "{count, plural, one {# jour} other {# jours}}"))
	require.False(t, samePlaceholders("Hi {name}", "Salut"))
	require.True(t, samePlaceholders("No args", "Pas d'arguments"))
}

func TestContainsTerm(t *testing.T) {
	require.True(t, containsTerm("Start the art show", "art", false))
	require.False(t, containsTerm("Start the show", "art", false))
	require.True(t, containsTerm("Hyperlocalise Pro", "hyperlocalise", false))
	require.False(t, containsTerm("Hyperlocalise Pro", "hyperlocalise", true))
	require.True(t, containsTerm("東京の夜", "東京", false))
}

func TestTranslateWithModelKeepsOnlySafeTranslations(t *testing.T) {
	text := &stubIrisText{reply: "```json\n" + `{"translations":{"title":"Nuits néon","greet":"Bonjour","cta":""}}` + "\n```"}
	api := &irisGenerationAPI{text: text}
	out, usage, err := api.translateWithModel(context.Background(), "en-US", "fr-FR",
		[]irisLocaliseMessage{{ID: "title", Text: "Neon nights", Description: "Video title"}, {ID: "greet", Text: "Hello {name}"}, {ID: "cta", Text: "Watch"}},
		[]irisGlossaryHit{{Term: "Neon", Translation: ptr("Néon"), Glossary: "Brand"}}, "Playful, confident.", "Under 20 characters.")
	require.NoError(t, err)
	require.Equal(t, []irisTranslatedMessage{{ID: "title", Text: "Nuits néon", Origin: "model"}}, out)
	require.Equal(t, 10, usage.InputTokens)
	require.True(t, text.request.JSON)
	require.Equal(t, defaultIrisTranslateModel, text.request.Model)

	var prompt irisTranslatePrompt
	require.NoError(t, json.Unmarshal([]byte(text.request.User), &prompt))
	require.Equal(t, "fr-FR", prompt.TargetLocale)
	require.Equal(t, "Playful, confident.", prompt.Knowledge)
	require.Equal(t, "Under 20 characters.", prompt.Guidance)
	require.Len(t, prompt.Glossary, 1)
}

func TestMergeIrisTranslationsKeepsRequestOrder(t *testing.T) {
	messages := []irisLocaliseMessage{
		{ID: "a", Text: "Hello"},
		{ID: "b", Text: "Shop now"},
		{ID: "c", Text: "Goodbye"},
		{ID: "d", Text: "Missing"},
	}
	memory := []irisMemoryMatch{
		{Source: "Hello", Target: "Bonjour", Approved: true},
		{Source: "Goodbye", Target: "Au revoir", Approved: true},
		{Source: "Shop now", Target: "Achetez", Approved: false},
	}
	model := []irisTranslatedMessage{{ID: "b", Text: "Acheter maintenant", Origin: "model"}}
	require.Equal(t, []irisTranslatedMessage{
		{ID: "a", Text: "Bonjour", Origin: "memory"},
		{ID: "b", Text: "Acheter maintenant", Origin: "model"},
		{ID: "c", Text: "Au revoir", Origin: "memory"},
	}, mergeIrisTranslations(messages, memory, model))
	require.Equal(t, []irisLocaliseMessage{{ID: "b", Text: "Shop now"}, {ID: "d", Text: "Missing"}}, pendingIrisTranslations(messages, memory))
}

func TestParseIrisTranslationsRejectsProse(t *testing.T) {
	_, err := parseIrisTranslations("Sure! Here you go.")
	require.Error(t, err)
	_, err = parseIrisTranslations(`{"other":{}}`)
	require.Error(t, err)
}

func TestIrisLocalisePairs(t *testing.T) {
	source, target, err := irisLocalePair("en_US", "fr-FR")
	require.NoError(t, err)
	require.Equal(t, "en-US", source)
	require.Equal(t, "fr-FR", target)
	_, _, err = irisLocalePair("en-US", "EN-us")
	require.Error(t, err)
	require.Error(t, validateIrisMessages([]irisLocaliseMessage{{ID: "a", Text: "x"}, {ID: "a", Text: "y"}}))
	require.Error(t, validateIrisTexts(nil))
}

func TestIrisLocaliseEndpointsValidateBeforeTouchingData(t *testing.T) {
	api := newIrisGenerationFixture(t, &stubIrisProvider{})

	rec := irisRequest(api, http.MethodPost, irisTestPath+"/localise/lookup", map[string]any{"sourceLocale": "en-US", "targetLocale": "en-US", "texts": []string{"hi"}})
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = irisRequest(api, http.MethodPost, irisTestPath+"/localise/lookup", map[string]any{"sourceLocale": "en-US", "targetLocale": "fr-FR", "texts": []string{"hi"}})
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)

	rec = irisRequest(api, http.MethodPost, irisTestPath+"/localise/translate", map[string]any{"sourceLocale": "en-US", "targetLocale": "fr-FR", "messages": []any{}})
	require.Equal(t, http.StatusBadRequest, rec.Code)

	rec = irisRequest(api, http.MethodPost, irisTestPath+"/localise/memory", map[string]any{"sourceLocale": "en-US", "targetLocale": "fr-FR", "entries": []any{map[string]string{"source": "a", "target": "b"}}})
	require.Equal(t, http.StatusServiceUnavailable, rec.Code)
}

func TestFalLipsyncInputAndOutput(t *testing.T) {
	model, ok := irisModelByID("sync-lipsync-2")
	require.True(t, ok)
	req := irisProviderRequest{
		Model:  model,
		Inputs: []irisProviderInput{{Role: "video", Bytes: []byte("v"), ContentType: "video/mp4"}, {Role: "audio", Bytes: []byte("a"), ContentType: "audio/mpeg"}},
		Fields: irisGenerateRequest{"syncMode": "bounce"},
	}
	input := falInput(req)
	require.True(t, strings.HasPrefix(input["video_url"].(string), "data:video/mp4;base64,"))
	require.True(t, strings.HasPrefix(input["audio_url"].(string), "data:audio/mpeg;base64,"))
	require.Equal(t, "bounce", input["sync_mode"])
	require.Equal(t, "fal-ai/sync-lipsync/v2", falEndpoint(req))
	stem, ext, contentType := falOutputMeta(model)
	require.Equal(t, []string{"lipsync", "mp4", "video/mp4"}, []string{stem, ext, contentType})
}

func TestGatewayCompleteAndImageText(t *testing.T) {
	var payload map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/chat/completions", r.URL.Path)
		require.Equal(t, "Bearer key", r.Header.Get("Authorization"))
		require.NoError(t, json.NewDecoder(r.Body).Decode(&payload))
		_, _ = w.Write([]byte(`{"choices":[{"message":{"content":"{\"language\":\"en\",\"texts\":[{\"text\":\"50% OFF\",\"role\":\"headline\"}]}"}}],"usage":{"prompt_tokens":120,"completion_tokens":30}}`))
	}))
	t.Cleanup(server.Close)
	provider := &irisGatewayProvider{baseURL: server.URL, apiKey: "key", httpClient: server.Client()}
	model, _ := irisModelByID("image-text")
	outputs, err := provider.Generate(context.Background(), irisProviderRequest{
		Model:  model,
		Inputs: []irisProviderInput{{Role: "image", Bytes: []byte("png"), ContentType: "image/png"}},
	})
	require.NoError(t, err)
	require.Len(t, outputs, 1)
	require.Equal(t, "text.json", outputs[0].Filename)
	require.Contains(t, string(outputs[0].Bytes), "50% OFF")
	require.Equal(t, map[string]any{"type": "json_object"}, payload["response_format"])
	messages := payload["messages"].([]any)
	user := messages[1].(map[string]any)["content"].([]any)
	require.Equal(t, "image_url", user[1].(map[string]any)["type"])
}
