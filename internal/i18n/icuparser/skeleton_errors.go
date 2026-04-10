package icuparser

import (
	"errors"
	"fmt"
)

func errInvalidNumberSkeleton(msg string) error {
	return fmt.Errorf("invalid number skeleton: %s", msg)
}

func errMalformedNumberSkeleton(msg string) error {
	return errors.New(msg)
}
