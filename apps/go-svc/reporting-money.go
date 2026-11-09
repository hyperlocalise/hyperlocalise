package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"math/big"
	"strconv"
)

// Use big.Int because USD amounts scaled to 8 decimal places can exceed int64 during cost calculations.
const usdFractionDigits = 8

var (
	halfMinute     = big.NewInt(30)
	minutesPerHour = big.NewInt(60)
	budgetWarnPct  = big.NewInt(80)
	percentScale   = big.NewInt(100)

	errInvalidUSD = errors.New("invalid_usd_amount")

	// Static zero padding for 8-decimal fixed-point formatting. Do not mutate.
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

// usdAmountDot reports the decimal-point index in a valid USD amount.
// A missing decimal point is -1. The amount must be digits, optionally with a 1–8 digit fraction.
func usdAmountDot(value string) (dot int, ok bool) {
	n := len(value)
	if n == 0 {
		return -1, false
	}
	dot = -1
	for i := 0; i < n; i++ {
		c := value[i]
		if c == '.' {
			if dot >= 0 || i == 0 {
				return -1, false
			}
			dot = i
			continue
		}
		if c < '0' || c > '9' {
			return -1, false
		}
	}
	if dot == -1 {
		return -1, true
	}
	fracLen := n - 1 - dot
	if fracLen < 1 || fracLen > usdFractionDigits {
		return -1, false
	}
	return dot, true
}

func usdUnits(value string) (*big.Int, error) {
	dot, valid := usdAmountDot(value)
	if !valid {
		return nil, errInvalidUSD
	}
	var digits string
	if dot < 0 {
		digits = value + zeroPaddings[usdFractionDigits]
	} else {
		digits = value[:dot] + value[dot+1:] + zeroPaddings[usdFractionDigits-(len(value)-1-dot)]
	}
	units, ok := new(big.Int).SetString(digits, 10)
	if !ok {
		return nil, errInvalidUSD
	}
	return units, nil
}

func usdString(value *big.Int) string {
	digits := value.String()
	sign := ""
	if digits[0] == '-' {
		sign = "-"
		digits = digits[1:]
	}
	if n := len(digits); n <= usdFractionDigits {
		return sign + "0." + zeroPaddings[usdFractionDigits-n] + digits
	}
	return sign + digits[:len(digits)-usdFractionDigits] + "." + digits[len(digits)-usdFractionDigits:]
}

// reportingPaidPercent is the share of a match band a rate line pays, from its band percentages.
// The unavailable band (the memory could not be read when the string arrived) is paid as new
// work. Spent and the estimate both price by this one rule.
func reportingPaidPercent(raw []byte, bucket string) (int, error) {
	if bucket == "unavailable" {
		bucket = "new"
	}
	return reportingPayablePercent(raw, bucket)
}

// unitCost is the cost of a number of units (words or characters) at a per-unit rate and
// payable share.
func unitCost(rate string, units, payablePercent int) (*big.Int, error) {
	return wordCost(rate, units, payablePercent)
}

// usdFloat is an amount as JavaScript's Number reads it: the nearest double.
func usdFloat(text string) (float64, error) {
	if _, err := usdUnits(text); err != nil {
		return 0, err
	}
	return strconv.ParseFloat(text, 64)
}

// jsToFixed2 writes a non-negative number to two decimals as JavaScript's toFixed(2) does: the
// closest hundredth of the exact binary value, the larger one when two are equally close.
func jsToFixed2(value float64) string {
	exact := new(big.Float).SetPrec(256).SetFloat64(value)
	exact.Mul(exact, big.NewFloat(100))
	exact.Add(exact, big.NewFloat(0.5))
	cents, _ := exact.Int(nil)
	whole, fraction := new(big.Int).QuoRem(cents, big.NewInt(100), new(big.Int))
	return fmt.Sprintf("%s.%02d", whole, fraction.Int64())
}

func wordCost(rate string, words, payablePercent int) (*big.Int, error) {
	units, err := usdUnits(rate)
	if err != nil {
		return nil, err
	}
	units.Mul(units, big.NewInt(int64(words)))
	units.Mul(units, big.NewInt(int64(payablePercent)))
	return units.Quo(units, percentScale), nil
}

func hourlyCost(rate string, minutes int) (*big.Int, error) {
	units, err := usdUnits(rate)
	if err != nil {
		return nil, err
	}
	units.Mul(units, big.NewInt(int64(minutes)))
	units.Add(units, halfMinute)
	return units.Quo(units, minutesPerHour), nil
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
	accrued.Mul(accrued, percentScale)
	limit.Mul(limit, budgetWarnPct)
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
