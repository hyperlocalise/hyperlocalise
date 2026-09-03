package mt

import (
	"fmt"
	"strings"

	"golang.org/x/text/language"
)

func validateBCP47(locale string) error {
	trimmed := strings.TrimSpace(locale)
	if trimmed == "" {
		return &Error{Code: ErrorCodeValidation, Message: "locale is required"}
	}
	if _, err := language.Parse(trimmed); err != nil {
		return &Error{
			Code:    ErrorCodeValidation,
			Message: fmt.Sprintf("locale %q must be a valid BCP 47 language tag", locale),
		}
	}
	return nil
}

func validateRequest(req Request) error {
	if err := validateBCP47(req.SourceLocale); err != nil {
		return err
	}
	if err := validateBCP47(req.TargetLocale); err != nil {
		return err
	}
	if len(req.Sources) == 0 {
		return &Error{Code: ErrorCodeValidation, Message: "sources must not be empty"}
	}
	return nil
}
