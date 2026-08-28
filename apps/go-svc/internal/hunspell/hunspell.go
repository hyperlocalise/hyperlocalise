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
	"errors"
	"fmt"
	"os"
	"unsafe"
)

// ErrClosed is returned by Dictionary methods once Close has been called.
var ErrClosed = errors.New("hunspell: dictionary is closed")

const maxSuggestions = 5

// Dictionary wraps a loaded Hunspell dictionary, it's not safe for concurrent use.
type Dictionary struct {
	handle *C.Hunhandle
	closed bool
}

// New loads a Hunspell affix and dictionary pair for use with UTF-8 words.
// Dictionaries that already declare UTF-8 are loaded as-is. Known 8-bit
// encodings are transcoded to UTF-8 first so Go strings can be passed to
// the C API. Affix files without SET, or with an unknown SET encoding, are
// rejected because Hunspell defaults undeclared dictionaries to ISO8859-1.
func New(affPath, dicPath string) (*Dictionary, error) {
	if _, err := os.Stat(affPath); err != nil {
		return nil, fmt.Errorf("hunspell: affix file: %w", err)
	}
	if _, err := os.Stat(dicPath); err != nil {
		return nil, fmt.Errorf("hunspell: dictionary file: %w", err)
	}

	loadAff, loadDic, cleanup, err := prepareUTF8Dictionary(affPath, dicPath)
	if err != nil {
		return nil, err
	}
	defer cleanup()

	cAffPath := C.CString(loadAff)
	defer C.free(unsafe.Pointer(cAffPath))
	cDicPath := C.CString(loadDic)
	defer C.free(unsafe.Pointer(cDicPath))

	handle := C.Hunspell_create(cAffPath, cDicPath)
	if handle == nil {
		return nil, fmt.Errorf("hunspell: failed to create dictionary from affix file %q and dictionary file %q", affPath, dicPath)
	}

	return &Dictionary{handle: handle}, nil
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
