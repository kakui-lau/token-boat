package dto

// OpenRouterVideoStatus is the public status vocabulary used by the
// OpenRouter-compatible video generation API.
type OpenRouterVideoStatus string

const (
	OpenRouterVideoStatusPending    OpenRouterVideoStatus = "pending"
	OpenRouterVideoStatusInProgress OpenRouterVideoStatus = "in_progress"
	OpenRouterVideoStatusCompleted  OpenRouterVideoStatus = "completed"
	OpenRouterVideoStatusFailed     OpenRouterVideoStatus = "failed"
	OpenRouterVideoStatusCancelled  OpenRouterVideoStatus = "cancelled"
	OpenRouterVideoStatusExpired    OpenRouterVideoStatus = "expired"
)

type OpenRouterVideoURL struct {
	URL string `json:"url"`
}

type OpenRouterVideoFrameImage struct {
	Type      string             `json:"type"`
	ImageURL  OpenRouterVideoURL `json:"image_url"`
	FrameType string             `json:"frame_type"`
}

// OpenRouterVideoInputReference represents OpenRouter's discriminated union
// of image_url, audio_url, and video_url reference assets. Validation enforces
// that exactly one URL field matches Type before the request is relayed.
type OpenRouterVideoInputReference struct {
	Type     string              `json:"type"`
	ImageURL *OpenRouterVideoURL `json:"image_url,omitempty"`
	AudioURL *OpenRouterVideoURL `json:"audio_url,omitempty"`
	VideoURL *OpenRouterVideoURL `json:"video_url,omitempty"`
}

type OpenRouterVideoProvider struct {
	Options map[string]map[string]any `json:"options,omitempty"`
}

// OpenRouterVideoGenerationRequest mirrors OpenRouter's public
// VideoGenerationRequest schema. Pointer scalars preserve explicit zero and
// false values while keeping absent parameters distinguishable from defaults.
type OpenRouterVideoGenerationRequest struct {
	Model           string                          `json:"model"`
	Prompt          *string                         `json:"prompt,omitempty"`
	Duration        *int                            `json:"duration,omitempty"`
	Resolution      *string                         `json:"resolution,omitempty"`
	AspectRatio     *string                         `json:"aspect_ratio,omitempty"`
	Size            *string                         `json:"size,omitempty"`
	GenerateAudio   *bool                           `json:"generate_audio,omitempty"`
	Seed            *int                            `json:"seed,omitempty"`
	FrameImages     []OpenRouterVideoFrameImage     `json:"frame_images,omitempty"`
	InputReferences []OpenRouterVideoInputReference `json:"input_references,omitempty"`
	Provider        *OpenRouterVideoProvider        `json:"provider,omitempty"`
	CallbackURL     *string                         `json:"callback_url,omitempty"`
}

type OpenRouterVideoGenerationUsage struct {
	Cost   *float64 `json:"cost,omitempty"`
	IsBYOK bool     `json:"is_byok"`
}

type OpenRouterVideoGenerationResponse struct {
	ID           string                          `json:"id"`
	PollingURL   string                          `json:"polling_url"`
	Status       OpenRouterVideoStatus           `json:"status"`
	Error        *string                         `json:"error,omitempty"`
	GenerationID *string                         `json:"generation_id,omitempty"`
	UnsignedURLs []string                        `json:"unsigned_urls,omitempty"`
	Usage        *OpenRouterVideoGenerationUsage `json:"usage,omitempty"`
}

type OpenRouterVideoErrorData struct {
	Code     int            `json:"code"`
	Message  string         `json:"message"`
	Metadata map[string]any `json:"metadata,omitempty"`
}

type OpenRouterVideoErrorResponse struct {
	Error OpenRouterVideoErrorData `json:"error"`
}

type OpenRouterVideoModel struct {
	ID                           string             `json:"id"`
	CanonicalSlug                string             `json:"canonical_slug"`
	Name                         string             `json:"name"`
	Created                      int64              `json:"created"`
	Description                  string             `json:"description,omitempty"`
	HuggingFaceID                *string            `json:"hugging_face_id,omitempty"`
	SupportedResolutions         []string           `json:"supported_resolutions"`
	SupportedAspectRatios        []string           `json:"supported_aspect_ratios"`
	SupportedSizes               []string           `json:"supported_sizes"`
	SupportedDurations           []int              `json:"supported_durations"`
	SupportedFrameImages         []string           `json:"supported_frame_images"`
	GenerateAudio                *bool              `json:"generate_audio"`
	Seed                         *bool              `json:"seed"`
	AllowedPassthroughParameters []string           `json:"allowed_passthrough_parameters"`
	PricingSKUs                  *map[string]string `json:"pricing_skus,omitempty"`
}

type OpenRouterVideoModelsResponse struct {
	Data []OpenRouterVideoModel `json:"data"`
}
