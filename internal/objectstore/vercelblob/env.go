package vercelblob

import (
	"os"
	"strings"
)

// FromEnv builds the store the web app writes stored files to, from the same variables:
// BLOB_READ_WRITE_TOKEN, FILE_STORAGE_ACCESS (private by default) and, optionally,
// VERCEL_BLOB_API_URL. It returns nil when no token is set.
func FromEnv() (*Store, error) {
	token := strings.TrimSpace(os.Getenv("BLOB_READ_WRITE_TOKEN"))
	if token == "" {
		return nil, nil
	}
	return New(Config{
		Token:  token,
		Access: strings.TrimSpace(os.Getenv("FILE_STORAGE_ACCESS")),
		APIURL: os.Getenv("VERCEL_BLOB_API_URL"),
	})
}
