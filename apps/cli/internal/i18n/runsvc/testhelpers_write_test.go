package runsvc

import "sync"

// serialWriteFile wraps a writeFile fake so tests can record writes in plain maps and slices.
// The executor writes finished targets concurrently; the real writer is safe for that, most
// fakes are not.
func serialWriteFile(fn func(path string, content []byte) error) func(path string, content []byte) error {
	var mu sync.Mutex
	return func(path string, content []byte) error {
		mu.Lock()
		defer mu.Unlock()
		return fn(path, content)
	}
}
