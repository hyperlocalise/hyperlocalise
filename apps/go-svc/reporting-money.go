package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"regexp"
	"strings"
)

// Use big.Int because USD amounts scaled to 8 decimal places can exceed int64 during cost calculations.
const usdFractionDigits = 8

var (
	usdScale         = big.NewInt(100_000_000)
	usdAmountPattern = regexp.MustCompile(`^\d+(\.\d{1,8})?$`)
	errInvalidUSD    = errors.New("invalid_usd_amount")
)

func usdUnits(value string) (*big.Int, error) {
	if !usdAmountPattern.MatchString(value) {
		return nil, errInvalidUSD
	}
	whole, fraction, _ := strings.Cut(value, ".")
	units, ok := new(big.Int).SetString(whole+fraction+strings.Repeat("0", usdFractionDigits-len(fraction)), 10)
	if !ok {
		return nil, errInvalidUSD
	}
	return units, nil
}

func usdString(value *big.Int) string {
	sign := ""
	absolute := new(big.Int).Set(value)
	if absolute.Sign() < 0 {
		sign = "-"
		absolute.Neg(absolute)
	}
	whole, fraction := new(big.Int).QuoRem(absolute, usdScale, new(big.Int))
	digits := fraction.String()
	return sign + whole.String() + "." + strings.Repeat("0", usdFractionDigits-len(digits)) + digits
}

func wordCost(rate string, words, payablePercent int) (*big.Int, error) {
	units, err := usdUnits(rate)
	if err != nil {
		return nil, err
	}
	units.Mul(units, big.NewInt(int64(words)))
	units.Mul(units, big.NewInt(int64(payablePercent)))
	return units.Quo(units, big.NewInt(100)), nil
}

func hourlyCost(rate string, minutes int) (*big.Int, error) {
	units, err := usdUnits(rate)
	if err != nil {
		return nil, err
	}
	units.Mul(units, big.NewInt(int64(minutes)))
	units.Add(units, big.NewInt(30))
	return units.Quo(units, big.NewInt(60)), nil
}

func budgetWarning(budget, cost string) (string, error) {
	limit, err := usdUnits(budget)
	if err != nil {
		return "", err
	}
	accrued, err := usdUnits(cost)
	if err != nil {
		return "", err
	}
	if accrued.Cmp(limit) >= 0 {
		return "exceeded", nil
	}
	accrued.Mul(accrued, big.NewInt(100))
	limit.Mul(limit, big.NewInt(80))
	if accrued.Cmp(limit) >= 0 {
		return "approaching", nil
	}
	return "none", nil
}

// reportingPayablePercent is the share of a rate paid for a match band, from a rate line's
// percentages; a band the line does not name is paid in full.
func reportingPayablePercent(raw []byte, bucket string) (int, error) {
	if len(raw) == 0 || isJSONNull(raw) {
		return 100, nil
	}
	var percentages map[string]*float64
	if err := json.Unmarshal(raw, &percentages); err != nil {
		return 0, fmt.Errorf("decode reporting rate percentages: %w", err)
	}
	value, ok := percentages[bucket]
	if !ok || value == nil {
		return 100, nil
	}
	if *value != math.Trunc(*value) {
		return 0, fmt.Errorf("reporting rate percentage is not an integer")
	}
	return int(*value), nil
}
