package service

import (
	"github.com/quiet-circles/hyperlocalise/domains/glossary"
	"github.com/quiet-circles/hyperlocalise/domains/tm"
)

type Service struct {
	Entries []tm.Entry
	Terms   []glossary.Term
}
