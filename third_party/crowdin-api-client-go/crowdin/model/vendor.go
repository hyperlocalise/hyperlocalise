package model

// Vendor represents a vendor in the system.
type Vendor struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Status      string `json:"status"`
	WebURL      string `json:"webUrl"`
}

// VendorResponse defines the structure of the response when
// getting a vendor.
type VendorResponse struct {
	Data *Vendor `json:"data"`
}

// VendorsListResponse defines the structure of the response when
// getting a list of vendors.
type VendorsListResponse struct {
	Data []*VendorResponse `json:"data"`
}
