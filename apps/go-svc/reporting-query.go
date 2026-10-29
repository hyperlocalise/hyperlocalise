package main

import (
	"math"
	"net/http"
	"net/url"
	"slices"
	"strconv"
	"strings"
)

// Query strings as the web schemas take them: every parameter optional, as text, repeated keys
// refused, lengths in UTF-16 units. A parameter given empty is present and invalid, as in Zod.

type reportingQuery struct {
	values url.Values
	valid  bool
}

func readReportingQuery(r *http.Request) *reportingQuery {
	return &reportingQuery{values: r.URL.Query(), valid: true}
}

func (q *reportingQuery) fail() { q.valid = false }

func (q *reportingQuery) err() error {
	if q.valid {
		return nil
	}
	return reportingInvalidQuery()
}

// raw is the parameter's one value and whether it was given at all.
func (q *reportingQuery) raw(key string) (string, bool) {
	values, ok := q.values[key]
	if !ok {
		return "", false
	}
	if len(values) != 1 || !reportingValidText(values[0]) {
		q.fail()
		return "", false
	}
	return values[0], true
}

func (q *reportingQuery) text(key string, minLength, maxLength int) string {
	value, ok := q.raw(key)
	if !ok {
		return ""
	}
	if n := utf16Length(value); n < minLength || n > maxLength {
		q.fail()
		return ""
	}
	return value
}

func (q *reportingQuery) choice(key, fallback string, options ...string) string {
	value, ok := q.raw(key)
	if !ok {
		return fallback
	}
	if !slices.Contains(options, value) {
		q.fail()
		return fallback
	}
	return value
}

// day is a calendar day from 2000 on: Reports has nothing earlier, and the day maths needs a
// four-digit year.
func (q *reportingQuery) day(key string) string {
	value, ok := q.raw(key)
	if !ok {
		return ""
	}
	if !isReportingDay(value) || value < "2000-01-01" {
		q.fail()
		return ""
	}
	return value
}

// dates are the optional from and to days, in order.
func (q *reportingQuery) dates() (string, string) {
	from, to := q.day("from"), q.day("to")
	if from != "" && to != "" && from > to {
		q.fail()
	}
	return from, to
}

func (q *reportingQuery) id(key string) string { return q.text(key, 1, 200) }

// scope is the optional project, task and target language filters.
func (q *reportingQuery) scope() (projectID, jobID, targetLocale string) {
	return q.id("projectId"), q.id("jobId"), q.text("targetLocale", 2, 35)
}

func (q *reportingQuery) unit() string {
	return q.choice("unit", "words", reportingUnitOptions...)
}

func (q *reportingQuery) step(fallback string) string {
	return q.choice("step", fallback, reportingStepOptions...)
}

func (q *reportingQuery) format() string {
	return q.choice("format", "json", "json", "csv")
}

// number is an optional whole number in a range, read as z.coerce.number() does: any text
// JavaScript's Number accepts, so "" is 0 and " 5 " is 5.
func (q *reportingQuery) number(key string, minValue, maxValue, fallback int) int {
	raw, ok := q.raw(key)
	if !ok {
		return fallback
	}
	value := jsNumber(raw)
	if math.IsNaN(value) || value != math.Trunc(value) || value < float64(minValue) || value > float64(maxValue) {
		q.fail()
		return fallback
	}
	return int(value)
}

func (q *reportingQuery) page() int { return q.number("page", 1, 10_000, 1) }

// flag is an optional "true" or "false", as the web's enum flags are.
func (q *reportingQuery) flag(key string, fallback bool) bool {
	return q.choice(key, strconv.FormatBool(fallback), "true", "false") == "true"
}

// trimmed is optional text trimmed as JavaScript trims, "" when not given.
func (q *reportingQuery) trimmed(key string, maxLength int) string {
	value, ok := q.raw(key)
	if !ok {
		return ""
	}
	value = jsTrim(value)
	if utf16Length(value) > maxLength {
		q.fail()
		return ""
	}
	return value
}

// idList is up to 50 tasks as a comma-separated list, each once; "" or absent is none.
func (q *reportingQuery) idList(key string) []string {
	value, ok := q.raw(key)
	if !ok {
		return nil
	}
	if utf16Length(value) > 50*201 {
		q.fail()
		return nil
	}
	ids := []string{}
	for _, id := range strings.Split(value, ",") {
		if id == "" || slices.Contains(ids, id) {
			continue
		}
		if utf16Length(id) > 200 {
			q.fail()
			return nil
		}
		ids = append(ids, id)
	}
	if len(ids) > 50 {
		q.fail()
		return nil
	}
	return ids
}
