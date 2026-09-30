package translationfileparser

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
)

const (
	dotLottieKeySeparator = "#"
	// dotLottieMaxEntryBytes caps decompressed animation size to guard against zip bombs.
	dotLottieMaxEntryBytes = 64 << 20
)

// dotLottieAnimationDirs lists animation folders for dotLottie v1 (animations/) and v2 (a/).
var dotLottieAnimationDirs = []string{"animations/", "a/"}

// DotLottieParser parses editable text layers from dotLottie (.lottie) zip archives.
// Keys are prefixed with the animation entry path, for example
// "a/intro.json#layers[1].t.d.k[0].s.t".
type DotLottieParser struct{}

func (p DotLottieParser) Parse(content []byte) (map[string]string, error) {
	values, _, err := p.ParseWithContext(content)
	return values, err
}

func (p DotLottieParser) ParseWithContext(content []byte) (map[string]string, map[string]string, error) {
	reader, err := zip.NewReader(bytes.NewReader(content), int64(len(content)))
	if err != nil {
		return nil, nil, fmt.Errorf("dotlottie: open archive: %w", err)
	}

	values := map[string]string{}
	entryContext := map[string]string{}
	animationCount := 0
	for _, file := range reader.File {
		if !isDotLottieAnimationEntry(file.Name) {
			continue
		}
		animation, err := readDotLottieEntry(file)
		if err != nil {
			return nil, nil, err
		}
		if !IsLottieJSON(animation) {
			continue
		}
		animationCount++
		animationValues, animationContext, err := ParseLottie(animation)
		if err != nil {
			return nil, nil, fmt.Errorf("dotlottie: parse %q: %w", file.Name, err)
		}
		for key, value := range animationValues {
			fullKey := file.Name + dotLottieKeySeparator + key
			values[fullKey] = value
			entryContext[fullKey] = fmt.Sprintf("Animation %q: %s", file.Name, animationContext[key])
		}
	}
	if animationCount == 0 {
		return nil, nil, errors.New("dotlottie: archive has no Lottie animations under animations/ or a/")
	}
	return values, entryContext, nil
}

// MarshalDotLottie rebuilds a dotLottie archive with translated text layer values.
// Entries without changes, including images, themes, and the manifest, are copied
// without recompression.
func MarshalDotLottie(template []byte, values map[string]string) ([]byte, error) {
	reader, err := zip.NewReader(bytes.NewReader(template), int64(len(template)))
	if err != nil {
		return nil, fmt.Errorf("dotlottie: open archive: %w", err)
	}

	valuesByEntry := map[string]map[string]string{}
	for key, value := range values {
		entryName, lottieKey, ok := strings.Cut(key, dotLottieKeySeparator)
		if !ok {
			continue
		}
		if valuesByEntry[entryName] == nil {
			valuesByEntry[entryName] = map[string]string{}
		}
		valuesByEntry[entryName][lottieKey] = value
	}

	var out bytes.Buffer
	writer := zip.NewWriter(&out)
	if reader.Comment != "" {
		if err := writer.SetComment(reader.Comment); err != nil {
			return nil, fmt.Errorf("dotlottie: set archive comment: %w", err)
		}
	}

	for _, file := range reader.File {
		entryValues := valuesByEntry[file.Name]
		if len(entryValues) == 0 || !isDotLottieAnimationEntry(file.Name) {
			if err := writer.Copy(file); err != nil {
				return nil, fmt.Errorf("dotlottie: copy %q: %w", file.Name, err)
			}
			continue
		}

		animation, err := readDotLottieEntry(file)
		if err != nil {
			return nil, err
		}
		if !IsLottieJSON(animation) {
			if err := writer.Copy(file); err != nil {
				return nil, fmt.Errorf("dotlottie: copy %q: %w", file.Name, err)
			}
			continue
		}
		updated, err := MarshalLottie(animation, entryValues)
		if err != nil {
			return nil, fmt.Errorf("dotlottie: marshal %q: %w", file.Name, err)
		}
		if bytes.Equal(updated, animation) {
			if err := writer.Copy(file); err != nil {
				return nil, fmt.Errorf("dotlottie: copy %q: %w", file.Name, err)
			}
			continue
		}

		entryWriter, err := writer.CreateHeader(&zip.FileHeader{
			Name:          file.Name,
			Comment:       file.Comment,
			Method:        file.Method,
			Modified:      file.Modified,
			ExternalAttrs: file.ExternalAttrs,
		})
		if err != nil {
			return nil, fmt.Errorf("dotlottie: create %q: %w", file.Name, err)
		}
		if _, err := entryWriter.Write(updated); err != nil {
			return nil, fmt.Errorf("dotlottie: write %q: %w", file.Name, err)
		}
	}

	if err := writer.Close(); err != nil {
		return nil, fmt.Errorf("dotlottie: finalize archive: %w", err)
	}
	return out.Bytes(), nil
}

func isDotLottieAnimationEntry(name string) bool {
	if strings.HasSuffix(name, "/") || !strings.EqualFold(path.Ext(name), ".json") {
		return false
	}
	for _, dir := range dotLottieAnimationDirs {
		if strings.HasPrefix(name, dir) {
			return true
		}
	}
	return false
}

func readDotLottieEntry(file *zip.File) ([]byte, error) {
	if file.UncompressedSize64 > dotLottieMaxEntryBytes {
		return nil, fmt.Errorf("dotlottie: entry %q exceeds %d bytes", file.Name, dotLottieMaxEntryBytes)
	}
	entry, err := file.Open()
	if err != nil {
		return nil, fmt.Errorf("dotlottie: open %q: %w", file.Name, err)
	}
	defer func() { _ = entry.Close() }()

	content, err := io.ReadAll(io.LimitReader(entry, dotLottieMaxEntryBytes+1))
	if err != nil {
		return nil, fmt.Errorf("dotlottie: read %q: %w", file.Name, err)
	}
	if len(content) > dotLottieMaxEntryBytes {
		return nil, fmt.Errorf("dotlottie: entry %q exceeds %d bytes", file.Name, dotLottieMaxEntryBytes)
	}
	return content, nil
}
