package editor_export

import (
	"testing"
)

func benchmarkExportRows() []Row {
	return makeExportRows(1_000)
}

func BenchmarkSerializeCSV100(b *testing.B) {
	rows := makeExportRows(100)
	benchmarkSerialize(b, func() { _ = SerializeCSV(rows) })
}

func BenchmarkSerializeCSV1000(b *testing.B) {
	rows := makeExportRows(1_000)
	benchmarkSerialize(b, func() { _ = SerializeCSV(rows) })
}

func BenchmarkSerializeCSV5000(b *testing.B) {
	rows := makeExportRows(5_000)
	benchmarkSerialize(b, func() { _ = SerializeCSV(rows) })
}

func BenchmarkSerializeTMX100(b *testing.B) {
	rows := makeExportRows(100)
	benchmarkSerialize(b, func() { _ = SerializeTMX(rows) })
}

func BenchmarkSerializeTMX1000(b *testing.B) {
	rows := makeExportRows(1_000)
	benchmarkSerialize(b, func() { _ = SerializeTMX(rows) })
}

func BenchmarkSerializeTMX5000(b *testing.B) {
	rows := makeExportRows(5_000)
	benchmarkSerialize(b, func() { _ = SerializeTMX(rows) })
}

func BenchmarkSerializeXLIFF100(b *testing.B) {
	rows := makeExportRows(100)
	benchmarkSerialize(b, func() { _ = SerializeXLIFF(rows) })
}

func BenchmarkSerializeXLIFF1000(b *testing.B) {
	rows := makeExportRows(1_000)
	benchmarkSerialize(b, func() { _ = SerializeXLIFF(rows) })
}

func BenchmarkSerializeXLIFF5000(b *testing.B) {
	rows := makeExportRows(5_000)
	benchmarkSerialize(b, func() { _ = SerializeXLIFF(rows) })
}

func BenchmarkSerializeXLSX100(b *testing.B) {
	rows := makeExportRows(100)
	benchmarkSerialize(b, func() {
		_, _ = SerializeXLSX(rows)
	})
}

func BenchmarkSerializeXLSX1000(b *testing.B) {
	rows := makeExportRows(1_000)
	benchmarkSerialize(b, func() {
		_, _ = SerializeXLSX(rows)
	})
}

func BenchmarkSerializeXLSX5000(b *testing.B) {
	rows := makeExportRows(5_000)
	benchmarkSerialize(b, func() {
		_, _ = SerializeXLSX(rows)
	})
}

func BenchmarkSerializeFormatCSV1000(b *testing.B) {
	rows := benchmarkExportRows()
	benchmarkSerialize(b, func() {
		_, _ = Serialize(FormatCSV, rows)
	})
}

func BenchmarkSerializeFormatTMX1000(b *testing.B) {
	rows := benchmarkExportRows()
	benchmarkSerialize(b, func() {
		_, _ = Serialize(FormatTMX, rows)
	})
}

func BenchmarkSerializeFormatXLIFF1000(b *testing.B) {
	rows := benchmarkExportRows()
	benchmarkSerialize(b, func() {
		_, _ = Serialize(FormatXLIFF, rows)
	})
}

func BenchmarkSerializeFormatXLSX1000(b *testing.B) {
	rows := benchmarkExportRows()
	benchmarkSerialize(b, func() {
		_, _ = Serialize(FormatXLSX, rows)
	})
}

func benchmarkSerialize(b *testing.B, fn func()) {
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		fn()
	}
}
