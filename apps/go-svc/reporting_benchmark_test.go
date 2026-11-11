package main

import (
	"math/big"
	"strings"
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
	wide, ok := new(big.Int).SetString("23999999999999999976", 10)
	if !ok {
		b.Fatal("wide usd units")
	}
	values := []*big.Int{
		big.NewInt(12_000_000),
		big.NewInt(-150_000_000),
		wide,
	}
	b.ReportAllocs()
	for b.Loop() {
		for _, value := range values {
			if usdString(value) == "" {
				b.Fatal("empty usd string")
			}
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

func BenchmarkReportingCSVCell(b *testing.B) {
	cells := []string{"plain", `say "hi"`, "=1+1", "-3.25", strings.Repeat("x", 256)}
	b.ReportAllocs()
	for b.Loop() {
		for _, cell := range cells {
			if reportingCSVCell(cell) == "" {
				b.Fatal("empty cell")
			}
		}
	}
}

func BenchmarkReportingNumber(b *testing.B) {
	values := []float64{0, 0.5, 110, 12345678.25}
	b.ReportAllocs()
	for b.Loop() {
		for _, value := range values {
			if reportingNumber(value) == "" {
				b.Fatal("empty number")
			}
		}
	}
}
