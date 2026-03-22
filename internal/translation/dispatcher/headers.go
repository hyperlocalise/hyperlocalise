package dispatcher

import "encoding/json"

func decodeHeaders(raw []byte) (map[string]string, error) {
	if len(raw) == 0 {
		return map[string]string{}, nil
	}

	headers := map[string]string{}
	if err := json.Unmarshal(raw, &headers); err != nil {
		return nil, err
	}
	if headers == nil {
		headers = map[string]string{}
	}
	return headers, nil
}
