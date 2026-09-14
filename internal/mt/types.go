package mt

// Request is a batch machine-translation request using BCP 47 locales.
type Request struct {
	SourceLocale string
	TargetLocale string
	Sources      []string
}

// Response contains translations in the same order as Request.Sources.
type Response struct {
	Translations []string
	// RequestCount is the number of provider HTTP requests issued while
	// serving this Translate call. Zero means the engine did not report
	// usage; callers treat an attempted Translate as one request.
	RequestCount int
}
