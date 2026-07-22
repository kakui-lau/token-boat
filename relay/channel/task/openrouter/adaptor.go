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
	"github.com/gin-gonic/gin"
)

var modelList = []string{
	"bytedance/seedance-2.0",
	"bytedance/seedance-2.0-fast",
}

type videoUsage struct {
	Cost float64 `json:"cost"`
	Byok bool    `json:"is_byok"`
}

type videoResponse struct {
	ID           string     `json:"id"`
	GenerationID string     `json:"generation_id,omitempty"`
	PollingURL   string     `json:"polling_url,omitempty"`
	Status       string     `json:"status"`
	UnsignedURLs []string   `json:"unsigned_urls,omitempty"`
	Usage        videoUsage `json:"usage,omitempty"`
	Error        any        `json:"error,omitempty"`
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
	if strings.HasPrefix(req.Model, "bytedance/seedance-2.0") {
		if req.Duration != 0 && (req.Duration < 4 || req.Duration > 15) {
			return service.TaskErrorWrapperLocal(fmt.Errorf("Seedance 2.0 duration must be between 4 and 15 seconds"), "invalid_seconds", http.StatusBadRequest)
		}
		allowedResolutions := map[string]bool{"": true, "480p": true, "720p": true}
		if req.Model == "bytedance/seedance-2.0" {
			allowedResolutions["1080p"] = true
			allowedResolutions["4K"] = true
		}
		if !allowedResolutions[req.Resolution] {
			return service.TaskErrorWrapperLocal(fmt.Errorf("resolution %q is not supported by %s", req.Resolution, req.Model), "invalid_resolution", http.StatusBadRequest)
		}
	}
	if req.Size == "" {
		return nil
	}
	parts := strings.Split(req.Size, "x")
	if len(parts) != 2 {
		return service.TaskErrorWrapperLocal(fmt.Errorf("size must use WIDTHxHEIGHT format"), "invalid_size", http.StatusBadRequest)
	}
	const maxVideoDimension = 8192
	width, widthErr := strconv.Atoi(parts[0])
	height, heightErr := strconv.Atoi(parts[1])
	if widthErr != nil || heightErr != nil || width <= 0 || height <= 0 || width > maxVideoDimension || height > maxVideoDimension {
		return service.TaskErrorWrapperLocal(fmt.Errorf("video dimensions must be between 1 and %d pixels", maxVideoDimension), "invalid_size", http.StatusBadRequest)
	}
	return nil
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, _ *relaycommon.RelayInfo) map[string]float64 {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil
	}
	seconds := req.Duration
	if seconds <= 0 && strings.HasPrefix(req.Model, "bytedance/seedance-2.0") {
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
	c.JSON(http.StatusAccepted, public)
	return upstream.ID, body, nil
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
	result := &relaycommon.TaskInfo{Cost: response.Usage.Cost}
	switch response.Status {
	case "pending", "queued":
		result.Status = string(model.TaskStatusQueued)
	case "in_progress", "processing":
		result.Status = string(model.TaskStatusInProgress)
	case "completed":
		result.Status = string(model.TaskStatusSuccess)
		if len(response.UnsignedURLs) > 0 {
			result.RemoteUrl = response.UnsignedURLs[0]
		}
	case "failed", "cancelled":
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
	if task.Status == model.TaskStatusSuccess {
		response.UnsignedURLs = []string{taskcommon.BuildProxyURL(task.TaskID)}
	}
	if task.Status == model.TaskStatusFailure && response.Error == nil {
		response.Error = task.FailReason
	}
	return common.Marshal(response)
}

func (a *TaskAdaptor) AdjustBillingOnComplete(task *model.Task, result *relaycommon.TaskInfo) int {
	if result == nil || result.Cost <= 0 {
		return 0
	}
	groupRatio := 1.0
	if task.PrivateData.BillingContext != nil && task.PrivateData.BillingContext.GroupRatio > 0 {
		groupRatio = task.PrivateData.BillingContext.GroupRatio
	}
	quota, clamp := common.QuotaFromFloatChecked(result.Cost * common.QuotaPerUnit * groupRatio)
	result.QuotaClamp = clamp
	return quota
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
