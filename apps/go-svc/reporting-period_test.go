package main

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestReportingPeriodDefaultsToLast28DaysComparedWithThe28Before(t *testing.T) {
	require.Equal(t, reportingPeriod{
		From:           "2026-09-24",
		To:             "2026-10-21",
		Days:           28,
		PreviousFrom:   "2026-08-27",
		PreviousTo:     "2026-09-23",
		Interval:       "day",
		HasEarlierData: true,
	}, resolveReportingPeriod("", "", "2026-10-21", "2026-01-01"))
}

func TestReportingPeriodNeverRunsPastTodayAndChartsLongPeriodsByWeek(t *testing.T) {
	period := resolveReportingPeriod("2026-07-24", "2026-12-31", "2026-10-21", "2026-01-01")
	require.Equal(t, "2026-10-21", period.To)
	require.Equal(t, 90, period.Days)
	require.Equal(t, "week", period.Interval)

	period = resolveReportingPeriod("2026-09-01", "2026-10-15", "2026-10-21", "")
	require.Equal(t, 45, period.Days)
	require.Equal(t, "day", period.Interval)
	require.False(t, period.HasEarlierData)

	// A start after today is pulled back to today: a one-day period.
	period = resolveReportingPeriod("2026-10-25", "", "2026-10-21", "")
	require.Equal(t, "2026-10-21", period.From)
	require.Equal(t, 1, period.Days)
}

func TestReportingPeriodHasNoEarlierDataWhenThePreviousPeriodStartsBeforeReportsDid(t *testing.T) {
	require.False(t, resolveReportingPeriod("", "", "2026-10-21", "2026-08-28").HasEarlierData)
	require.True(t, resolveReportingPeriod("", "", "2026-10-21", "2026-08-27").HasEarlierData)
}

func TestReportingDaysAcrossMonthAndYearEnds(t *testing.T) {
	require.Equal(t, "2027-01-01", reportingAddDays("2026-12-31", 1))
	require.Equal(t, "2026-02-28", reportingAddDays("2026-03-01", -1))
	require.Equal(t, 14, reportingDaysBetween("2026-12-25", "2027-01-07"))
}
