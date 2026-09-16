package editor_export

import "fmt"

// Result is a serialized filtered CAT export payload.
type Result struct {
	Body        []byte
	ContentType string
	Extension   string
}

// Serialize encodes rows in the requested format.
func Serialize(format Format, rows []Row) (Result, error) {
	if len(rows) > MaxRows {
		return Result{}, fmt.Errorf("too many rows")
	}
	switch format {
	case FormatCSV:
		return Result{
			Body:        SerializeCSV(rows),
			ContentType: "text/csv; charset=utf-8",
			Extension:   "csv",
		}, nil
	case FormatTMX:
		return Result{
			Body:        SerializeTMX(rows),
			ContentType: "application/x-tmx+xml; charset=utf-8",
			Extension:   "tmx",
		}, nil
	case FormatXLF:
		return Result{
			Body:        SerializeXLIFF(rows),
			ContentType: "application/x-xliff+xml; charset=utf-8",
			Extension:   "xlf",
		}, nil
	case FormatXLIFF:
		return Result{
			Body:        SerializeXLIFF(rows),
			ContentType: "application/xliff+xml; charset=utf-8",
			Extension:   "xliff",
		}, nil
	case FormatXLSX:
		body, err := SerializeXLSX(rows)
		if err != nil {
			return Result{}, err
		}
		return Result{
			Body:        body,
			ContentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			Extension:   "xlsx",
		}, nil
	default:
		return Result{}, fmt.Errorf("unsupported export format")
	}
}
