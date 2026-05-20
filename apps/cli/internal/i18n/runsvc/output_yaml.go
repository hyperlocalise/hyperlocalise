package runsvc

import (
	"errors"
	"fmt"
	"os"

	"github.com/hyperlocalise/hyperlocalise/internal/i18n/translationfileparser"
)

func marshalYAMLTarget(path string, template []byte, values map[string]string, pruneKeys map[string]struct{}) ([]byte, error) {
	allowedValues := allowedYAMLTargetValues(values, pruneKeys)

	var (
		content []byte
		err     error
	)
	if pruneKeys != nil {
		content, err = translationfileparser.MarshalYAMLWithPrune(template, allowedValues, pruneKeys)
	} else {
		content, err = translationfileparser.MarshalYAML(template, allowedValues)
	}
	if err != nil {
		return nil, fmt.Errorf("flush outputs: marshal %q: %w", path, err)
	}
	return content, nil
}

func (s *Service) marshalYAMLTargetWithFallback(path, sourcePath string, values map[string]string, pruneKeys map[string]struct{}) ([]byte, error) {
	allowedValues := allowedYAMLTargetValues(values, pruneKeys)
	targetTemplate, err := s.readFile(path)
	if err == nil {
		targetEntries, parseErr := (translationfileparser.YAMLParser{}).Parse(targetTemplate)
		if parseErr != nil || !hasYAMLTargetKeys(targetEntries, allowedValues) {
			sourceTemplate, srcErr := s.readFile(sourcePath)
			if srcErr != nil {
				return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
			}
			return marshalYAMLTarget(path, sourceTemplate, values, pruneKeys)
		}

		content, marshalErr := marshalYAMLTarget(path, targetTemplate, values, pruneKeys)
		if marshalErr == nil {
			return content, nil
		}

		sourceTemplate, srcErr := s.readFile(sourcePath)
		if srcErr != nil {
			return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
		}
		fallbackContent, fallbackErr := marshalYAMLTarget(path, sourceTemplate, values, pruneKeys)
		if fallbackErr == nil {
			return fallbackContent, nil
		}
		return nil, errors.Join(
			marshalErr,
			fmt.Errorf("flush outputs: fallback template %q: %w", sourcePath, fallbackErr),
		)
	}
	if !os.IsNotExist(err) {
		return nil, fmt.Errorf("flush outputs: read target file %q: %w", path, err)
	}

	sourceTemplate, srcErr := s.readFile(sourcePath)
	if srcErr != nil {
		return nil, fmt.Errorf("flush outputs: read template source %q: %w", sourcePath, srcErr)
	}
	return marshalYAMLTarget(path, sourceTemplate, values, pruneKeys)
}

func allowedYAMLTargetValues(values map[string]string, pruneKeys map[string]struct{}) map[string]string {
	if pruneKeys == nil {
		return values
	}
	allowedValues := make(map[string]string, len(values))
	for key, value := range values {
		if _, ok := pruneKeys[key]; ok {
			allowedValues[key] = value
		}
	}
	return allowedValues
}

func hasYAMLTargetKeys(targetEntries, values map[string]string) bool {
	for key := range values {
		if _, ok := targetEntries[key]; !ok {
			return false
		}
	}
	return true
}
