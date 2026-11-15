package main

import (
	"bytes"
	"encoding/binary"
	"testing"

	"github.com/stretchr/testify/require"
)

func testWAV(byteRate uint32, dataSize int) []byte {
	var b bytes.Buffer
	b.WriteString("RIFF")
	_ = binary.Write(&b, binary.LittleEndian, uint32(36+dataSize))
	b.WriteString("WAVEfmt ")
	_ = binary.Write(&b, binary.LittleEndian, uint32(16))
	_ = binary.Write(&b, binary.LittleEndian, uint16(1))     // PCM
	_ = binary.Write(&b, binary.LittleEndian, uint16(2))     // channels
	_ = binary.Write(&b, binary.LittleEndian, uint32(48000)) // sample rate
	_ = binary.Write(&b, binary.LittleEndian, byteRate)      // byte rate
	_ = binary.Write(&b, binary.LittleEndian, uint16(4))     // block align
	_ = binary.Write(&b, binary.LittleEndian, uint16(16))    // bits per sample
	b.WriteString("data")
	_ = binary.Write(&b, binary.LittleEndian, uint32(dataSize))
	b.Write(make([]byte, dataSize))
	return b.Bytes()
}

// testMP3 builds MPEG-1 layer III frames at 128 kbps, 44.1 kHz: 417 bytes
// and 1152 samples each.
func testMP3(frames int, id3 bool) []byte {
	var b bytes.Buffer
	if id3 {
		b.Write([]byte{'I', 'D', '3', 4, 0, 0, 0, 0, 0, 20})
		b.Write(make([]byte, 20))
	}
	for range frames {
		frame := make([]byte, 417)
		copy(frame, []byte{0xFF, 0xFB, 0x90, 0x00})
		b.Write(frame)
	}
	return b.Bytes()
}

func TestIrisAudioDurationWAV(t *testing.T) {
	seconds, ok := irisAudioDurationSeconds(testWAV(192000, 192000*3/2))
	require.True(t, ok)
	require.InDelta(t, 1.5, seconds, 0.001)
}

func TestIrisAudioDurationMP3(t *testing.T) {
	for _, id3 := range []bool{false, true} {
		seconds, ok := irisAudioDurationSeconds(testMP3(100, id3))
		require.True(t, ok)
		require.InDelta(t, 100*1152.0/44100, seconds, 0.001)
	}
}

func TestIrisAudioDurationUnknown(t *testing.T) {
	_, ok := irisAudioDurationSeconds([]byte("not audio at all"))
	require.False(t, ok)
	_, ok = irisAudioDurationSeconds(nil)
	require.False(t, ok)
}

func TestIrisLyriaBilledByReturnedSeconds(t *testing.T) {
	credits := irisCreditConfig{FalAudioModelID: "custom/fal-audio"}
	job := irisJobRecord{
		ID:      "job_lyria",
		OrgID:   "org_local",
		Model:   "lyria-3-pro",
		Request: irisGenerateRequest{"prompt": "a 48-second track"},
		Assets:  []irisJobAsset{{Filename: "track.mp3", ContentType: "audio/mpeg", DurationSeconds: 47.2}},
	}
	req, ok := irisSyntheticCredit(job, credits)
	require.True(t, ok)
	require.Equal(t, "custom/fal-audio", req.ModelID)
	require.Equal(t, 48, req.OutputTokens)

	job.Assets[0].DurationSeconds = 0
	req, ok = irisSyntheticCredit(job, credits)
	require.True(t, ok)
	require.Equal(t, irisDurationSeconds(job), req.OutputTokens)
}

func TestIrisFalAudioCreditDefaultsToMusicSecond(t *testing.T) {
	t.Setenv("AI_CREDIT_FAL_AUDIO_MODEL_ID", "")
	require.Equal(t, defaultIrisElevenLabsSecondCreditModel, (&irisGenerationAPI{}).creditModels().FalAudioModelID)
	t.Setenv("AI_CREDIT_FAL_AUDIO_MODEL_ID", "env/fal-audio")
	require.Equal(t, "env/fal-audio", (&irisGenerationAPI{}).creditModels().FalAudioModelID)
}
