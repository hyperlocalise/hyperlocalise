package main

import (
	"math/big"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
)

var legacyUSDAmountPattern = regexp.MustCompile(`^\d+(\.\d{1,8})?$`)

func legacyUSDUnits(value string) (*big.Int, error) {
	if !legacyUSDAmountPattern.MatchString(value) {
		return nil, errInvalidUSD
	}
	whole, fraction, _ := strings.Cut(value, ".")
	units, ok := new(big.Int).SetString(whole+fraction+strings.Repeat("0", usdFractionDigits-len(fraction)), 10)
	if !ok {
		return nil, errInvalidUSD
	}
	return units, nil
}

func legacyUSDString(value *big.Int) string {
	sign := ""
	absolute := new(big.Int).Set(value)
	if absolute.Sign() < 0 {
		sign = "-"
		absolute.Neg(absolute)
	}
	whole, fraction := new(big.Int).QuoRem(absolute, big.NewInt(100_000_000), new(big.Int))
	digits := fraction.String()
	return sign + whole.String() + "." + strings.Repeat("0", usdFractionDigits-len(digits)) + digits
}

func mustUSD(t *testing.T, value *big.Int, err error) string {
	t.Helper()
	require.NoError(t, err)
	return usdString(value)
}

func TestReportingMoneyMatchesHono(t *testing.T) {
	tenCents, err := usdUnits("0.10")
	require.NoError(t, err)
	twentyCents, err := usdUnits("0.20")
	require.NoError(t, err)
	require.Equal(t, "0.30000000", usdString(new(big.Int).Add(tenCents, twentyCents)))

	cases := []struct {
		name string
		got  func() (*big.Int, error)
		want string
	}{
		{"word cost with payable percent", func() (*big.Int, error) { return wordCost("0.12", 1000, 25) }, "30.00000000"},
		{"smallest word cost", func() (*big.Int, error) { return wordCost("0.00000001", 1, 100) }, "0.00000001"},
		{"word cost truncates", func() (*big.Int, error) { return wordCost("0.00000001", 1, 50) }, "0.00000000"},
		{"fractional word cost", func() (*big.Int, error) { return wordCost("0.15", 333, 95) }, "47.45250000"},
		{"hourly cost", func() (*big.Int, error) { return hourlyCost("60", 15) }, "15.00000000"},
		{"hourly cost rounds half up", func() (*big.Int, error) { return hourlyCost("0.00000001", 30) }, "0.00000001"},
		{"hourly cost rounds below half down", func() (*big.Int, error) { return hourlyCost("0.00000001", 29) }, "0.00000000"},
		{"hourly cost fraction", func() (*big.Int, error) { return hourlyCost("37.5", 7) }, "4.37500000"},
		{"hourly cost beyond int64", func() (*big.Int, error) { return hourlyCost("999999999999.99999999", 1440) }, "23999999999999.99999976"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			value, err := tc.got()
			require.Equal(t, tc.want, mustUSD(t, value, err))
		})
	}

	require.Equal(t, "-1.50000000", usdString(big.NewInt(-150_000_000)))
	budget, err := usdUnits("100")
	require.NoError(t, err)
	spent, err := usdUnits("250.5")
	require.NoError(t, err)
	require.Equal(t, "-150.50000000", usdString(budget.Sub(budget, spent)))

	for _, invalid := range []string{"-1", "", "1.", ".5", "1.123456789", "1e3", " 1", "+1", "1.2.3", "1..2", ".", "..", "1. ", "1.0.0"} {
		_, err := usdUnits(invalid)
		require.ErrorIs(t, err, errInvalidUSD, invalid)
	}

	for _, valid := range []string{"0", "00", "0.0", "0.10", "100", "1.12345678", "1.1234567", "999999999999.99999999"} {
		got, err := usdUnits(valid)
		require.NoError(t, err, valid)
		want, err := legacyUSDUnits(valid)
		require.NoError(t, err, valid)
		require.Equal(t, 0, got.Cmp(want), valid)
	}
}

func TestUSDStringMatchesLegacyQuoRem(t *testing.T) {
	values := []*big.Int{
		big.NewInt(0),
		big.NewInt(1),
		big.NewInt(-1),
		big.NewInt(99_999_999),
		big.NewInt(100_000_000),
		big.NewInt(100_000_001),
		big.NewInt(-150_000_000),
		big.NewInt(12_000_000),
	}
	large, ok := new(big.Int).SetString("23999999999999999976", 10)
	require.True(t, ok)
	values = append(values, large, new(big.Int).Neg(large))

	for _, value := range values {
		require.Equal(t, legacyUSDString(value), usdString(value), value.String())
	}
}

func TestUSDUnitsRoundTrip(t *testing.T) {
	for _, value := range []string{"0", "0.1", "0.10", "1.23456789", "100", "999999999999.99999999"} {
		units, err := usdUnits(value)
		require.NoError(t, err, value)
		formatted := usdString(units)
		again, err := usdUnits(formatted)
		require.NoError(t, err, formatted)
		require.Equal(t, 0, units.Cmp(again), value)
	}
}

func TestWordCostFullPercent(t *testing.T) {
	full, err := wordCost("0.15", 10, 100)
	require.Equal(t, "1.50000000", mustUSD(t, full, err))
	zero, err := wordCost("0.15", 0, 50)
	require.Equal(t, "0.00000000", mustUSD(t, zero, err))
}

func TestReportingPayablePercent(t *testing.T) {
	for _, tc := range []struct {
		name    string
		raw     []byte
		bucket  string
		want    int
		wantErr bool
	}{
		{name: "empty defaults to 100", bucket: "new", want: 100},
		{name: "json null defaults to 100", raw: []byte("null"), bucket: "new", want: 100},
		{name: "missing bucket defaults to 100", raw: []byte(`{"new":80}`), bucket: "fuzzy", want: 100},
		{name: "null bucket defaults to 100", raw: []byte(`{"new":null}`), bucket: "new", want: 100},
		{name: "integer percent", raw: []byte(`{"new":25,"fuzzy":80}`), bucket: "new", want: 25},
		{name: "whole float is accepted", raw: []byte(`{"new":50.0}`), bucket: "new", want: 50},
		{name: "fractional percent is rejected", raw: []byte(`{"new":12.5}`), bucket: "new", wantErr: true},
		{name: "invalid json is rejected", raw: []byte(`{`), bucket: "new", wantErr: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := reportingPayablePercent(tc.raw, tc.bucket)
			if tc.wantErr {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			require.Equal(t, tc.want, got)
		})
	}
}

func TestReportingBudgetWarning(t *testing.T) {
	for _, tc := range []struct{ budget, cost, want string }{
		{"100", "79.99", "none"},
		{"100", "80", "approaching"},
		{"100", "100", "exceeded"},
		{"0", "0", "exceeded"},
	} {
		got, err := budgetWarning(tc.budget, tc.cost)
		require.NoError(t, err)
		require.Equal(t, tc.want, got, tc)
	}
	_, err := budgetWarning("100", "-1")
	require.ErrorIs(t, err, errInvalidUSD)
}
