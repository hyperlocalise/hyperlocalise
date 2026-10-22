package main

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"
)

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

	for _, invalid := range []string{"-1", "", "1.", ".5", "1.123456789", "1e3", " 1"} {
		_, err := usdUnits(invalid)
		require.ErrorIs(t, err, errInvalidUSD, invalid)
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
