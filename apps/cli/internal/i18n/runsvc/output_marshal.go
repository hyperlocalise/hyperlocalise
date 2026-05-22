package runsvc

// Output marshalling selects per-format writers and fallback templates.

import (
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func (s *Service) marshalTargetFile(path, sourcePath, sourceLocale, targetLocale string, values map[string]string, stagedEntries map[string]string, pruneKeys map[string]struct{}) ([]byte, []string, error) {
	ext := strings.ToLower(filepath.Ext(path))
	if isJSTSLocaleModuleExt(ext) {
		return s.marshalTemplateBasedTarget(ext, path, sourcePath, sourceLocale, targetLocale, values, stagedEntries)
	}
	switch ext {
	case ".xlf", ".xlif", ".xliff", ".po", ".md", ".mdx", ".strings", ".stringsdict", ".xcstrings", ".csv", ".arb", ".html", ".liquid", ".xml", ".resx", ".properties":
		return s.marshalTemplateBasedTarget(ext, path, sourcePath, sourceLocale, targetLocale, values, stagedEntries)
	case ".json", ".jsonc":
		content, err := s.marshalJSONTargetWithFallback(path, sourcePath, values, pruneKeys)
		return content, nil, err
	case ".yaml", ".yml":
		content, err := s.marshalYAMLTargetWithFallback(path, sourcePath, values, pruneKeys)
		return content, nil, err
	default:
		return nil, nil, fmt.Errorf("flush outputs: unsupported target file extension %q for %q", ext, path)
	}
}

func (s *Service) marshalTemplateBasedTarget(ext, path, sourcePath, sourceLocale, targetLocale string, values map[string]string, stagedEntries map[string]string) ([]byte, []string, error) {
	if ext == ".md" || ext == ".mdx" {
		return s.marshalMarkdownTarget(path, sourcePath, stagedEntries)
	}
	if ext == ".html" {
		return s.marshalHTMLTarget(path, sourcePath, stagedEntries)
	}
	if ext == ".liquid" {
		return s.marshalLiquidTarget(path, sourcePath, stagedEntries)
	}
	if ext == ".xlf" || ext == ".xlif" || ext == ".xliff" || ext == ".po" || ext == ".strings" || ext == ".stringsdict" || ext == ".xcstrings" || ext == ".arb" || ext == ".xml" || ext == ".resx" || ext == ".properties" || isJSTSLocaleModuleExt(ext) {
		content, err := s.marshalSourceTemplateTarget(ext, path, sourcePath, sourceLocale, targetLocale, values)
		return content, nil, err
	}

	template, err := s.loadTemplateFallback(path, sourcePath)
	if err != nil {
		return nil, nil, err
	}

	switch ext {
	case ".csv":
		content, err := marshalCSVTarget(template, values, targetLocale)
		if err != nil {
			return nil, nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil, nil
	default:
		return nil, nil, fmt.Errorf("flush outputs: unsupported target file extension %q for %q", ext, path)
	}
}

func (s *Service) marshalSourceTemplateTarget(ext, path, sourcePath, sourceLocale, targetLocale string, values map[string]string) ([]byte, error) {
	sourceTemplate, err := s.readFile(sourcePath)
	if err != nil {
		return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, err)
	}

	template := sourceTemplate
	targetTemplate, err := s.readFile(path)
	if err == nil {
		var (
			targetEntries map[string]string
			parseErr      error
		)
		if ext == ".xcstrings" {
			targetEntries, parseErr = translationfileparser.ParseXCStringsLocale(targetTemplate, targetLocale)
		} else {
			targetEntries, parseErr = s.newParser().Parse(path, targetTemplate)
		}
		if parseErr == nil {
			// For ARB and xcstrings files we always prefer the target template when it
			// parses cleanly, so locale-specific metadata, translator-added comments,
			// and existing translations for other keys are preserved even when the key
			// sets differ. MarshalARB/MarshalXCStrings handle new and removed keys.
			if ext == ".arb" || ext == ".xcstrings" || hasExactKeySet(targetEntries, values) {
				template = targetTemplate
			}
		}
	}

	switch ext {
	case ".xlf", ".xlif", ".xliff":
		content, err := translationfileparser.MarshalXLIFF(template, values, sourceLocale, targetLocale)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".po":
		content, err := translationfileparser.MarshalPOFile(template, values)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".strings":
		content, err := translationfileparser.MarshalAppleStrings(template, values)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".stringsdict":
		content, err := translationfileparser.MarshalAppleStringsdict(template, values)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".xcstrings":
		content, err := translationfileparser.MarshalXCStrings(template, sourceTemplate, values, sourceLocale, targetLocale)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".arb":
		content, err := translationfileparser.MarshalARB(template, sourceTemplate, values, targetLocale)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".xml":
		if translationfileparser.IsAndroidStringResourcePath(sourcePath) {
			content, err := translationfileparser.MarshalAndroidXMLResources(template, values)
			if err != nil {
				return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
			}
			return content, nil
		}
		content, err := translationfileparser.MarshalGenericXMLWithTargetLocale(template, values, sourceLocale, targetLocale)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".resx":
		content, err := translationfileparser.MarshalGenericXMLWithTargetLocale(template, values, sourceLocale, targetLocale)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	case ".properties":
		content, err := translationfileparser.MarshalJavaProperties(template, values)
		if err != nil {
			return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
		}
		return content, nil
	default:
		if isJSTSLocaleModuleExt(ext) {
			content, err := translationfileparser.MarshalJSTSLocaleModule(template, values)
			if err != nil {
				return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
			}
			return content, nil
		}
		return nil, fmt.Errorf("flush outputs: unsupported target file extension %q for %q", ext, path)
	}
}

func isJSTSLocaleModuleExt(ext string) bool {
	return slices.Contains(translationfileparser.JSTSLocaleModuleExts, ext)
}

func hasExactKeySet(a, b map[string]string) bool {
	if len(a) != len(b) {
		return false
	}
	for key := range a {
		if _, ok := b[key]; !ok {
			return false
		}
	}
	return true
}

// marshalMarkdownTargetHook is set by tests to stub marshalling (e.g. parity retry exhaustion).
var marshalMarkdownTargetHook func(path, sourcePath string, stagedEntries map[string]string) ([]byte, []string, error)

func (s *Service) marshalMarkdownTarget(path, sourcePath string, stagedEntries map[string]string) ([]byte, []string, error) {
	if marshalMarkdownTargetHook != nil {
		return marshalMarkdownTargetHook(path, sourcePath, stagedEntries)
	}
	mdx := strings.EqualFold(filepath.Ext(sourcePath), ".mdx")
	sourceTemplate, err := s.readFile(sourcePath)
	if err != nil {
		return nil, nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, err)
	}

	targetTemplate, err := s.readFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			content, diags := translationfileparser.MarshalMarkdownWithDiagnostics(sourceTemplate, stagedEntries, mdx)
			warnings := markdownRenderWarnings(path, diags)
			if astErr := markdownASTParityFlushError(path, sourceTemplate, content, sourcePath); astErr != nil {
				return nil, nil, astErr
			}
			return content, warnings, nil
		}
		return nil, nil, fmt.Errorf("flush outputs: read target file %q: %w", path, err)
	}

	content, diags := translationfileparser.MarshalMarkdownWithTargetFallbackDiagnostics(sourceTemplate, targetTemplate, stagedEntries, mdx)
	warnings := markdownRenderWarnings(path, diags)
	if astErr := markdownASTParityFlushError(path, sourceTemplate, content, sourcePath); astErr != nil {
		return nil, nil, astErr
	}
	return content, warnings, nil
}

func markdownASTParityFlushError(targetPath string, sourceTemplate, marshaledContent []byte, sourcePath string) error {
	if err := translationfileparser.ValidateMarkdownMarshaledASTParity(sourceTemplate, marshaledContent, sourcePath, targetPath); err != nil {
		return fmt.Errorf("flush outputs: markdown AST parity mismatch for %q: %w", targetPath, err)
	}
	return nil
}

func (s *Service) marshalHTMLTarget(path, sourcePath string, stagedEntries map[string]string) ([]byte, []string, error) {
	sourceTemplate, err := s.readFile(sourcePath)
	if err != nil {
		return nil, nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, err)
	}

	targetTemplate, err := s.readFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			content, diags := translationfileparser.MarshalHTML(sourceTemplate, stagedEntries)
			return content, htmlRenderWarnings(path, diags), nil
		}
		return nil, nil, fmt.Errorf("flush outputs: read target file %q: %w", path, err)
	}

	content, diags := translationfileparser.MarshalHTMLWithTargetFallback(sourceTemplate, targetTemplate, stagedEntries)
	return content, htmlRenderWarnings(path, diags), nil
}

func (s *Service) marshalLiquidTarget(path, sourcePath string, stagedEntries map[string]string) ([]byte, []string, error) {
	sourceTemplate, err := s.readFile(sourcePath)
	if err != nil {
		return nil, nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, err)
	}

	targetTemplate, err := s.readFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			content, diags := translationfileparser.MarshalLiquid(sourceTemplate, stagedEntries)
			return content, liquidRenderWarnings(path, diags), nil
		}
		return nil, nil, fmt.Errorf("flush outputs: read target file %q: %w", path, err)
	}

	content, diags := translationfileparser.MarshalLiquidWithTargetFallback(sourceTemplate, targetTemplate, stagedEntries)
	return content, liquidRenderWarnings(path, diags), nil
}

func htmlRenderWarnings(path string, diags translationfileparser.HTMLRenderDiagnostics) []string {
	if len(diags.SourceFallbackKeys) == 0 {
		return nil
	}
	keys := slices.Clone(diags.SourceFallbackKeys)
	slices.Sort(keys)
	// Compact is a defensive guard: each key should appear at most once because
	// every htmlPart has a unique key. If that invariant ever breaks, Compact
	// ensures len(keys) reflects unique keys, not total fallback occurrences.
	keys = slices.Compact(keys)
	if len(keys) > 3 {
		return []string{fmt.Sprintf("html render fell back to source for %d segments in %q (first keys: %s)", len(keys), path, strings.Join(keys[:3], ", "))}
	}
	return []string{fmt.Sprintf("html render fell back to source for %d segments in %q (keys: %s)", len(keys), path, strings.Join(keys, ", "))}
}

func liquidRenderWarnings(path string, diags translationfileparser.LiquidRenderDiagnostics) []string {
	if len(diags.SourceFallbackKeys) == 0 {
		return nil
	}
	keys := slices.Clone(diags.SourceFallbackKeys)
	slices.Sort(keys)
	keys = slices.Compact(keys)
	if len(keys) > 3 {
		return []string{fmt.Sprintf("liquid render fell back to source for %d segments in %q due to unrecoverable placeholder corruption (first keys: %s)", len(keys), path, strings.Join(keys[:3], ", "))}
	}
	return []string{fmt.Sprintf("liquid render fell back to source for %d segments in %q due to unrecoverable placeholder corruption (keys: %s)", len(keys), path, strings.Join(keys, ", "))}
}

func markdownRenderWarnings(path string, diags translationfileparser.MarkdownRenderDiagnostics) []string {
	if len(diags.SourceFallbackKeys) == 0 {
		return nil
	}
	keys := slices.Clone(diags.SourceFallbackKeys)
	slices.Sort(keys)
	keys = slices.Compact(keys)
	if len(keys) > 3 {
		return []string{fmt.Sprintf("markdown render fell back to source for %d segments in %q due to unrecoverable placeholder corruption (first keys: %s)", len(keys), path, strings.Join(keys[:3], ", "))}
	}
	return []string{fmt.Sprintf("markdown render fell back to source for %d segments in %q due to unrecoverable placeholder corruption (keys: %s)", len(keys), path, strings.Join(keys, ", "))}
}

func (s *Service) loadTemplateFallback(targetPath, sourcePath string) ([]byte, error) {
	content, err := s.readFile(targetPath)
	if err == nil {
		return content, nil
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("flush outputs: read target file %q: %w", targetPath, err)
	}
	template, srcErr := s.readFile(sourcePath)
	if srcErr != nil {
		return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
	}
	return template, nil
}
