package openrouter

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel"
	taskcommon "github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/gin-gonic/gin"
)

var modelList = []string{
	"bytedance/seedance-2.0",
	"bytedance/seedance-2.0-fast",
}

var seedanceBasePricePerSecond720p = map[string]float64{
	"bytedance/seedance-2.0":      0.1512,
	"bytedance/seedance-2.0-fast": 0.12096,
}

var seedanceAspectRatios = map[string]bool{
	"": true, "1:1": true, "3:4": true, "9:16": true, "4:3": true,
	"16:9": true, "21:9": true, "9:21": true,
}

var seedanceSizes = map[string]map[string]bool{
	"bytedance/seedance-2.0-fast": {
		"480x480": true, "480x640": true, "480x854": true, "640x480": true,
		"854x480": true, "1120x480": true, "720x720": true, "720x960": true,
		"720x1280": true, "720x1680": true, "960x720": true, "1280x720": true,
		"1680x720": true,
	},
	"bytedance/seedance-2.0": {
		"480x480": true, "480x640": true, "480x854": true, "640x480": true,
		"854x480": true, "1120x480": true, "720x720": true, "720x960": true,
		"720x1280": true, "720x1680": true, "960x720": true, "1280x720": true,
		"1680x720": true, "1080x1080": true, "1080x1440": true, "1080x1920": true,
		"1440x1080": true, "1920x1080": true, "2520x1080": true, "3840x2160": true,
		"2160x3840": true, "2160x2160": true, "2880x2160": true, "2160x2880": true,
		"5040x2160": true,
	},
}

type videoUsage struct {
	Cost             float64 `json:"cost"`
	Byok             bool    `json:"is_byok"`
	PromptTokens     int     `json:"prompt_tokens,omitempty"`
	CompletionTokens int     `json:"completion_tokens,omitempty"`
	TotalTokens      int     `json:"total_tokens,omitempty"`
}

type videoResponse struct {
	ID           string      `json:"id"`
	GenerationID string      `json:"generation_id,omitempty"`
	PollingURL   string      `json:"polling_url,omitempty"`
	Status       string      `json:"status"`
	UnsignedURLs []string    `json:"unsigned_urls,omitempty"`
	Usage        *videoUsage `json:"usage,omitempty"`
	Error        any         `json:"error,omitempty"`
}

type TaskAdaptor struct {
	taskcommon.BaseBilling
	apiKey  string
	baseURL string
}

func (a *TaskAdaptor) Init(info *relaycommon.RelayInfo) {
	a.apiKey = info.ApiKey
	a.baseURL = strings.TrimRight(info.ChannelBaseUrl, "/")
}

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *dto.TaskError {
	if info.Action == constant.TaskActionRemix {
		return service.TaskErrorWrapperLocal(fmt.Errorf("OpenRouter video remix is not supported"), "unsupported_action", http.StatusBadRequest)
	}
	if taskErr := relaycommon.ValidateMultipartDirect(c, info); taskErr != nil {
		return taskErr
	}
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	modelName := info.UpstreamModelName
	if modelName == "" {
		modelName = req.Model
	}
	if _, supported := seedanceBasePricePerSecond720p[modelName]; !supported {
		return service.TaskErrorWrapperLocal(fmt.Errorf("OpenRouter video model %q is not supported by this adaptor", modelName), "unsupported_model", http.StatusBadRequest)
	}
	if strings.HasPrefix(modelName, "bytedance/seedance-2.0") {
		if req.Size != "" && (req.Resolution != "" || req.AspectRatio != "") {
			return service.TaskErrorWrapperLocal(fmt.Errorf("size cannot be combined with resolution or aspect_ratio"), "conflicting_video_dimensions", http.StatusBadRequest)
		}
		if req.Duration != 0 && (req.Duration < 4 || req.Duration > 15) {
			return service.TaskErrorWrapperLocal(fmt.Errorf("Seedance 2.0 duration must be between 4 and 15 seconds"), "invalid_seconds", http.StatusBadRequest)
		}
		allowedResolutions := map[string]bool{"": true, "480p": true, "720p": true}
		if modelName == "bytedance/seedance-2.0" {
			allowedResolutions["1080p"] = true
			allowedResolutions["4K"] = true
		}
		if !allowedResolutions[req.Resolution] {
			return service.TaskErrorWrapperLocal(fmt.Errorf("resolution %q is not supported by %s", req.Resolution, modelName), "invalid_resolution", http.StatusBadRequest)
		}
		if !seedanceAspectRatios[req.AspectRatio] {
			return service.TaskErrorWrapperLocal(fmt.Errorf("aspect ratio %q is not supported by %s", req.AspectRatio, modelName), "invalid_aspect_ratio", http.StatusBadRequest)
		}
	}
	if req.Size == "" {
		return nil
	}
	parts := strings.Split(req.Size, "x")
	if len(parts) != 2 {
		return service.TaskErrorWrapperLocal(fmt.Errorf("size must use WIDTHxHEIGHT format"), "invalid_size", http.StatusBadRequest)
	}
	if !seedanceSizes[modelName][req.Size] {
		return service.TaskErrorWrapperLocal(fmt.Errorf("size %q is not supported by %s", req.Size, modelName), "invalid_size", http.StatusBadRequest)
	}
	return nil
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	mode, configured := billing_setting.GetConfiguredBillingMode(info.OriginModelName)
	if !configured || mode != billing_setting.BillingModeVideoSecond {
		return nil
	}
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	seconds := req.Duration
	if seconds <= 0 {
		seconds = 15
	}
	if seconds <= 0 {
		return nil
	}
	return map[string]float64{
		"seconds":    float64(seconds),
		"resolution": seedanceResolutionRatio(req),
	}
}

// Seedance's OpenRouter price is based on generated video tokens:
// width * height * duration * 24 / 1024. Default model prices use a 720p
// 16:9 second as the base, so this ratio scales the pixel count only.
func seedanceResolutionRatio(req relaycommon.TaskSubmitReq) float64 {
	if req.Size != "" {
		parts := strings.Split(req.Size, "x")
		if len(parts) == 2 {
			width, widthErr := strconv.ParseInt(parts[0], 10, 32)
			height, heightErr := strconv.ParseInt(parts[1], 10, 32)
			if widthErr == nil && heightErr == nil && width > 0 && height > 0 && width <= 8192 && height <= 8192 {
				return float64(width*height) / float64(1280*720)
			}
		}
	}

	resolutionRatio := map[string]float64{
		"480p":  4.0 / 9.0,
		"720p":  1,
		"1080p": 2.25,
		"4K":    9,
	}[req.Resolution]
	if resolutionRatio == 0 {
		resolutionRatio = 1
	}

	aspectRatio := map[string]float64{
		"1:1":  9.0 / 16.0,
		"3:4":  3.0 / 4.0,
		"9:16": 1,
		"4:3":  3.0 / 4.0,
		"16:9": 1,
		"21:9": 21.0 / 16.0,
		"9:21": 21.0 / 16.0,
	}[req.AspectRatio]
	if aspectRatio == 0 {
		aspectRatio = 1
	}
	return resolutionRatio * aspectRatio
}

func (a *TaskAdaptor) BuildRequestURL(_ *relaycommon.RelayInfo) (string, error) {
	return a.baseURL + "/v1/videos", nil
}

func (a *TaskAdaptor) BuildRequestHeader(_ *gin.Context, req *http.Request, _ *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, fmt.Errorf("get request body: %w", err)
	}
	body, err := storage.Bytes()
	if err != nil {
		return nil, fmt.Errorf("read request body: %w", err)
	}
	var payload map[string]any
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("OpenRouter video requests must use JSON: %w", err)
	}
	payload["model"] = info.UpstreamModelName
	// The public callback is delivered by this gateway after local settlement;
	// forwarding it upstream would produce duplicate and unauthenticated events.
	delete(payload, "callback_url")
	// Pin provider defaults so the frozen pre-charge snapshot and the generated
	// video always describe the same billable SKU.
	if _, ok := payload["duration"]; !ok {
		payload["duration"] = 15
	}
	if _, hasSize := payload["size"]; !hasSize {
		if _, hasResolution := payload["resolution"]; !hasResolution {
			payload["resolution"] = "720p"
		}
		if _, hasAspectRatio := payload["aspect_ratio"]; !hasAspectRatio {
			payload["aspect_ratio"] = "16:9"
		}
	}
	body, err = common.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal request body: %w", err)
	}
	return bytes.NewReader(body), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, body io.Reader) (*http.Response, error) {
	return channel.DoTaskApiRequest(a, c, info, body)
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (string, []byte, *dto.TaskError) {
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
	}
	var upstream videoResponse
	if err := common.Unmarshal(body, &upstream); err != nil {
		return "", nil, service.TaskErrorWrapper(err, "unmarshal_response_body_failed", http.StatusBadGateway)
	}
	if strings.TrimSpace(upstream.ID) == "" {
		return "", nil, service.TaskErrorWrapperLocal(fmt.Errorf("OpenRouter response is missing job id"), "invalid_response", http.StatusBadGateway)
	}
	public := upstream
	public.ID = info.PublicTaskID
	public.PollingURL = "/v1/videos/" + info.PublicTaskID
	public.Usage = nil
	// The controller writes the accepted response only after the local task row
	// has been persisted, so clients never receive an unqueryable public ID.
	c.Set("deferred_task_response", public)

	stored := upstream
	stored.ID = ""
	stored.PollingURL = ""
	stored.UnsignedURLs = nil
	stored.Usage = nil
	storedBody, err := common.Marshal(stored)
	if err != nil {
		return "", nil, service.TaskErrorWrapper(err, "marshal_response_body_failed", http.StatusInternalServerError)
	}
	return upstream.ID, storedBody, nil
}

func (a *TaskAdaptor) FetchTask(baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, fmt.Errorf("invalid task_id")
	}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(baseURL, "/")+"/v1/videos/"+taskID, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+key)
	req.Header.Set("Accept", "application/json")
	client, err := service.GetHttpClientWithProxy(proxy)
	if err != nil {
		return nil, fmt.Errorf("new proxy http client: %w", err)
	}
	return client.Do(req)
}

func (a *TaskAdaptor) ParseTaskResult(body []byte) (*relaycommon.TaskInfo, error) {
	var response videoResponse
	if err := common.Unmarshal(body, &response); err != nil {
		return nil, fmt.Errorf("unmarshal OpenRouter video result: %w", err)
	}
	result := &relaycommon.TaskInfo{}
	if response.Usage != nil {
		result.Cost = response.Usage.Cost
		result.CostKnown = true
		result.IsByok = response.Usage.Byok
		if response.Usage.TotalTokens > 0 {
			result.TotalTokens = response.Usage.TotalTokens
			if response.Usage.CompletionTokens > 0 {
				result.CompletionTokens = response.Usage.CompletionTokens
			} else {
				result.CompletionTokens = response.Usage.TotalTokens
			}
		}
	}
	switch response.Status {
	case "pending", "queued":
		result.Status = string(model.TaskStatusQueued)
	case "in_progress", "processing":
		result.Status = string(model.TaskStatusInProgress)
	case "completed":
		result.Status = string(model.TaskStatusSuccess)
		if len(response.UnsignedURLs) > 0 {
			result.RemoteUrl = response.UnsignedURLs[0]
			result.RemoteUrls = append([]string(nil), response.UnsignedURLs...)
		}
	case "failed":
		result.Status = string(model.TaskStatusFailure)
		switch upstreamError := response.Error.(type) {
		case string:
			result.Reason = upstreamError
		case map[string]any:
			result.Reason, _ = upstreamError["message"].(string)
		}
		if result.Reason == "" {
			result.Reason = "OpenRouter video generation failed"
		}
	case "cancelled":
		result.Status = string(model.TaskStatusCancelled)
	case "expired":
		result.Status = string(model.TaskStatusExpired)
	default:
		return nil, fmt.Errorf("unknown OpenRouter video status %q", response.Status)
	}
	return result, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	var response videoResponse
	if len(task.Data) > 0 {
		if err := common.Unmarshal(task.Data, &response); err != nil {
			return nil, fmt.Errorf("unmarshal OpenRouter video task: %w", err)
		}
	}

	response.ID = task.TaskID
	response.Status = task.Status.ToVideoStatus()
	response.PollingURL = "/v1/videos/" + task.TaskID
	response.UnsignedURLs = nil
	// usage.cost is supplier accounting data. Do not expose it as the customer
	// price when local SKU pricing is configured.
	response.Usage = nil
	if task.Status == model.TaskStatusSuccess {
		response.UnsignedURLs = []string{taskcommon.BuildProxyURL(task.TaskID)}
	}
	if task.Status == model.TaskStatusFailure && response.Error == nil {
		response.Error = task.FailReason
	}
	return common.Marshal(response)
}

func (a *TaskAdaptor) AdjustBillingOnComplete(task *model.Task, result *relaycommon.TaskInfo) int {
	if task == nil || result == nil {
		return 0
	}
	// Customer revenue is determined by the frozen local SKU snapshot captured
	// at submit time. OpenRouter usage.cost is supplier cost (and for BYOK can be
	// only the platform fee), so it is retained in task data for cost accounting
	// but must never rewrite the customer charge.
	return task.Quota
}

func (a *TaskAdaptor) AdjustBillingOnSubmit(_ *relaycommon.RelayInfo, _ []byte) map[string]float64 {
	return nil
}

func (a *TaskAdaptor) GetModelList() []string {
	return modelList
}

func (a *TaskAdaptor) GetChannelName() string {
	return "openrouter"
}
