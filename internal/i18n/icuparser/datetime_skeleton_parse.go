package icuparser

import (
	"fmt"
	"regexp"
	"strings"
)

// dateTimeFieldRE matches LDML date/time field symbols (from formatjs date-time.ts).
// Go regexp has no lookahead; we strip quoted literals first via stripICUQuotes.
var dateTimeFieldRE = regexp.MustCompile(
	`(?:[Eec]{1,6}|G{1,5}|[Qq]{1,5}|(?:[yYur]+|U{1,5})|[ML]{1,5}|d{1,2}|D{1,3}|F{1}|[abB]{1,5}|[hkHK]{1,2}|w{1,2}|W{1}|m{1,2}|s{1,2}|[zZOvVxX]{1,4})`,
)

// ParseDateTimeSkeleton parses a date or time skeleton string into DateTimeFormatOptions.
// Ported from formatjs/packages/icu-skeleton-parser/date-time.ts (parseDateTimeSkeleton).
func ParseDateTimeSkeleton(skeleton string) (DateTimeFormatOptions, error) {
	clean := stripICUQuotes(skeleton)
	var result DateTimeFormatOptions
	matches := dateTimeFieldRE.FindAllString(clean, -1)
	for _, match := range matches {
		if err := applyDateTimeField(&result, match); err != nil {
			return DateTimeFormatOptions{}, err
		}
	}
	return result, nil
}

// stripICUQuotes removes ICU single-quoted literal spans so LDML field matching
// ignores literal text (aligned with formatjs date-time.ts lookahead behavior).
func stripICUQuotes(s string) string {
	var b strings.Builder
	i := 0
	for i < len(s) {
		if s[i] != '\'' {
			b.WriteByte(s[i])
			i++
			continue
		}
		if i+1 < len(s) && s[i+1] == '\'' {
			b.WriteByte('\'')
			i += 2
			continue
		}
		i++
		for i < len(s) {
			if s[i] == '\'' {
				if i+1 < len(s) && s[i+1] == '\'' {
					i += 2
					continue
				}
				i++
				break
			}
			i++
		}
	}
	return b.String()
}

func applyDateTimeField(result *DateTimeFormatOptions, match string) error {
	if match == "" {
		return nil
	}
	first := match[0]
	length := len(match)
	switch first {
	case 'G':
		switch length {
		case 4:
			result.Era = "long"
		case 5:
			result.Era = "narrow"
		default:
			result.Era = "short"
		}
	case 'y':
		if length == 2 {
			result.Year = "2-digit"
		} else {
			result.Year = "numeric"
		}
	case 'Y', 'u', 'U', 'r':
		return fmt.Errorf("`Y/u/U/r` (year) patterns are not supported, use `y` instead")
	case 'q', 'Q':
		return fmt.Errorf("`q/Q` (quarter) patterns are not supported")
	case 'M', 'L':
		months := []string{"numeric", "2-digit", "short", "long", "narrow"}
		idx := length - 1
		if idx < 0 || idx >= len(months) {
			idx = len(months) - 1
		}
		result.Month = months[idx]
	case 'w', 'W':
		return fmt.Errorf("`w/W` (week) patterns are not supported")
	case 'd':
		if length >= 1 && length <= 2 {
			days := []string{"numeric", "2-digit"}
			result.Day = days[length-1]
		}
	case 'D', 'F', 'g':
		return fmt.Errorf("`D/F/g` (day) patterns are not supported, use `d` instead")
	case 'E':
		switch length {
		case 4:
			result.Weekday = "long"
		case 5:
			result.Weekday = "narrow"
		default:
			result.Weekday = "short"
		}
	case 'e':
		if length < 4 {
			return fmt.Errorf("`e..eee` (weekday) patterns are not supported")
		}
		wd := []string{"short", "long", "narrow", "short"}
		idx := length - 4
		if idx < 0 || idx >= len(wd) {
			idx = len(wd) - 1
		}
		result.Weekday = wd[idx]
	case 'c':
		if length < 4 {
			return fmt.Errorf("`c..ccc` (weekday) patterns are not supported")
		}
		wd := []string{"short", "long", "narrow", "short"}
		idx := length - 4
		if idx < 0 || idx >= len(wd) {
			idx = len(wd) - 1
		}
		result.Weekday = wd[idx]
	case 'a':
		t := true
		result.Hour12 = &t
	case 'b', 'B':
		return fmt.Errorf("`b/B` (period) patterns are not supported, use `a` instead")
	case 'h':
		result.HourCycle = "h12"
		if length >= 1 && length <= 2 {
			h := []string{"numeric", "2-digit"}
			result.Hour = h[length-1]
		}
	case 'H':
		result.HourCycle = "h23"
		if length >= 1 && length <= 2 {
			h := []string{"numeric", "2-digit"}
			result.Hour = h[length-1]
		}
	case 'K':
		result.HourCycle = "h11"
		if length >= 1 && length <= 2 {
			h := []string{"numeric", "2-digit"}
			result.Hour = h[length-1]
		}
	case 'k':
		result.HourCycle = "h24"
		if length >= 1 && length <= 2 {
			h := []string{"numeric", "2-digit"}
			result.Hour = h[length-1]
		}
	case 'j', 'J', 'C':
		return fmt.Errorf("`j/J/C` (hour) patterns are not supported, use `h/H/K/k` instead")
	case 'm':
		if length >= 1 && length <= 2 {
			m := []string{"numeric", "2-digit"}
			result.Minute = m[length-1]
		}
	case 's':
		if length >= 1 && length <= 2 {
			sec := []string{"numeric", "2-digit"}
			result.Second = sec[length-1]
		}
	case 'S', 'A':
		return fmt.Errorf("`S/A` (second) patterns are not supported, use `s` instead")
	case 'z':
		if length < 4 {
			result.TimeZoneName = "short"
		} else {
			result.TimeZoneName = "long"
		}
	case 'Z', 'O', 'v', 'V', 'X', 'x':
		return fmt.Errorf("`Z/O/v/V/X/x` (timeZone) patterns are not supported, use `z` instead")
	}
	return nil
}
