package common

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestIsImageGenerationModelRecognizesGeminiImageModels(t *testing.T) {
	tests := []struct {
		model string
		want  bool
	}{
		{model: "google/gemini-3-pro-image-preview", want: true},
		{model: "google/gemini-3.1-flash-image-preview", want: true},
		{model: "google/gemini-2.5-flash-image", want: true},
		{model: "google/gemini-3.1-pro-preview", want: false},
		{model: "google/gemini-3-flash-preview", want: false},
	}

	for _, test := range tests {
		t.Run(test.model, func(t *testing.T) {
			assert.Equal(t, test.want, IsImageGenerationModel(test.model))
		})
	}
}
