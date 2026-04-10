package icuparser

// NumberFormatOptions holds parsed Intl.NumberFormat-style options from an ICU number skeleton.
// Field names align with FormatJS ExtendedNumberFormatOptions / ECMA-402.
// Empty string means unset for string fields; UseGrouping nil means unset.
type NumberFormatOptions struct {
	Style                    string // decimal | percent | currency | unit
	Currency                 string
	Unit                     string
	CurrencyDisplay          string
	UnitDisplay              string
	Notation                 string // standard | scientific | engineering | compact
	CompactDisplay           string // short | long
	SignDisplay              string
	CurrencySign             string
	MinimumIntegerDigits     int
	MaximumFractionDigits    int
	MinimumFractionDigits    int
	MaximumSignificantDigits int
	MinimumSignificantDigits int
	Scale                    float64
	UseGrouping              *bool
	RoundingMode             string
	RoundingPriority         string
	TrailingZeroDisplay      string
}

// DateTimeFormatOptions holds parsed Intl.DateTimeFormat-style options from a date/time skeleton.
type DateTimeFormatOptions struct {
	Era          string
	Year         string
	Month        string
	Day          string
	Weekday      string
	Hour         string
	Minute       string
	Second       string
	TimeZoneName string
	HourCycle    string
	Hour12       *bool
}
