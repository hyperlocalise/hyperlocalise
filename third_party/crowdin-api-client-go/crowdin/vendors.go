package crowdin

import (
	"context"

	"github.com/crowdin/crowdin-api-client-go/crowdin/model"
)

// Vendors are the organizations that provide professional translation services.
// To assign a Vendor to a project workflow you should invite an existing Organization
// to be a Vendor for you.
//
// Use API to get the list of the Vendors you already invited to your organization.
//
// Crowdin API docs: https://developer.crowdin.com/enterprise/api/v2/#tag/Vendors
type VendorsService struct {
	client *Client
}

// List returns a list of vendors.
//
// https://developer.crowdin.com/enterprise/api/v2/#operation/api.vendors.getMany
func (s *VendorsService) List(ctx context.Context, opt *model.ListOptions) ([]*model.Vendor, *Response, error) {
	res := new(model.VendorsListResponse)
	resp, err := s.client.Get(ctx, "/api/v2/vendors", opt, res)
	if err != nil {
		return nil, resp, err
	}

	list := make([]*model.Vendor, 0, len(res.Data))
	for _, vendor := range res.Data {
		list = append(list, vendor.Data)
	}

	return list, resp, nil
}
