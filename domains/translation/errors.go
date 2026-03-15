package translation

import "errors"

var (
	ErrNotFound           = errors.New("translation job not found")
	ErrConflict           = errors.New("translation job conflict")
	ErrInvalidArgument    = errors.New("invalid translation job request")
	ErrSegmentNotRunnable = errors.New("translation segment not runnable")
)
