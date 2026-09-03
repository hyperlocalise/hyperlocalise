package experiment

import (
	"context"
	"sync"
)

type MemoryStore struct {
	mu             sync.Mutex
	keys           map[string]string
	flags          []FlagRecord
	rows           []EvalRow
	organizationID string
}

func NewMemoryStore(organizationID string) *MemoryStore {
	return &MemoryStore{
		keys:           map[string]string{},
		organizationID: organizationID,
	}
}

func (s *MemoryStore) AddKey(plainKey string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.keys[HashClientKey(plainKey)] = s.organizationID
}

func (s *MemoryStore) SetFlags(flags []FlagRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.flags = flags
}

func (s *MemoryStore) SetRows(rows []EvalRow) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.rows = rows
}

func (s *MemoryStore) LookupOrganizationID(_ context.Context, keyHash string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	organizationID, ok := s.keys[keyHash]
	if !ok {
		return "", errUnauthorized
	}
	return organizationID, nil
}

func (s *MemoryStore) LoadFlag(_ context.Context, _, key string) (*FlagRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, flag := range s.flags {
		if flag.Key == key {
			copy := flag
			return &copy, nil
		}
	}
	return nil, nil
}

func (s *MemoryStore) LoadFlags(_ context.Context, _ string) ([]FlagRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]FlagRecord, len(s.flags))
	copy(out, s.flags)
	return out, nil
}

func (s *MemoryStore) LoadEvalRows(_ context.Context, _ string, flagIDs []string) ([]EvalRow, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	wanted := make(map[string]struct{}, len(flagIDs))
	for _, id := range flagIDs {
		wanted[id] = struct{}{}
	}
	var out []EvalRow
	for _, row := range s.rows {
		if _, ok := wanted[row.FlagID]; ok {
			out = append(out, row)
		}
	}
	return out, nil
}

func (s *MemoryStore) TouchClientKey(context.Context, string) {}
