package main

import (
	"errors"
	"math/big"
	"strings"
)

// Use big.Int because USD amounts scaled to 8 decimal places can exceed int64 during cost calculations.
const usdFractionDigits = 8

var (
	big30  = big.NewInt(30)
	big60  = big.NewInt(60)
	big80  = big.NewInt(80)
	big100 = big.NewInt(100)

	errInvalidUSD = errors.New("invalid_usd_amount")

	// Static zero padding lookup table to avoid heap allocations in string construction.
	zeroPaddings = [...]string{
		"",
		"0",
		"00",
		"000",
		"0000",
		"00000",
		"000000",
		"0000000",
		"00000000",
	}
)

// isValidUSDAmount validates positive decimal amounts with up to 8 decimal places without regex matching.
func isValidUSDAmount(value string) bool {
	if len(value) == 0 {
		return false
	}
	dot := strings.IndexByte(value, '.')
	if dot == -1 {
		for i := 0; i < len(value); i++ {
			if value[i] < '0' || value[i] > '9' {
				return false
			}
		}
		return true
	}
	if dot == 0 {
		return false
	}
	for i := 0; i < dot; i++ {
		if value[i] < '0' || value[i] > '9' {
			return false
		}
	}
	fracLen := len(value) - 1 - dot
	if fracLen < 1 || fracLen > usdFractionDigits {
		return false
	}
	for i := dot + 1; i < len(value); i++ {
		if value[i] < '0' || value[i] > '9' {
			return false
		}
	}
	return true
}

func usdUnits(value string) (*big.Int, error) {
	if !isValidUSDAmount(value) {
		return nil, errInvalidUSD
	}
	dot := strings.IndexByte(value, '.')
	var digitsStr string
	if dot == -1 {
		digitsStr = value + "00000000"
	} else {
		digitsStr = value[:dot] + value[dot+1:] + zeroPaddings[usdFractionDigits-(len(value)-1-dot)]
	}
	units, ok := new(big.Int).SetString(digitsStr, 10)
	if !ok {
		return nil, errInvalidUSD
	}
	return units, nil
}

// usdString converts scaled USD units (*big.Int) to a formatted string.
// Bypasses big.Int.QuoRem division by formatting digits directly from value.String().
func usdString(value *big.Int) string {
	if value == nil {
		return "0.00000000"
	}
	str := value.String()
	sign := ""
	digits := str
	if len(str) > 0 && str[0] == '-' {
		sign = "-"
		digits = str[1:]
	}
	n := len(digits)
	if n <= usdFractionDigits {
		return sign + "0." + zeroPaddings[usdFractionDigits-n] + digits
	}
	return sign + digits[:n-usdFractionDigits] + "." + digits[n-usdFractionDigits:]
}

func wordCost(rate string, words, payablePercent int) (*big.Int, error) {
	units, err := usdUnits(rate)
	if err != nil {
		return nil, err
	}
	if words != 1 {
		units.Mul(units, big.NewInt(int64(words)))
	}
	if payablePercent != 100 {
		units.Mul(units, big.NewInt(int64(payablePercent)))
		units.Quo(units, big100)
	}
	return units, nil
}

func hourlyCost(rate string, minutes int) (*big.Int, error) {
	units, err := usdUnits(rate)
	if err != nil {
		return nil, err
	}
	units.Mul(units, big.NewInt(int64(minutes)))
	units.Add(units, big30)
	return units.Quo(units, big60), nil
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
	accrued.Mul(accrued, big100)
	limit.Mul(limit, big80)
	if accrued.Cmp(limit) >= 0 {
		return "approaching", nil
	}
	return "none", nil
}
