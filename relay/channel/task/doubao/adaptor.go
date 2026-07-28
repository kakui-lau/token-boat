package doubao

import (
	"bytes"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"

	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"

	"github.com/gin-gonic/gin"
	"github.com/pkg/errors"
	"github.com/samber/lo"
)

// ============================
// Request / Response structures
// ============================

type ContentItem struct {
	Type     string    `json:"type,omitempty"`
	Text     string    `json:"text,omitempty"`
	ImageURL *MediaURL `json:"image_url,omitempty"`
	VideoURL *MediaURL `json:"video_url,omitempty"`
	AudioURL *MediaURL `json:"audio_url,omitempty"`
	Role     string    `json:"role,omitempty"`
}

type MediaURL struct {
	URL string `json:"url,omitempty"`
}

type requestPayload struct {
	Model                 string         `json:"model"`
	Content               []ContentItem  `json:"content,omitempty"`
	CallbackURL           string         `json:"callback_url,omitempty"`
	ReturnLastFrame       *dto.BoolValue `json:"return_last_frame,omitempty"`
	ServiceTier           string         `json:"service_tier,omitempty"`
	ExecutionExpiresAfter *dto.IntValue  `json:"execution_expires_after,omitempty"`
	GenerateAudio         *dto.BoolValue `json:"generate_audio,omitempty"`
	Draft                 *dto.BoolValue `json:"draft,omitempty"`
	Tools                 []struct {
		Type string `json:"type,omitempty"`
	} `json:"tools,omitempty"`
	SafetyIdentifier string         `json:"safety_identifier,omitempty"`
	Priority         *dto.IntValue  `json:"priority,omitempty"`
	Resolution       string         `json:"resolution,omitempty"`
	Ratio            string         `json:"ratio,omitempty"`
	Duration         *dto.IntValue  `json:"duration,omitempty"`
	Frames           *dto.IntValue  `json:"frames,omitempty"`
	Seed             *dto.IntValue  `json:"seed,omitempty"`
	CameraFixed      *dto.BoolValue `json:"camera_fixed,omitempty"`
	Watermark        *dto.BoolValue `json:"watermark,omitempty"`
}

type responsePayload struct {
	ID string `json:"id"` // task_id
}

type responseTask struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Status  string `json:"status"`
	Content struct {
		VideoURL string `json:"video_url"`
	} `json:"content"`
	Seed            int    `json:"seed"`
	Resolution      string `json:"resolution"`
	Duration        int    `json:"duration"`
	Ratio           string `json:"ratio"`
	FramesPerSecond int    `json:"framespersecond"`
	ServiceTier     string `json:"service_tier"`
	Tools           []struct {
		Type string `json:"type"`
	} `json:"tools"`
	Usage struct {
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
		ToolUsage        struct {
			WebSearch int `json:"web_search"`
		} `json:"tool_usage"`
	} `json:"usage"`
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
	CreatedAt int64 `json:"created_at"`
	UpdatedAt int64 `json:"updated_at"`
}

// ============================
// Adaptor implementation
// ============================

type TaskAdaptor struct {
	taskcommon.BaseBilling
	ChannelType int
	apiKey      string
	baseURL     string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.ChannelType = info.ChannelType
	a.baseURL = info.ChannelBaseUrl
	a.apiKey = info.ApiKey
}

// ValidateRequestAndSetAction parses body, validates fields and sets default action.
func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) (taskErr *taskdto.TaskError) {
	// Accept only POST /v1/video/generations as "generate" action.
	if taskErr := relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate); taskErr != nil {
		return taskErr
	}
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	if billing_setting.GetBillingMode(req.Model) != billing_setting.BillingModeTieredExpr {
		return nil
	}
	if !isSeedance20Model(req.Model) {
		return service.TaskErrorWrapperLocal(
			fmt.Errorf("tiered expression billing is only supported for Seedance 2.0 on DoubaoVideo"),
			"unsupported_tiered_billing",
			http.StatusBadRequest,
		)
	}

	estimatedTokens, err := estimateMaxBillingTokens(req)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	info.TaskPreConsumeTokens = estimatedTokens
	info.TaskTieredEstimateReady = true
	normalizedRequest := req
	normalizedRequest.Metadata = make(map[string]interface{}, len(req.Metadata)+2)
	for key, value := range req.Metadata {
		normalizedRequest.Metadata[key] = value
	}
	resolution := normalizedRequest.Resolution
	if metadataResolution, ok := normalizedRequest.Metadata["resolution"].(string); resolution == "" && ok {
		resolution = metadataResolution
	}
	if resolution == "" {
		resolution = "720p"
	}
	normalizedRequest.Metadata["resolution"] = strings.ToLower(strings.TrimSpace(resolution))
	duration := normalizedRequest.Duration
	if duration == 0 {
		duration, _ = strconv.Atoi(normalizedRequest.Seconds)
	}
	if duration == 0 {
		if metadataDuration, ok := normalizedRequest.Metadata["duration"].(float64); ok {
			duration = int(metadataDuration)
		}
	}
	if duration == 0 {
		duration = 15
	}
	normalizedRequest.Metadata["duration"] = duration
	normalizedRequest.Metadata["billing_has_video"] = hasVideoInMetadata(normalizedRequest.Metadata)
	if content, ok := billingContentProjection(normalizedRequest.Metadata); ok {
		// Expressions only need content kinds. Do not persist prompts or signed
		// media URLs in the task billing snapshot.
		normalizedRequest.Metadata["content"] = content
	}
	body, err := common.Marshal(normalizedRequest)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	info.BillingRequestInput = &billingexpr.RequestInput{
		Headers: info.RequestHeaders,
		Body:    body,
	}
	return nil
}

func isSeedance20Model(modelName string) bool {
	normalized := strings.ToLower(modelName)
	return strings.Contains(normalized, "seedance-2.0") ||
		strings.Contains(normalized, "seedance-2-0") ||
		strings.Contains(normalized, "seedance2")
}

func estimateMaxBillingTokens(req relaycommon.TaskSubmitReq) (int, error) {
	duration := req.Duration
	if duration == 0 {
		duration, _ = strconv.Atoi(req.Seconds)
	}
	if metadataDuration, ok := req.Metadata["duration"].(float64); duration == 0 && ok {
		duration = int(metadataDuration)
	}
	if duration == 0 {
		duration = 15
	}
	if duration < 1 || duration > 15 {
		return 0, fmt.Errorf("duration must be between 1 and 15 seconds")
	}

	resolution := req.Resolution
	if metadataResolution, ok := req.Metadata["resolution"].(string); resolution == "" && ok {
		resolution = metadataResolution
	}
	var width, height int
	switch strings.ToLower(strings.TrimSpace(resolution)) {
	case "480p":
		width, height = 854, 480
	case "", "720p":
		width, height = 1280, 720
	case "1080p":
		width, height = 1920, 1080
	case "4k":
		width, height = 3840, 2160
	default:
		return 0, fmt.Errorf("unsupported resolution %q", resolution)
	}

	billableSeconds := duration
	if hasVideoInMetadata(req.Metadata) {
		// The provider limits input video to 15 seconds. Reserve that maximum
		// because a remote URL's media duration is not known before submission.
		billableSeconds += 15
	}
	// Reserve the highest supported output frame rate. Actual usage returned by
	// the provider replaces this hold at completion.
	const conservativeFPS = 60
	return int(math.Ceil(float64(billableSeconds*width*height*conservativeFPS) / 1024)), nil
}

// BuildRequestURL constructs the upstream URL.
func (a *TaskAdaptor) BuildRequestURL(_ *relaycommon.RelayInfo) (string, error) {
	return fmt.Sprintf("%s/api/v3/contents/generations/tasks", a.baseURL), nil
}

// BuildRequestHeader sets required headers.
func (a *TaskAdaptor) BuildRequestHeader(_ *gin.Context, req *http.Request, _ *relaycommon.RelayInfo) error {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	return nil
}

// EstimateBilling 根据请求 metadata 中的输出分辨率与是否包含视频输入，返回相对基准价的计费 OtherRatio。
func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	hasVideo := hasVideoInMetadata(req.Metadata)
	resolution, _ := req.Metadata["resolution"].(string)
	ratio, ok := GetVideoInputRatio(info.OriginModelName, resolution, hasVideo)
	if !ok || ratio == 1.0 {
		return nil
	}
	return map[string]float64{"video_input": ratio}
}

// hasVideoInMetadata 直接检查 metadata 的 content 数组是否包含 video_url 条目，
// 避免构建完整的上游 requestPayload。
func hasVideoInMetadata(metadata map[string]interface{}) bool {
	if metadata == nil {
		return false
	}
	contentRaw, ok := metadata["content"]
	if !ok {
		return false
	}
	contentData, err := common.Marshal(contentRaw)
	if err != nil {
		return false
	}
	var contentSlice []map[string]interface{}
	if err := common.Unmarshal(contentData, &contentSlice); err != nil {
		return false
	}
	for _, item := range contentSlice {
		if item["type"] == "video_url" {
			return true
		}
		if _, has := item["video_url"]; has {
			return true
		}
	}
	return false
}

func billingContentProjection(metadata map[string]interface{}) ([]map[string]interface{}, bool) {
	if metadata == nil {
		return nil, false
	}
	contentRaw, ok := metadata["content"]
	if !ok {
		return nil, false
	}
	contentData, err := common.Marshal(contentRaw)
	if err != nil {
		return nil, false
	}
	var content []map[string]interface{}
	if err := common.Unmarshal(contentData, &content); err != nil {
		return nil, false
	}
	projected := make([]map[string]interface{}, 0, len(content))
	for _, item := range content {
		entry := make(map[string]interface{}, 2)
		if itemType, ok := item["type"].(string); ok && itemType != "" {
			entry["type"] = itemType
		}
		if _, hasVideoURL := item["video_url"]; hasVideoURL {
			entry["video_url"] = true
		}
		projected = append(projected, entry)
	}
	return projected, true
}

// BuildRequestBody converts request into Doubao specific format.
func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil, err
	}

	body, err := a.convertToRequestPayload(&req)
	if err != nil {
		return nil, errors.Wrap(err, "convert request payload failed")
	}
	if info.IsModelMapped {
		body.Model = info.UpstreamModelName
	} else {
		info.UpstreamModelName = body.Model
	}
	data, err := common.Marshal(body)
	if err != nil {
		return nil, err
	}
	logger.LogDebug(
		c,
		"DoubaoVideo upstream request: channel_id=%d channel_name=%q url=%q origin_model=%q upstream_model=%q body=%s",
		info.ChannelId,
		common.GetContextKeyString(c, constant.ContextKeyChannelName),
		relaycommon.SanitizeURLForLog(fmt.Sprintf("%s/api/v3/contents/generations/tasks", a.baseURL)),
		info.OriginModelName,
		info.UpstreamModelName,
		data,
	)
	return bytes.NewReader(data), nil
}

// DoRequest delegates to common helper.
func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, requestBody)
}

// DoResponse handles upstream response, returns taskID etc.
func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (taskID string, taskData []byte, taskErr *taskdto.TaskError) {
	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		taskErr = service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
		return
	}
	_ = resp.Body.Close()

	// Parse Doubao response
	var dResp responsePayload
	if err := common.Unmarshal(responseBody, &dResp); err != nil {
		taskErr = service.TaskErrorWrapper(errors.Wrapf(err, "body: %s", responseBody), "unmarshal_response_body_failed", http.StatusInternalServerError)
		return
	}

	if dResp.ID == "" {
		taskErr = service.TaskErrorWrapper(fmt.Errorf("task_id is empty"), "invalid_response", http.StatusInternalServerError)
		return
	}

	ov := dto.NewOpenAIVideo()
	ov.ID = info.PublicTaskID
	ov.TaskID = info.PublicTaskID
	ov.CreatedAt = time.Now().Unix()
	ov.Model = info.OriginModelName

	c.JSON(http.StatusOK, ov)
	return dResp.ID, responseBody, nil
}

// FetchTask fetch task status
func (a *TaskAdaptor) FetchTask(baseUrl, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok {
		return nil, fmt.Errorf("invalid task_id")
	}

	uri := fmt.Sprintf("%s/api/v3/contents/generations/tasks/%s", baseUrl, taskID)

	req, err := http.NewRequest(http.MethodGet, uri, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+key)

	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client failed: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) GetModelList() []string {
	return ModelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return ChannelName
}

func (a *TaskAdaptor) convertToRequestPayload(req *relaycommon.TaskSubmitReq) (*requestPayload, error) {
	r := requestPayload{
		Model:   req.Model,
		Content: []ContentItem{},
	}

	// Add images if present
	if req.HasImage() {
		for _, imgURL := range req.Images {
			r.Content = append(r.Content, ContentItem{
				Type: "image_url",
				ImageURL: &MediaURL{
					URL: imgURL,
				},
			})
		}
	}

	metadata := req.Metadata
	if err := taskcommon.UnmarshalMetadata(metadata, &r); err != nil {
		return nil, errors.Wrap(err, "unmarshal metadata failed")
	}
	if req.Resolution != "" {
		r.Resolution = strings.ToLower(strings.TrimSpace(req.Resolution))
	}
	if req.AspectRatio != "" {
		r.Ratio = req.AspectRatio
	}

	if req.Duration > 0 {
		r.Duration = lo.ToPtr(dto.IntValue(req.Duration))
	} else if sec, _ := strconv.Atoi(req.Seconds); sec > 0 {
		r.Duration = lo.ToPtr(dto.IntValue(sec))
	}

	r.Content = lo.Reject(r.Content, func(c ContentItem, _ int) bool { return c.Type == "text" })
	r.Content = append(r.Content, ContentItem{
		Type: "text",
		Text: req.Prompt,
	})

	return &r, nil
}

func (a *TaskAdaptor) ParseTaskResult(respBody []byte) (*relaycommon.TaskInfo, error) {
	resTask := responseTask{}
	if err := common.Unmarshal(respBody, &resTask); err != nil {
		return nil, errors.Wrap(err, "unmarshal task result failed")
	}

	taskResult := relaycommon.TaskInfo{
		Code: 0,
	}

	// Map Doubao status to internal status
	switch resTask.Status {
	case "pending", "queued":
		taskResult.Status = model.TaskStatusQueued
		taskResult.Progress = "10%"
	case "processing", "running":
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = "50%"
	case "succeeded":
		taskResult.Status = model.TaskStatusSuccess
		taskResult.Progress = "100%"
		taskResult.Url = resTask.Content.VideoURL
		// 解析 usage 信息用于按倍率计费
		taskResult.CompletionTokens = resTask.Usage.CompletionTokens
		taskResult.TotalTokens = resTask.Usage.TotalTokens
	case "failed":
		taskResult.Status = model.TaskStatusFailure
		taskResult.Progress = "100%"
		taskResult.Reason = resTask.Error.Message
	default:
		// Unknown status, treat as processing
		taskResult.Status = model.TaskStatusInProgress
		taskResult.Progress = "30%"
	}

	return &taskResult, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(originTask *model.Task) ([]byte, error) {
	var dResp responseTask
	if err := common.Unmarshal(originTask.Data, &dResp); err != nil {
		return nil, errors.Wrap(err, "unmarshal doubao task data failed")
	}

	openAIVideo := dto.NewOpenAIVideo()
	openAIVideo.ID = originTask.TaskID
	openAIVideo.TaskID = originTask.TaskID
	openAIVideo.Status = originTask.Status.ToVideoStatus()
	openAIVideo.SetProgressStr(originTask.Progress)
	openAIVideo.SetMetadata("url", dResp.Content.VideoURL)
	openAIVideo.CreatedAt = originTask.CreatedAt
	openAIVideo.CompletedAt = originTask.UpdatedAt
	openAIVideo.Model = originTask.Properties.OriginModelName

	if dResp.Status == "failed" {
		openAIVideo.Error = &dto.OpenAIVideoError{
			Message: dResp.Error.Message,
			Code:    dResp.Error.Code,
		}
	}

	return common.Marshal(openAIVideo)
}
