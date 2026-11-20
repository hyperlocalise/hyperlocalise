package elevenlabs

import (
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/require"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	return client
}

func TestPronunciationDictionaryIsCreatedOncePerRuleSet(t *testing.T) {
	calls := 0
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		require.Equal(t, "/v1/pronunciation-dictionaries/add-from-rules", r.URL.Path)
		var body struct {
			Name  string           `json:"name"`
			Rules []map[string]any `json:"rules"`
		}
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Contains(t, body.Name, "hyperlocalise-")
		require.Len(t, body.Rules, 2)
		// Longest term first, so the phrase wins over the word inside it.
		require.Equal(t, "Hyperlocalise AI", body.Rules[0]["string_to_replace"])
		require.Equal(t, "alias", body.Rules[0]["type"])
		require.Equal(t, "hyper-low-ka-lize A I", body.Rules[0]["alias"])
		require.Equal(t, true, body.Rules[0]["word_boundaries"])
		_, _ = w.Write([]byte(`{"id":"dict-1","version_id":"v-1"}`))
	})
	rules := []PronunciationRule{
		{Term: "Iris", Alias: "eye-ris"},
		{Term: "Hyperlocalise AI", Alias: "hyper-low-ka-lize A I"},
		{Term: "iris", Alias: "ignored duplicate"},
		{Term: "Same", Alias: "Same"},
	}
	locator, ok, err := client.PronunciationDictionary(t.Context(), rules)
	require.NoError(t, err)
	require.True(t, ok)
	require.Equal(t, PronunciationLocator{ID: "dict-1", VersionID: "v-1"}, locator)

	again, ok, err := client.PronunciationDictionary(t.Context(), []PronunciationRule{rules[1], rules[0]})
	require.NoError(t, err)
	require.True(t, ok)
	require.Equal(t, locator, again)
	require.Equal(t, 1, calls)

	_, ok, err = client.PronunciationDictionary(t.Context(), nil)
	require.NoError(t, err)
	require.False(t, ok)
}

func TestCreateSpeechSendsPronunciationLocators(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, []any{map[string]any{"pronunciation_dictionary_id": "dict-1", "version_id": "v-1"}}, body["pronunciation_dictionary_locators"])
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("speech"))
	})
	audio, err := client.CreateSpeech(t.Context(), SpeechRequest{
		Text:           "Iris",
		Voice:          "21m00Tcm4TlvDq8ikWAM",
		Pronunciations: []PronunciationLocator{{ID: "dict-1", VersionID: "v-1"}},
	})
	require.NoError(t, err)
	require.Equal(t, []byte("speech"), audio.Bytes)
}

func TestCreateDialogueSendsLines(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/text-to-dialogue", r.URL.Path)
		require.Equal(t, "mp3_44100_128", r.URL.Query().Get("output_format"))
		var body struct {
			Inputs   []map[string]string `json:"inputs"`
			ModelID  string              `json:"model_id"`
			Language string              `json:"language_code"`
		}
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		require.Equal(t, "eleven_v3", body.ModelID)
		require.Equal(t, "fr", body.Language)
		require.Equal(t, []map[string]string{
			{"text": "Bonjour !", "voice_id": "21m00Tcm4TlvDq8ikWAM"},
			{"text": "Salut.", "voice_id": "AZnzlk1XvdvUeBnXmlld"},
		}, body.Inputs)
		w.Header().Set("Content-Type", "audio/mpeg")
		_, _ = w.Write([]byte("dialogue"))
	})
	audio, err := client.CreateDialogue(t.Context(), DialogueRequest{
		LanguageCode: "fr",
		Lines: []DialogueLine{
			{Text: "Bonjour !", Voice: "21m00Tcm4TlvDq8ikWAM"},
			{Text: "Salut.", Voice: "AZnzlk1XvdvUeBnXmlld"},
		},
	})
	require.NoError(t, err)
	require.Equal(t, []byte("dialogue"), audio.Bytes)

	_, err = client.CreateDialogue(t.Context(), DialogueRequest{Lines: []DialogueLine{{Text: " ", Voice: "21m00Tcm4TlvDq8ikWAM"}}})
	require.ErrorContains(t, err, "every line needs text")
}

func TestTranscribeKeepsWordsAndSendsKeyterms(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/speech-to-text", r.URL.Path)
		require.NoError(t, r.ParseMultipartForm(1<<20))
		require.Equal(t, "scribe_v2", r.FormValue("model_id"))
		require.Equal(t, "true", r.FormValue("diarize"))
		require.Equal(t, "2", r.FormValue("num_speakers"))
		require.Equal(t, "en", r.FormValue("language_code"))
		require.Equal(t, []string{"Hyperlocalise", "Iris"}, r.MultipartForm.Value["keyterms"])
		file, _, err := r.FormFile("file")
		require.NoError(t, err)
		body, _ := io.ReadAll(file)
		require.Equal(t, "audio", string(body))
		_, _ = w.Write([]byte(`{"language_code":"en","text":"Hi Iris (laughs)","words":[
			{"text":"Hi","type":"word","start":0.1,"end":0.3,"speaker_id":"speaker_0"},
			{"text":" ","type":"spacing","start":0.3,"end":0.35},
			{"text":"Iris","type":"word","start":0.35,"end":0.8,"speaker_id":"speaker_1"},
			{"text":"(laughs)","type":"audio_event","start":0.9,"end":1.2}
		]}`))
	})
	transcript, err := client.Transcribe(t.Context(), TranscriptionRequest{
		Media:        []byte("audio"),
		ContentType:  "audio/mpeg",
		LanguageCode: "en",
		Diarize:      true,
		Speakers:     2,
		Keyterms:     []string{"Hyperlocalise", "Iris", "iris", "bad<term>", "one two three four five six"},
	})
	require.NoError(t, err)
	require.Equal(t, "en", transcript.Language)
	require.Equal(t, []TimedWord{
		{Text: "Hi", Start: 0.1, End: 0.3, Speaker: "speaker_0"},
		{Text: "Iris", Start: 0.35, End: 0.8, Speaker: "speaker_1"},
	}, transcript.Words)
}

func TestKeytermsFilter(t *testing.T) {
	require.Equal(t, []string{"Hyperlocalise", "Iris"}, Keyterms([]string{"Hyperlocalise", " Iris ", "iris", "bad<term>", "one two three four five six", ""}))
}

func TestAlignReturnsTimedWords(t *testing.T) {
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/v1/forced-alignment", r.URL.Path)
		require.NoError(t, r.ParseMultipartForm(1<<20))
		require.Equal(t, "Bonjour Iris", r.FormValue("text"))
		_, _, err := r.FormFile("file")
		require.NoError(t, err)
		_, _ = w.Write([]byte(`{"characters":[],"words":[{"text":"Bonjour","start":0,"end":0.5,"loss":0.1},{"text":" ","start":0.5,"end":0.5,"loss":0},{"text":"Iris","start":0.5,"end":1,"loss":0.2}],"loss":0.1}`))
	})
	transcript, err := client.Align(t.Context(), AlignmentRequest{Media: []byte("audio"), ContentType: "audio/wav", Text: "Bonjour Iris"})
	require.NoError(t, err)
	require.Equal(t, []TimedWord{{Text: "Bonjour", Start: 0, End: 0.5}, {Text: "Iris", Start: 0.5, End: 1}}, transcript.Words)
}

func TestDesignAndSaveVoice(t *testing.T) {
	preview := base64.StdEncoding.EncodeToString([]byte("preview"))
	client := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		require.NoError(t, json.NewDecoder(r.Body).Decode(&body))
		switch r.URL.Path {
		case "/v1/text-to-voice/design":
			require.Equal(t, "A warm Parisian narrator", body["voice_description"])
			require.Equal(t, "eleven_ttv_v3", body["model_id"])
			require.Equal(t, true, body["auto_generate_text"])
			_, _ = w.Write([]byte(`{"previews":[{"audio_base_64":"` + preview + `","generated_voice_id":"gen-1","media_type":"audio/mpeg","duration_secs":4.2,"language":"fr"}],"text":"Bonjour"}`))
		case "/v1/text-to-voice":
			require.Equal(t, "gen-1", body["generated_voice_id"])
			require.Equal(t, "Narrator", body["voice_name"])
			require.Equal(t, map[string]any{"org": "o1"}, body["labels"])
			_, _ = w.Write([]byte(`{"voice_id":"voice-1"}`))
		default:
			t.Fatalf("unexpected path %s", r.URL.Path)
		}
	})
	previews, text, err := client.DesignVoice(t.Context(), VoiceDesignRequest{Description: "A warm Parisian narrator"})
	require.NoError(t, err)
	require.Equal(t, "Bonjour", text)
	require.Len(t, previews, 1)
	require.Equal(t, "gen-1", previews[0].GeneratedVoiceID)
	require.Equal(t, []byte("preview"), previews[0].Audio.Bytes)

	_, _, err = client.DesignVoice(t.Context(), VoiceDesignRequest{Description: "x", Text: "too short"})
	require.ErrorContains(t, err, "100 to 1,000")

	id, err := client.SaveVoice(t.Context(), SaveVoiceRequest{GeneratedVoiceID: "gen-1", Name: "Narrator", Labels: map[string]string{"org": "o1"}})
	require.NoError(t, err)
	require.Equal(t, "voice-1", id)
}
