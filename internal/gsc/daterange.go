package gsc

import "time"

// Search Analytics option sets shared with API callers.
const (
	DimensionQuery            = "query"
	DimensionPage             = "page"
	DimensionCountry          = "country"
	DimensionDevice           = "device"
	DimensionDate             = "date"
	DimensionSearchAppearance = "searchAppearance"

	FilterOperatorEquals      = "equals"
	FilterOperatorNotEquals   = "notEquals"
	FilterOperatorContains    = "contains"
	FilterOperatorNotContains = "notContains"

	SearchTypeWeb        = "web"
	SearchTypeImage      = "image"
	SearchTypeVideo      = "video"
	SearchTypeNews       = "news"
	SearchTypeGoogleNews = "googleNews"
	SearchTypeDiscover   = "discover"

	DataStateAll   = "all"
	DataStateFinal = "final"

	DefaultRowLimit = 1000
	MaxRowLimit     = 1000
	DataLagDays     = 3
)

// DateRange is a convenience preset for Search Analytics queries.
type DateRange string

const (
	DateRangeLast7Days    DateRange = "last_7_days"
	DateRangeLast28Days   DateRange = "last_28_days"
	DateRangeLast3Months  DateRange = "last_3_months"
	DateRangeLast6Months  DateRange = "last_6_months"
	DateRangeLast12Months DateRange = "last_12_months"
	DateRangeLast16Months DateRange = "last_16_months"
)

// PerformanceInput is a higher-level request shape for Search Analytics.
type PerformanceInput struct {
	Dimensions []string
	DateRange  DateRange
	StartDate  string
	EndDate    string
	Filters    []DimensionFilter
	RowLimit   int
	StartRow   int
	Type       string
	DataState  string
}

// BuildSearchAnalyticsRequest converts validated input into a GSC API request.
// Flat filters are wrapped into dimensionFilterGroups because GSC silently
// ignores a top-level filters field.
func BuildSearchAnalyticsRequest(input PerformanceInput, today time.Time) SearchAnalyticsRequest {
	if today.IsZero() {
		today = time.Now().UTC()
	}

	startDate, endDate := ResolveDateRange(input, today)
	dimensions := input.Dimensions
	if len(dimensions) == 0 {
		dimensions = []string{DimensionQuery}
	}

	request := SearchAnalyticsRequest{
		StartDate:  startDate,
		EndDate:    endDate,
		Dimensions: dimensions,
		RowLimit:   clampLimit(input.RowLimit, 1, MaxRowLimit, DefaultRowLimit),
		Type:       defaultString(input.Type, SearchTypeWeb),
		DataState:  defaultString(input.DataState, DataStateAll),
	}
	if input.StartRow > 0 {
		request.StartRow = input.StartRow
	}
	if len(input.Filters) > 0 {
		request.DimensionFilterGroups = []DimensionFilterGroup{{
			GroupType: "and",
			Filters:   input.Filters,
		}}
	}
	return request
}

// ResolveDateRange resolves a convenience date range or explicit start/end into
// GSC dates. today is injectable for deterministic tests.
func ResolveDateRange(input PerformanceInput, today time.Time) (startDate, endDate string) {
	floor := formatDate(subtractUTCMonths(today, 16))

	if input.StartDate != "" && input.EndDate != "" {
		start := input.StartDate
		if start < floor {
			start = floor
		}
		return start, input.EndDate
	}

	end := today.UTC()
	end = end.AddDate(0, 0, -DataLagDays)
	start := subtractRange(end, input.DateRange)
	startStr := formatDate(start)
	if startStr < floor {
		startStr = floor
	}
	return startStr, formatDate(end)
}

func subtractRange(end time.Time, dateRange DateRange) time.Time {
	switch dateRange {
	case DateRangeLast7Days:
		return end.AddDate(0, 0, -7)
	case DateRangeLast28Days:
		return end.AddDate(0, 0, -28)
	case DateRangeLast3Months:
		return subtractUTCMonths(end, 3)
	case DateRangeLast6Months:
		return subtractUTCMonths(end, 6)
	case DateRangeLast12Months:
		return subtractUTCMonths(end, 12)
	case DateRangeLast16Months:
		return subtractUTCMonths(end, 16)
	default:
		return end.AddDate(0, 0, -28)
	}
}

func subtractUTCMonths(date time.Time, months int) time.Time {
	year, month, day := date.Date()
	target := time.Date(year, month, 1, 0, 0, 0, 0, time.UTC).AddDate(0, -months, 0)
	daysInTargetMonth := time.Date(
		target.Year(),
		target.Month()+1,
		0,
		0, 0, 0, 0,
		time.UTC,
	).Day()
	if day > daysInTargetMonth {
		day = daysInTargetMonth
	}
	return time.Date(target.Year(), target.Month(), day, 0, 0, 0, 0, time.UTC)
}

func formatDate(date time.Time) string {
	return date.UTC().Format("2006-01-02")
}

func clampLimit(value, min, max, fallback int) int {
	if value <= 0 {
		value = fallback
	}
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func defaultString(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
