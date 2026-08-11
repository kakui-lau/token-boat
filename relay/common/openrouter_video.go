package common

import (
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/gin-gonic/gin"
)

const openRouterVideoRequestContextKey = "openrouter_video_request"

var openRouterVideoSizePattern = regexp.MustCompile(`^[1-9][0-9]*x[1-9][0-9]*$`)

func IsOpenRouterVideoRequest(c *gin.Context) bool {
	return c != nil && c.Request != nil && c.Request.Method == http.MethodPost && c.Request.URL.Path == "/v1/videos"
}

func GetOpenRouterVideoRequest(c *gin.Context) (dto.OpenRouterVideoGenerationRequest, bool) {
	value, exists := c.Get(openRouterVideoRequestContextKey)
	if !exists {
		return dto.OpenRouterVideoGenerationRequest{}, false
	}
	request, ok := value.(dto.OpenRouterVideoGenerationRequest)
	return request, ok
}

func validateOpenRouterVideoRequest(request dto.OpenRouterVideoGenerationRequest) *dto.TaskError {
	if strings.TrimSpace(request.Model) == "" {
		return createTaskError(fmt.Errorf("model is required"), "missing_model", http.StatusBadRequest, true)
	}
	if request.Duration != nil && (*request.Duration < 1 || *request.Duration > MaxTaskDurationSeconds) {
		return createTaskError(fmt.Errorf("duration must be between 1 and %d", MaxTaskDurationSeconds), "invalid_duration", http.StatusBadRequest, true)
	}
	if request.Size != nil && strings.TrimSpace(*request.Size) != "" && (request.Resolution != nil || request.AspectRatio != nil) {
		return createTaskError(fmt.Errorf("size cannot be combined with resolution or aspect_ratio"), "conflicting_video_dimensions", http.StatusBadRequest, true)
	}
	if request.Size != nil && !openRouterVideoSizePattern.MatchString(*request.Size) {
		return createTaskError(fmt.Errorf("size must use WIDTHxHEIGHT format"), "invalid_size", http.StatusBadRequest, true)
	}
	if request.Resolution != nil {
		switch *request.Resolution {
		case "480p", "720p", "768p", "1080p", "1K", "2K", "4K":
		default:
			return createTaskError(fmt.Errorf("resolution is invalid"), "invalid_resolution", http.StatusBadRequest, true)
		}
	}
	if request.AspectRatio != nil {
		switch *request.AspectRatio {
		case "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21":
		default:
			return createTaskError(fmt.Errorf("aspect_ratio is invalid"), "invalid_aspect_ratio", http.StatusBadRequest, true)
		}
	}

	seenFrames := make(map[string]bool, len(request.FrameImages))
	for index, frame := range request.FrameImages {
		if frame.Type != "image_url" || strings.TrimSpace(frame.ImageURL.URL) == "" {
			return createTaskError(fmt.Errorf("frame_images[%d] must contain a non-empty image_url", index), "invalid_frame_image", http.StatusBadRequest, true)
		}
		if frame.FrameType != "first_frame" && frame.FrameType != "last_frame" {
			return createTaskError(fmt.Errorf("frame_images[%d].frame_type must be first_frame or last_frame", index), "invalid_frame_type", http.StatusBadRequest, true)
		}
		if seenFrames[frame.FrameType] {
			return createTaskError(fmt.Errorf("frame_images contains duplicate %s", frame.FrameType), "duplicate_frame_type", http.StatusBadRequest, true)
		}
		seenFrames[frame.FrameType] = true
	}

	for index, reference := range request.InputReferences {
		var referenceURL string
		urlFieldCount := 0
		if reference.ImageURL != nil {
			urlFieldCount++
		}
		if reference.AudioURL != nil {
			urlFieldCount++
		}
		if reference.VideoURL != nil {
			urlFieldCount++
		}
		switch reference.Type {
		case "image_url":
			if reference.ImageURL != nil {
				referenceURL = reference.ImageURL.URL
			}
		case "audio_url":
			if reference.AudioURL != nil {
				referenceURL = reference.AudioURL.URL
			}
		case "video_url":
			if reference.VideoURL != nil {
				referenceURL = reference.VideoURL.URL
			}
		default:
			return createTaskError(fmt.Errorf("input_references[%d].type is invalid", index), "invalid_input_reference", http.StatusBadRequest, true)
		}
		if urlFieldCount != 1 || strings.TrimSpace(referenceURL) == "" {
			return createTaskError(fmt.Errorf("input_references[%d] must contain a non-empty URL matching its type", index), "invalid_input_reference", http.StatusBadRequest, true)
		}
	}

	if request.CallbackURL != nil {
		callbackURL, err := url.ParseRequestURI(*request.CallbackURL)
		if err != nil || !strings.EqualFold(callbackURL.Scheme, "https") || callbackURL.Host == "" {
			return createTaskError(fmt.Errorf("callback_url must be a valid HTTPS URL"), "invalid_callback_url", http.StatusBadRequest, true)
		}
	}
	return nil
}

func parseOpenRouterVideoRequest(c *gin.Context, info *RelayInfo) *dto.TaskError {
	var request dto.OpenRouterVideoGenerationRequest
	if err := common.UnmarshalBodyReusable(c, &request); err != nil {
		return createTaskError(err, "invalid_request", http.StatusBadRequest, true)
	}
	if taskErr := validateOpenRouterVideoRequest(request); taskErr != nil {
		return taskErr
	}

	legacy := TaskSubmitReq{
		Model:       request.Model,
		FrameImages: request.FrameImages,
		Provider:    request.Provider,
		CallbackURL: request.CallbackURL,
	}
	if request.Prompt != nil {
		legacy.Prompt = *request.Prompt
	}
	if request.Duration != nil {
		legacy.Duration = *request.Duration
	}
	if request.Resolution != nil {
		legacy.Resolution = *request.Resolution
	}
	if request.AspectRatio != nil {
		legacy.AspectRatio = *request.AspectRatio
	}
	if request.Size != nil {
		legacy.Size = *request.Size
	}
	legacy.GenerateAudio = request.GenerateAudio
	legacy.Seed = request.Seed

	action := constant.TaskActionTextGenerate
	for _, frame := range request.FrameImages {
		if frame.FrameType == "first_frame" {
			legacy.Images = append([]string{frame.ImageURL.URL}, legacy.Images...)
		} else {
			legacy.Images = append(legacy.Images, frame.ImageURL.URL)
		}
	}
	if len(request.FrameImages) == 1 {
		action = constant.TaskActionGenerate
	} else if len(request.FrameImages) == 2 {
		action = constant.TaskActionFirstTailGenerate
	}
	// OpenRouter gives frame_images precedence when both input modes are sent.
	if len(request.FrameImages) == 0 && len(request.InputReferences) > 0 {
		action = constant.TaskActionReferenceGenerate
		legacy.InputReferences = request.InputReferences
		for _, reference := range request.InputReferences {
			if reference.Type == "image_url" && reference.ImageURL != nil {
				legacy.Images = append(legacy.Images, reference.ImageURL.URL)
			}
		}
	}

	c.Set(openRouterVideoRequestContextKey, request)
	if request.CallbackURL != nil {
		info.CallbackURL = *request.CallbackURL
	}
	storeTaskRequest(c, info, action, legacy)
	return nil
}

// ValidateOpenRouterVideoChannelSupport prevents a selected legacy adaptor
// from silently dropping or reinterpreting OpenRouter video parameters.
func ValidateOpenRouterVideoChannelSupport(c *gin.Context, info *RelayInfo) *dto.TaskError {
	request, ok := GetOpenRouterVideoRequest(c)
	if !ok {
		return nil
	}
	modelName := strings.ToLower(info.UpstreamModelName)
	isSeedance20 := strings.Contains(modelName, "seedance-2.0") || strings.Contains(modelName, "seedance-2-0") || strings.Contains(modelName, "seedance2")
	isSeedance25 := strings.Contains(modelName, "seedance-2.5") || strings.Contains(modelName, "seedance-2-5")
	isSeedance2 := isSeedance20 || isSeedance25
	supportsReferences := info.ChannelType == constant.ChannelTypeOpenRouter ||
		info.ChannelType == constant.ChannelTypeAnitix ||
		((info.ChannelType == constant.ChannelTypeDoubaoVideo || info.ChannelType == constant.ChannelTypeVolcEngine) && isSeedance2) ||
		info.ChannelType == constant.ChannelTypeVidu
	supportsRichReferences := info.ChannelType == constant.ChannelTypeOpenRouter ||
		((info.ChannelType == constant.ChannelTypeDoubaoVideo || info.ChannelType == constant.ChannelTypeVolcEngine) && isSeedance2)
	supportsLastFrame := supportsRichReferences || info.ChannelType == constant.ChannelTypeVidu ||
		info.ChannelType == constant.ChannelTypeAnitix ||
		info.ChannelType == constant.ChannelTypeAli || info.ChannelType == constant.ChannelTypeJimeng ||
		info.ChannelType == constant.ChannelTypeKling
	supportsGenerateAudio := supportsRichReferences || info.ChannelType == constant.ChannelTypeAli ||
		info.ChannelType == constant.ChannelTypeAnitix ||
		info.ChannelType == constant.ChannelTypeGemini || info.ChannelType == constant.ChannelTypeVertexAi
	if isSeedance25 && (info.ChannelType == constant.ChannelTypeDoubaoVideo || info.ChannelType == constant.ChannelTypeVolcEngine) {
		supportsGenerateAudio = false
		if request.GenerateAudio != nil && *request.GenerateAudio {
			request.GenerateAudio = nil
			c.Set(openRouterVideoRequestContextKey, request)
			legacyRequest, err := GetTaskRequest(c)
			if err == nil {
				legacyRequest.GenerateAudio = nil
				c.Set("task_request", legacyRequest)
			}
		}
	}
	supportsSeed := supportsRichReferences || info.ChannelType == constant.ChannelTypeVidu ||
		info.ChannelType == constant.ChannelTypeAnitix ||
		info.ChannelType == constant.ChannelTypeAli || info.ChannelType == constant.ChannelTypeJimeng ||
		info.ChannelType == constant.ChannelTypeGemini || info.ChannelType == constant.ChannelTypeVertexAi
	if request.Provider != nil && len(request.Provider.Options) > 0 && info.ChannelType != constant.ChannelTypeOpenRouter {
		return createTaskError(fmt.Errorf("provider.options requires an OpenRouter upstream channel"), "unsupported_parameter", http.StatusBadRequest, true)
	}

	for _, frame := range request.FrameImages {
		if frame.FrameType == "last_frame" && !supportsLastFrame {
			return createTaskError(fmt.Errorf("selected provider does not support last_frame"), "unsupported_parameter", http.StatusBadRequest, true)
		}
	}
	inputReferences := request.InputReferences
	if len(request.FrameImages) > 0 {
		inputReferences = nil
	}
	if len(inputReferences) > 0 && !supportsReferences {
		return createTaskError(fmt.Errorf("selected provider does not support input_references"), "unsupported_parameter", http.StatusBadRequest, true)
	}
	for _, reference := range inputReferences {
		if reference.Type != "image_url" && !supportsRichReferences {
			return createTaskError(fmt.Errorf("selected provider does not support %s references", strings.TrimSuffix(reference.Type, "_url")), "unsupported_parameter", http.StatusBadRequest, true)
		}
	}
	if request.GenerateAudio != nil && *request.GenerateAudio && !supportsGenerateAudio {
		return createTaskError(fmt.Errorf("selected provider does not support generate_audio"), "unsupported_parameter", http.StatusBadRequest, true)
	}
	if request.Seed != nil && !supportsSeed {
		return createTaskError(fmt.Errorf("selected provider does not support seed"), "unsupported_parameter", http.StatusBadRequest, true)
	}
	return nil
}
