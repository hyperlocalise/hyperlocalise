package mt

import (
	"fmt"
	"strings"

	"golang.org/x/text/language"
)

func validateBCP47(locale string) error {
	if locale == "" {
		return &Error{Code: ErrorCodeValidation, Message: "locale is required"}
	}
	if strings.TrimSpace(locale) != locale {
		return &Error{
			Code:    ErrorCodeValidation,
			Message: fmt.Sprintf("locale %q must not contain leading or trailing whitespace", locale),
		}
	}
	if _, err := language.Parse(locale); err != nil {
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
