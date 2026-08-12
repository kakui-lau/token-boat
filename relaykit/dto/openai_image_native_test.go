package dto

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/tidwall/gjson"
)

func TestImageRequestPreservesNativeInputAndBuildsSafeEstimate(t *testing.T) {
	raw := []byte(`{
		"model":"openai/gpt-image-2",
		"input":{"messages":[{"role":"user","content":[{"text":"一条鱼"}]}]},
		"parameters":{"size":"1328*1328","watermark":false}
	}`)
	var request ImageRequest
	require.NoError(t, request.UnmarshalJSON(raw))

	meta := request.GetTokenCountMeta()
	assert.Equal(t, "一条鱼", meta.CombineText)
	assert.Equal(t, MaxEstimatedImageOutputTokensPerImage, meta.MaxTokens)

	encoded, err := request.MarshalJSON()
	require.NoError(t, err)
	assert.Equal(t, "一条鱼", gjson.GetBytes(encoded, "input.messages.0.content.0.text").String())
	assert.Equal(t, "1328*1328", gjson.GetBytes(encoded, "parameters.size").String())
}
