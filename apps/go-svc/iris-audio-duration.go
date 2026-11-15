package main

import (
	"bytes"
	"encoding/binary"
)

// irisAudioDurationSeconds measures a WAV or MP3 file from its bytes. Fal
// returns no length with generated music, so billing reads it off the file.
// It reports false for formats it can't measure.
func irisAudioDurationSeconds(raw []byte) (float64, bool) {
	if d, ok := wavDurationSeconds(raw); ok {
		return d, true
	}
	return mp3DurationSeconds(raw)
}

func wavDurationSeconds(raw []byte) (float64, bool) {
	if len(raw) < 12 || !bytes.Equal(raw[0:4], []byte("RIFF")) || !bytes.Equal(raw[8:12], []byte("WAVE")) {
		return 0, false
	}
	var byteRate uint32
	for pos := 12; pos+8 <= len(raw); {
		id := raw[pos : pos+4]
		size := int(binary.LittleEndian.Uint32(raw[pos+4 : pos+8]))
		body := pos + 8
		switch {
		case bytes.Equal(id, []byte("fmt ")) && body+12 <= len(raw):
			byteRate = binary.LittleEndian.Uint32(raw[body+8 : body+12])
		case bytes.Equal(id, []byte("data")):
			if byteRate == 0 {
				return 0, false
			}
			// A streamed WAV may leave the data size unset or larger than the file.
			if size <= 0 || body+size > len(raw) {
				size = len(raw) - body
			}
			return float64(size) / float64(byteRate), true
		}
		if size < 0 {
			return 0, false
		}
		pos = body + size + size%2
	}
	return 0, false
}

var (
	mp3BitratesV1 = [3][16]int{
		{0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0}, // layer I
		{0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0},    // layer II
		{0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0},     // layer III
	}
	mp3BitratesV2 = [3][16]int{
		{0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0},
		{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0},
		{0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0},
	}
	mp3SampleRates = map[int][3]int{
		3: {44100, 48000, 32000}, // MPEG-1
		2: {22050, 24000, 16000}, // MPEG-2
		0: {11025, 12000, 8000},  // MPEG-2.5
	}
)

// mp3Frame parses the frame header at raw[0:4] and returns the frame's length
// in bytes and how many samples it holds.
func mp3Frame(raw []byte) (length, samples, sampleRate int, ok bool) {
	if len(raw) < 4 || raw[0] != 0xFF || raw[1]&0xE0 != 0xE0 {
		return 0, 0, 0, false
	}
	version := int(raw[1]>>3) & 3
	layerBits := int(raw[1]>>1) & 3
	bitrateIndex := int(raw[2] >> 4)
	rateIndex := int(raw[2]>>2) & 3
	padding := int(raw[2]>>1) & 1
	rates, known := mp3SampleRates[version]
	if !known || layerBits == 0 || rateIndex == 3 {
		return 0, 0, 0, false
	}
	layer := 3 - layerBits // 0 = layer I, 1 = layer II, 2 = layer III
	table := mp3BitratesV2
	if version == 3 {
		table = mp3BitratesV1
	}
	bitrate := table[layer][bitrateIndex] * 1000
	if bitrate == 0 {
		return 0, 0, 0, false
	}
	sampleRate = rates[rateIndex]
	switch {
	case layer == 0:
		samples = 384
		length = (12*bitrate/sampleRate + padding) * 4
	case layer == 2 && version != 3:
		samples = 576
		length = 72*bitrate/sampleRate + padding
	default:
		samples = 1152
		length = 144*bitrate/sampleRate + padding
	}
	return length, samples, sampleRate, length > 4
}

func mp3DurationSeconds(raw []byte) (float64, bool) {
	pos := 0
	// Skip an ID3v2 tag: "ID3", version, flags, then a 4-byte syncsafe size.
	if len(raw) >= 10 && bytes.Equal(raw[0:3], []byte("ID3")) {
		size := int(raw[6]&0x7F)<<21 | int(raw[7]&0x7F)<<14 | int(raw[8]&0x7F)<<7 | int(raw[9]&0x7F)
		pos = 10 + size
		if raw[5]&0x10 != 0 {
			pos += 10
		}
	}
	var seconds float64
	frames := 0
	for pos+4 <= len(raw) {
		length, samples, sampleRate, ok := mp3Frame(raw[pos:])
		if !ok || pos+length > len(raw) {
			pos++
			continue
		}
		seconds += float64(samples) / float64(sampleRate)
		frames++
		pos += length
	}
	return seconds, frames > 0
}
