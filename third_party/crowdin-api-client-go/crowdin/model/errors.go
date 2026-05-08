package model

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

var (
	// ErrNilRequest is returned when a request for a validation is nil.
	ErrNilRequest = errors.New("request cannot be nil")
)

// Error represents the schema for the error response.
type Error struct {
	Code    any    `json:"code"`
	Message string `json:"message"`
}

// UnmarshalJSON unmarshals the code field. It allows the code field
// to be either an integer or a string.
func (e *Error) UnmarshalJSON(data []byte) error {
	type Alias Error
	aux := &struct {
		Code json.RawMessage `json:"code"`
		*Alias
	}{
		Alias: (*Alias)(e),
	}
	if err := json.Unmarshal(data, &aux); err != nil {
		return err
	}

	var intCode int
	if err := json.Unmarshal(aux.Code, &intCode); err == nil {
		e.Code = intCode
		return nil
	}

	var strCode string
	if err := json.Unmarshal(aux.Code, &strCode); err == nil {
		e.Code = strCode
		return nil
	}

	return nil
}

// ErrorResponse is the error response structure from the API.
type ErrorResponse struct {
	Response *http.Response `json:"-"`

	Err Error `json:"error"`
}

// Error implements the Error interface.
func (r *ErrorResponse) Error() string {
	return fmt.Sprintf("%d %s", r.Err.Code, r.Err.Message)
}

// ValidationError represents the schema for the invalid
// request error response.
type ValidationError struct {
	ErrorDetail struct {
		Key    string  `json:"key"`
		Errors []Error `json:"errors"`
	} `json:"error"`
}

// Error implements the Error interface.
func (e *ValidationError) Error() string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("%s: ", e.ErrorDetail.Key))
	for i, err := range e.ErrorDetail.Errors {
		if i != 0 {
			sb.WriteString(", ")
		}

		var code string
		switch v := err.Code.(type) {
		case int:
			code = fmt.Sprintf("%d", v)
		case string:
			code = v
		default:
			code = "n/a"
		}

		sb.WriteString(fmt.Sprintf("%s (%s)", err.Message, code))
	}
	return sb.String()
}

// ValidationErrorResponse is the validation error response
// structure from the API.
type ValidationErrorResponse struct {
	Response *http.Response `json:"-"`

	Errors []ValidationError `json:"errors"`
	Status int
}

// Error implements the Error interface.
func (r *ValidationErrorResponse) Error() string {
	var sb strings.Builder
	for i, err := range r.Errors {
		if i != 0 {
			sb.WriteString("; ")
		}
		sb.WriteString(err.Error())
	}
	return sb.String()
}

// BatchValidationError represents the invalid batch request
// error response schema (string-based API).
type BatchValidationError struct {
	Index  int               `json:"index"`
	Errors []ValidationError `json:"errors"`
}

// Error implements the Error interface.
func (e *BatchValidationError) Error() string {
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Index: %d, ", e.Index))
	for i, err := range e.Errors {
		if i != 0 {
			sb.WriteString("; ")
		}
		sb.WriteString(err.Error())
	}
	return sb.String()
}

// BatchValidationErrorResponse is the batch validation error
// response structure from the API.
type BatchValidationErrorResponse struct {
	Response *http.Response `json:"-"`

	Errors []BatchValidationError `json:"errors"`
	Status int
}

// Error implements the Error interface.
func (r *BatchValidationErrorResponse) Error() string {
	var sb strings.Builder
	for i, err := range r.Errors {
		if i != 0 {
			sb.WriteString("; ")
		}
		sb.WriteString(err.Error())
	}
	return sb.String()
}

// GraphQLError represents a single GraphQL error.
type GraphQLError struct {
	Message    string         `json:"message"`
	Extensions map[string]any `json:"extensions"`
	Locations  []struct {
		Line   int `json:"line"`
		Column int `json:"column"`
	} `json:"locations"`
}

// Error implements error interface.
func (e GraphQLError) Error() string {
	return fmt.Sprintf("%s, Locations: %+v", e.Message, e.Locations)
}

// GraphQLErrorResponse represents a GraphQL error response.
type GraphQLErrorResponse struct {
	Errors []GraphQLError `json:"errors"`
}

// Error implements the Error interface.
func (r *GraphQLErrorResponse) Error() string {
	sb := strings.Builder{}
	for i, err := range r.Errors {
		if i != 0 {
			sb.WriteString("; ")
		}
		sb.WriteString(err.Error())
	}
	return sb.String()
}
