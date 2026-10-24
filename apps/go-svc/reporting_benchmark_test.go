package main

import (
	"math/big"
	"net/url"
	"testing"
)

func BenchmarkUSDUnits(b *testing.B) {
	values := []string{"0.12", "37.5", "999999999999.99999999", "0.00000001"}
	b.ReportAllocs()
	for b.Loop() {
		for _, value := range values {
			if _, err := usdUnits(value); err != nil {
				b.Fatal(err)
			}
		}
	}
}

func BenchmarkUSDString(b *testing.B) {
	large, ok := new(big.Int).SetString("23999999999999999976", 10)
	if !ok {
		b.Fatal("invalid large usd amount")
	}
	values := []*big.Int{
		big.NewInt(12_000_000),
		big.NewInt(-150_000_000),
		large,
	}
	b.ReportAllocs()
	for b.Loop() {
		for _, value := range values {
			_ = usdString(value)
		}
	}
}

func BenchmarkWordCost(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		if _, err := wordCost("0.15", 333, 95); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkHourlyCost(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		if _, err := hourlyCost("37.5", 7); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkBudgetWarning(b *testing.B) {
	b.ReportAllocs()
	for b.Loop() {
		if _, err := budgetWarning("100", "80"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkReportingPayablePercent(b *testing.B) {
	raw := []byte(`{"new":25,"fuzzy":80,"exact":100}`)
	b.ReportAllocs()
	b.SetBytes(int64(len(raw)))
	for b.Loop() {
		if _, err := reportingPayablePercent(raw, "fuzzy"); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkParseReportQuery(b *testing.B) {
	values := url.Values{
		"from":      {"2026-01-01"},
		"to":        {"2026-03-31"},
		"projectId": {"proj_1"},
		"view":      {"costs"},
		"interval":  {"week"},
		"format":    {"csv"},
		"page":      {"2"},
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, ok := parseReportQuery(values); !ok {
			b.Fatal("expected valid report query")
		}
	}
}
