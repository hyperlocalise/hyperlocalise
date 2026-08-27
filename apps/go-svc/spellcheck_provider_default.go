//go:build !cgo_hunspell

package main

func newSpellChecker(_ string) (SpellChecker, func() error, error) {
	return NoopSpellChecker{}, func() error { return nil }, nil
}
