package translator

import (
	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
)

func newOpenAIClient(opts ...option.RequestOption) openai.Client {
	return openai.NewClient(opts...)
}
