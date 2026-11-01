package elevenlabs

import (
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func TestDubbingLanguage(t *testing.T) {
	require.Equal(t, "fr", DubbingLanguage("fr-FR"))
	require.Equal(t, "pt", DubbingLanguage("pt_BR"))
	require.Equal(t, "zh", DubbingLanguage("zh-Hans-CN"))
	require.Equal(t, "ja", DubbingLanguage("JA"))
	require.Equal(t, "", DubbingLanguage(" "))
}

func TestCreateDubPollsUntilDubbed(t *testing.T) {
	var polls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "test-key", r.Header.Get("xi-api-key"))
		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/v1/dubbing":
			require.NoError(t, r.ParseMultipartForm(1<<20))
			require.Equal(t, "fr", r.FormValue("target_lang"))
			require.Equal(t, "auto", r.FormValue("source_lang"))
			require.Equal(t, "2", r.FormValue("num_speakers"))
			require.Equal(t, "false", r.FormValue("watermark"))
			file, header, err := r.FormFile("file")
			require.NoError(t, err)
			body, _ := io.ReadAll(file)
			require.Equal(t, "video-bytes", string(body))
			require.Equal(t, "media.mp4", header.Filename)
			_, _ = w.Write([]byte(`{"dubbing_id":"dub_1","expected_duration_sec":3}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/dubbing/dub_1":
			if polls.Add(1) < 2 {
				_, _ = w.Write([]byte(`{"status":"dubbing"}`))
				return
			}
			_, _ = w.Write([]byte(`{"status":"dubbed"}`))
		case r.Method == http.MethodGet && r.URL.Path == "/v1/dubbing/dub_1/audio/fr":
			w.Header().Set("Content-Type", "video/mp4")
			_, _ = w.Write([]byte("dubbed-video"))
		default:
			t.Fatalf("unexpected %s %s", r.Method, r.URL.Path)
		}
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	dub, err := client.CreateDub(t.Context(), DubRequest{
		Media:          []byte("video-bytes"),
		ContentType:    "video/mp4",
		TargetLanguage: "fr-FR",
		Speakers:       2,
		PollInterval:   time.Millisecond,
	})
	require.NoError(t, err)
	require.Equal(t, "dub_1", dub.ID)
	require.Equal(t, []byte("dubbed-video"), dub.Bytes)
	require.Equal(t, "video/mp4", dub.ContentType)
	require.Equal(t, int32(2), polls.Load())
}

func TestCreateDubReportsFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			_, _ = w.Write([]byte(`{"dubbing_id":"dub_2"}`))
			return
		}
		_, _ = w.Write([]byte(`{"status":"failed","error":"no speech found"}`))
	}))
	t.Cleanup(server.Close)

	client, err := NewClientWithHTTPClient(Config{APIKey: "test-key", BaseURL: server.URL}, server.Client())
	require.NoError(t, err)
	_, err = client.CreateDub(t.Context(), DubRequest{
		Media:          []byte("a"),
		ContentType:    "audio/mpeg",
		TargetLanguage: "de",
		PollInterval:   time.Millisecond,
	})
	require.ErrorContains(t, err, "no speech found")
}

func TestCreateDubValidates(t *testing.T) {
	client, err := NewClient(Config{APIKey: "k"})
	require.NoError(t, err)
	_, err = client.CreateDub(t.Context(), DubRequest{TargetLanguage: "fr"})
	require.Error(t, err)
	_, err = client.CreateDub(t.Context(), DubRequest{Media: []byte("x")})
	require.Error(t, err)
}
