package model

// Storage defines the structure of a storage.
type Storage struct {
	ID       int    `json:"id"`
	FileName string `json:"fileName"`
}

// StorageListResponse defines the structure of a response
// when getting a list of storages.
type StorageListResponse struct {
	Data       []*StorageGetResponse `json:"data"`
	Pagination *Pagination           `json:"pagination"`
}

// StorageGetResponse defines the structure of a response
// when retrieving a storage.
type StorageGetResponse struct {
	Data *Storage `json:"data"`
}
