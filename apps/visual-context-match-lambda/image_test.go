package main

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/png"
	"testing"

	"github.com/HugoSmits86/nativewebp"
	"github.com/stretchr/testify/require"
)

func TestPrepareTextractImagePassesPNGAndJPEG(t *testing.T) {
	pngBytes := mustTestPNG(t, 2, 2)
	got, err := prepareTextractImage(pngBytes, "image/png")
	require.NoError(t, err)
	require.Equal(t, pngBytes, got)

	_, err = prepareTextractImage(bytes.Repeat([]byte{0x89}, textractMaxBytes+1), "image/jpeg")
	require.ErrorIs(t, err, errUnsupportedImage)
}

func TestPrepareTextractImageConvertsWebP(t *testing.T) {
	webpBytes := mustTestWebP(t, 2, 2)
	got, err := prepareTextractImage(webpBytes, "image/webp")
	require.NoError(t, err)
	cfg, format, err := image.DecodeConfig(bytes.NewReader(got))
	require.NoError(t, err)
	require.Equal(t, "png", format)
	require.Equal(t, 2, cfg.Width)
	require.Equal(t, 2, cfg.Height)
}

func TestPrepareTextractImageRejectsOversizedWebPBeforeDecode(t *testing.T) {
	_, err := prepareTextractImage(oversizedTestWebP(8000, 8000), "image/webp")
	require.ErrorIs(t, err, errUnsupportedImage)

	_, err = prepareTextractImage(oversizedTestWebP(20000, 20), "image/webp")
	require.ErrorIs(t, err, errUnsupportedImage)

	_, err = prepareTextractImage([]byte("RIFF\x00\x00\x00\x00WEBP"), "image/webp")
	require.ErrorIs(t, err, errUnsupportedImage)
}

func mustTestPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, width, height))))
	return buf.Bytes()
}

func mustTestWebP(t *testing.T, width, height int) []byte {
	t.Helper()
	var buf bytes.Buffer
	require.NoError(t, nativewebp.Encode(&buf, image.NewRGBA(image.Rect(0, 0, width, height)), nil))
	return buf.Bytes()
}

func oversizedTestWebP(width, height int) []byte {
	payload := make([]byte, 10)
	w := width - 1
	h := height - 1
	payload[4] = byte(w)
	payload[5] = byte(w >> 8)
	payload[6] = byte(w >> 16)
	payload[7] = byte(h)
	payload[8] = byte(h >> 8)
	payload[9] = byte(h >> 16)
	out := make([]byte, 30)
	copy(out[0:4], "RIFF")
	binary.LittleEndian.PutUint32(out[4:8], 22)
	copy(out[8:12], "WEBP")
	copy(out[12:16], "VP8X")
	binary.LittleEndian.PutUint32(out[16:20], 10)
	copy(out[20:], payload)
	return out
}
