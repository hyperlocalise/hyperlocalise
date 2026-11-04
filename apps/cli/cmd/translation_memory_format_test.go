package cmd

import (
	"bytes"
	"context"
	"io"
	"strings"
	"testing"

	crowdinstorage "github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/crowdin"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/phrase"
	"github.com/hyperlocalise/hyperlocalise/internal/i18n/storage/smartling"
)

type recordingTMWriter struct {
	calls []string
}

func (r *recordingTMWriter) write(format string, w io.Writer) (int, int, error) {
	r.calls = append(r.calls, format)
	_, err := io.WriteString(w, format+"-payload")
	return 2, 5, err
}

type fakePhraseTMWriter struct{ recordingTMWriter }

func (f *fakePhraseTMWriter) WriteTranslationMemoryCSV(_ context.Context, _ phrase.TranslationMemoryDownloadInput, w io.Writer) (phrase.TranslationMemoryDownloadResult, error) {
	rows, segments, err := f.write("csv", w)
	return phrase.TranslationMemoryDownloadResult{Rows: rows, Segments: segments}, err
}

func (f *fakePhraseTMWriter) WriteTranslationMemoryTMX(_ context.Context, _ phrase.TranslationMemoryDownloadInput, w io.Writer) (phrase.TranslationMemoryDownloadResult, error) {
	rows, segments, err := f.write("tmx", w)
	return phrase.TranslationMemoryDownloadResult{Rows: rows, Segments: segments}, err
}

type fakeCrowdinTMWriter struct{ recordingTMWriter }

func (f *fakeCrowdinTMWriter) WriteTranslationMemoryCSV(_ context.Context, _ crowdinstorage.TranslationMemoryDownloadRequest, w io.Writer) (crowdinstorage.TranslationMemoryDownloadResult, error) {
	rows, segments, err := f.write("csv", w)
	return crowdinstorage.TranslationMemoryDownloadResult{Rows: rows, Segments: segments}, err
}

func (f *fakeCrowdinTMWriter) WriteTranslationMemoryTMX(_ context.Context, _ crowdinstorage.TranslationMemoryDownloadRequest, w io.Writer) (crowdinstorage.TranslationMemoryDownloadResult, error) {
	rows, segments, err := f.write("tmx", w)
	return crowdinstorage.TranslationMemoryDownloadResult{Rows: rows, Segments: segments}, err
}

type fakeSmartlingTMWriter struct{ recordingTMWriter }

func (f *fakeSmartlingTMWriter) WriteTranslationMemoryCSV(_ context.Context, _ smartling.TranslationMemoryDownloadRequest, w io.Writer) (smartling.TranslationMemoryDownloadResult, error) {
	rows, segments, err := f.write("csv", w)
	return smartling.TranslationMemoryDownloadResult{Rows: rows, Segments: segments}, err
}

func (f *fakeSmartlingTMWriter) WriteTranslationMemoryTMX(_ context.Context, _ smartling.TranslationMemoryDownloadRequest, w io.Writer) (smartling.TranslationMemoryDownloadResult, error) {
	rows, segments, err := f.write("tmx", w)
	return smartling.TranslationMemoryDownloadResult{Rows: rows, Segments: segments}, err
}

func TestNormalizeTranslationMemoryDownloadFormat(t *testing.T) {
	for input, want := range map[string]string{"": "csv", " CSV ": "csv", "TMX": "tmx"} {
		got, err := normalizeTranslationMemoryDownloadFormat(input)
		if err != nil || got != want {
			t.Fatalf("normalize(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	if _, err := normalizeTranslationMemoryDownloadFormat("xliff"); err == nil || err.Error() != `unsupported --format "xliff"; expected csv or tmx` {
		t.Fatalf("expected unsupported format error, got %v", err)
	}
}

func TestWriteTranslationMemoryDispatchesByFormat(t *testing.T) {
	ctx := context.Background()
	type tmWriterCase struct {
		name     string
		recorder *recordingTMWriter
		write    func(format string, w io.Writer) (int, int, error)
	}

	phraseWriter := &fakePhraseTMWriter{}
	crowdinWriter := &fakeCrowdinTMWriter{}
	smartlingWriter := &fakeSmartlingTMWriter{}
	writers := []tmWriterCase{
		{name: "phrase", recorder: &phraseWriter.recordingTMWriter, write: func(format string, w io.Writer) (int, int, error) {
			result, err := writePhraseTranslationMemory(ctx, phraseWriter, phrase.TranslationMemoryDownloadInput{}, format, w)
			return result.Rows, result.Segments, err
		}},
		{name: "crowdin", recorder: &crowdinWriter.recordingTMWriter, write: func(format string, w io.Writer) (int, int, error) {
			result, err := writeCrowdinTranslationMemory(ctx, crowdinWriter, crowdinstorage.TranslationMemoryDownloadRequest{}, format, w)
			return result.Rows, result.Segments, err
		}},
		{name: "smartling", recorder: &smartlingWriter.recordingTMWriter, write: func(format string, w io.Writer) (int, int, error) {
			result, err := writeSmartlingTranslationMemory(ctx, smartlingWriter, smartling.TranslationMemoryDownloadRequest{}, format, w)
			return result.Rows, result.Segments, err
		}},
	}

	for _, writer := range writers {
		t.Run(writer.name, func(t *testing.T) {
			for _, format := range []string{translationMemoryFormatCSV, translationMemoryFormatTMX} {
				out := &bytes.Buffer{}
				rows, segments, err := writer.write(format, out)
				if err != nil {
					t.Fatalf("%s: %v", format, err)
				}
				if rows != 2 || segments != 5 || out.String() != format+"-payload" {
					t.Fatalf("%s: rows=%d segments=%d out=%q", format, rows, segments, out.String())
				}
			}

			rows, segments, err := writer.write("xliff", &bytes.Buffer{})
			if err == nil || err.Error() != `unsupported translation memory format "xliff"` {
				t.Fatalf("expected unsupported format error, got %v", err)
			}
			if rows != 0 || segments != 0 {
				t.Fatalf("expected empty result on error, got rows=%d segments=%d", rows, segments)
			}
			if strings.Join(writer.recorder.calls, ",") != "csv,tmx" {
				t.Fatalf("writer calls = %v", writer.recorder.calls)
			}
		})
	}
}

func TestWriteTranslationMemoryDownloadSummary(t *testing.T) {
	out := &bytes.Buffer{}
	if _, err := writeTranslationMemoryDownloadSummary(out, "tm.csv", translationMemoryFormatCSV, 3, 4); err != nil {
		t.Fatal(err)
	}
	if _, err := writeTranslationMemoryDownloadSummary(out, "tm.tmx", translationMemoryFormatTMX, 1, 2); err != nil {
		t.Fatal(err)
	}
	want := "wrote tm.csv rows=3 segments=4\nwrote tm.tmx format=tmx rows=1 segments=2\n"
	if out.String() != want {
		t.Fatalf("summary = %q, want %q", out.String(), want)
	}
}
