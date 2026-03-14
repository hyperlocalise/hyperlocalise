package httpx

import "net/http"

func NewMux() *http.ServeMux {
	return http.NewServeMux()
}
