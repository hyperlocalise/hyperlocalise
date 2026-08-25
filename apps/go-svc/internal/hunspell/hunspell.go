//go:build cgo_hunspell

// Package hunspell provides a CGO wrapper around the Hunspell C API.
package hunspell

/*
#cgo pkg-config: hunspell
#include <hunspell.h>
#include <stdlib.h>
*/
import "C"

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"strings"
	"unsafe"
)

// ErrClosed is returned by Dictionary methods once Close has been called.
var ErrClosed = errors.New("hunspell: dictionary is closed")

var (
	errAffixEncodingUndeclared = errors.New("hunspell: affix file has no SET declaration")
	errAffixEncodingNotUTF8    = errors.New("hunspell: affix file declares a non-UTF-8 encoding")
)

const maxSuggestions = 5

// Dictionary wraps a loaded Hunspell dictionary, it's not safe for concurrent use.
type Dictionary struct {
	handle *C.Hunhandle
	closed bool
}

// New loads a UTF-8 Hunspell affix and dictionary pair.
// Affix files without SET default to ISO8859-1 and are rejected.
func New(affPath, dicPath string) (*Dictionary, error) {
	if _, err := os.Stat(affPath); err != nil {
		return nil, fmt.Errorf("hunspell: affix file: %w", err)
	}
	if _, err := os.Stat(dicPath); err != nil {
		return nil, fmt.Errorf("hunspell: dictionary file: %w", err)
	}

	encoding, declared, err := affEncoding(affPath)
	if err != nil {
		return nil, fmt.Errorf("hunspell: reading affix file encoding: %w", err)
	}
	if !declared {
		return nil, fmt.Errorf("%w: %q (Hunspell defaults undeclared dictionaries to ISO8859-1, not UTF-8)", errAffixEncodingUndeclared, affPath)
	}
	if encoding != "UTF-8" {
		return nil, fmt.Errorf("%w: %q declares %q, only UTF-8 dictionaries are supported", errAffixEncodingNotUTF8, affPath, encoding)
	}

	cAffPath := C.CString(affPath)
	defer C.free(unsafe.Pointer(cAffPath))
	cDicPath := C.CString(dicPath)
	defer C.free(unsafe.Pointer(cDicPath))

	handle := C.Hunspell_create(cAffPath, cDicPath)
	if handle == nil {
		return nil, fmt.Errorf("hunspell: failed to create dictionary from affix file %q and dictionary file %q", affPath, dicPath)
	}

	return &Dictionary{handle: handle}, nil
}

func affEncoding(affPath string) (encoding string, declared bool, err error) {
	f, err := os.Open(affPath)
	if err != nil {
		return "", false, err
	}
	defer func() { _ = f.Close() }()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) > 0 && fields[0] == "SET" {
			if len(fields) > 1 {
				return fields[1], true, nil
			}
			return "", true, nil
		}
	}
	return "", false, scanner.Err()
}

// Spell reports whether word is recognized by the loaded dictionary.
func (d *Dictionary) Spell(word string) (bool, error) {
	if d.closed {
		return false, ErrClosed
	}

	cWord := C.CString(word)
	defer C.free(unsafe.Pointer(cWord))

	return C.Hunspell_spell(d.handle, cWord) != 0, nil
}

// Suggest returns up to maxSuggestions spelling suggestions for word.
func (d *Dictionary) Suggest(word string) ([]string, error) {
	if d.closed {
		return nil, ErrClosed
	}

	cWord := C.CString(word)
	defer C.free(unsafe.Pointer(cWord))

	var cList **C.char
	n := int(C.Hunspell_suggest(d.handle, &cList, cWord))
	if n <= 0 {
		return nil, nil
	}
	defer C.Hunspell_free_list(d.handle, &cList, C.int(n))

	limit := n
	if limit > maxSuggestions {
		limit = maxSuggestions
	}

	raw := (*[1 << 28]*C.char)(unsafe.Pointer(cList))[:n:n]
	suggestions := make([]string, limit)
	for i := 0; i < limit; i++ {
		suggestions[i] = C.GoString(raw[i])
	}

	return suggestions, nil
}

// Close releases the Hunspell handle. It is idempotent.
func (d *Dictionary) Close() error {
	if d.closed {
		return nil
	}

	C.Hunspell_destroy(d.handle)
	d.handle = nil
	d.closed = true

	return nil
}
