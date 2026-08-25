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

var ErrClosed = errors.New("hunspell: dictionary is closed")

// Dictionary wraps a loaded Hunspell dictionary.
// It is not safe for concurrent use.
type Dictionary struct {
	handle *C.Hunhandle
	closed bool
}

// New loads an affix and dictionary file.
func New(affPath, dicPath string) (*Dictionary, error) {
	if _, err := os.Stat(affPath); err != nil {
		return nil, fmt.Errorf("hunspell: affix file: %w", err)
	}
	if _, err := os.Stat(dicPath); err != nil {
		return nil, fmt.Errorf("hunspell: dictionary file: %w", err)
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

// Spell reports whether word is recognized by the loaded dictionary.
func (d *Dictionary) Spell(word string) (bool, error) {
	if d.closed {
		return false, ErrClosed
	}

	cWord := C.CString(word)
	defer C.free(unsafe.Pointer(cWord))

	return C.Hunspell_spell(d.handle, cWord) != 0, nil
}

// Close releases the native Hunspell handle owned by the Dictionary.
// Close is idempotent.
func (d *Dictionary) Close() error {
	if d.closed {
		return nil
	}

	C.Hunspell_destroy(d.handle)
	d.handle = nil
	d.closed = true

	return nil
}
