package main

import "time"

// The dates a Reports section covers, and the period of the same length just before them that its
// headline numbers are compared with. Days are UTC calendar days as YYYY-MM-DD.

const (
	reportingDefaultDays = 28
	// Periods longer than this are charted week by week rather than day by day.
	reportingWeeklyAboveDays = 45
)

type reportingPeriod struct {
	From         string `json:"from"`
	To           string `json:"to"`
	Days         int    `json:"days"`
	PreviousFrom string `json:"previousFrom"`
	PreviousTo   string `json:"previousTo"`
	Interval     string `json:"interval"`
	// The previous period starts on or after the day Reports started, so it can be compared.
	HasEarlierData bool `json:"hasEarlierData"`
}

func reportingDayTime(day string) time.Time {
	t, _ := time.Parse(time.DateOnly, day)
	return t
}

func reportingAddDays(day string, offset int) string {
	return reportingDayTime(day).AddDate(0, 0, offset).Format(time.DateOnly)
}

// reportingDaysBetween counts the days from one day to another, both included.
func reportingDaysBetween(from, to string) int {
	return int(reportingDayTime(to).Sub(reportingDayTime(from)).Hours()/24) + 1
}

// resolveReportingPeriod is the period to report on: the last 28 days by default, never past
// today. startedDay is the UTC day Reports started for the workspace, "" when it has recorded
// nothing yet. from and to are "" when not asked for.
func resolveReportingPeriod(from, to, today, startedDay string) reportingPeriod {
	if to == "" || to >= today {
		to = today
	}
	if from == "" {
		from = reportingAddDays(to, -(reportingDefaultDays - 1))
	}
	if from > to {
		from = to
	}
	days := reportingDaysBetween(from, to)
	previousFrom := reportingAddDays(from, -days)
	interval := "day"
	if days > reportingWeeklyAboveDays {
		interval = "week"
	}
	return reportingPeriod{
		From:           from,
		To:             to,
		Days:           days,
		PreviousFrom:   previousFrom,
		PreviousTo:     reportingAddDays(from, -1),
		Interval:       interval,
		HasEarlierData: startedDay != "" && previousFrom >= startedDay,
	}
}
