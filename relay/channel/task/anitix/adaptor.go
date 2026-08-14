package anitix

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	taskdto "github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/pkg/billingexpr"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	kitdto "github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/billing_setting"
	"github.com/gin-gonic/gin"
)

const upstreamRequestContextKey = "anitix_upstream_request"

var modelList = []string{
	"seedance2",
	"seedance2-fast",
	"dreamina-seedance-2-0-260128",
	"dreamina-seedance-2-0-ep",
	"dreamina-seedance-2-0-hc",
	"dreamina-seedance-2-0-fast-260128",
	"dreamina-seedance-2-0-fast-ep",
	"dreamina-seedance-2-0-fast-hc",
	"dreamina-seedance-2-0-mini-260615",
	"dreamina-seedance-2-0-mini-ep",
	"dreamina-seedance-2-0-mini-hc",
}

type submitOptions struct {
	Duration           *int     `json:"duration,omitempty"`
	AspectRatio        string   `json:"aspect_ratio,omitempty"`
	Quality            string   `json:"quality,omitempty"`
	GenerateAudio      *bool    `json:"generate_audio,omitempty"`
	FirstFrameURL      string   `json:"first_frame_url,omitempty"`
	LastFrameURL       string   `json:"last_frame_url,omitempty"`
	ReferenceImageURLs []string `json:"reference_image_urls,omitempty"`
	Seed               *int     `json:"seed,omitempty"`
}

type submitRequest struct {
	ModelName string        `json:"model_name"`
	Prompt    string        `json:"prompt,omitempty"`
	Options   submitOptions `json:"options,omitempty"`
}

type taskResponse struct {
	TaskID          string `json:"task_id"`
	Status          string `json:"status"`
	Progress        int    `json:"progress"`
	ProgressMessage string `json:"progress_message,omitempty"`
	Result          struct {
		Videos []string `json:"videos"`
	} `json:"result,omitempty"`
	Error        any    `json:"error,omitempty"`
	Code         any    `json:"code,omitempty"`
	Message      string `json:"message,omitempty"`
	ErrorMessage string `json:"error_message,omitempty"`
}

type taskResponseEnvelope struct {
	Data taskResponse `json:"data"`
}

func decodeTaskResponse(body []byte) (taskResponse, error) {
	var envelope taskResponseEnvelope
	if err := common.Unmarshal(body, &envelope); err != nil {
		return taskResponse{}, err
	}
	if envelope.Data.TaskID != "" || envelope.Data.Status != "" {
		return envelope.Data, nil
	}
	var response taskResponse
	if err := common.Unmarshal(body, &response); err != nil {
		return taskResponse{}, err
	}
	return response, nil
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

func (a *TaskAdaptor) ValidateRequestAndSetAction(c *gin.Context, info *relaycommon.RelayInfo) *taskdto.TaskError {
	if taskErr := relaycommon.ValidateBasicTaskRequest(c, info, constant.TaskActionGenerate); taskErr != nil {
		return taskErr
	}
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	if req.Duration < 0 || req.Duration > relaycommon.MaxTaskDurationSeconds {
		return service.TaskErrorWrapperLocal(
			fmt.Errorf("duration must be between 1 and %d seconds", relaycommon.MaxTaskDurationSeconds),
			"invalid_duration",
			http.StatusBadRequest,
		)
	}
	resolution := strings.ToLower(strings.TrimSpace(req.Resolution))
	if resolution == "" {
		if metadataResolution, ok := req.Metadata["resolution"].(string); ok {
			resolution = strings.ToLower(strings.TrimSpace(metadataResolution))
		}
	}
	if resolution == "" && strings.TrimSpace(req.Size) != "" {
		size := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(req.Size), "*", "x"))
		switch size {
		case "854x480", "480x854":
			resolution = "480p"
		case "1280x720", "720x1280":
			resolution = "720p"
		case "1920x1080", "1080x1920":
			resolution = "1080p"
		case "3840x2160", "2160x3840":
			resolution = "4k"
		default:
			return service.TaskErrorWrapperLocal(
				fmt.Errorf("unsupported video size %q", req.Size),
				"invalid_size",
				http.StatusBadRequest,
			)
		}
	}
	if resolution == "" {
		resolution = "720p"
	}
	switch resolution {
	case "480p", "720p", "1080p", "4k":
	default:
		return service.TaskErrorWrapperLocal(
			fmt.Errorf("unsupported video resolution %q", resolution),
			"invalid_resolution",
			http.StatusBadRequest,
		)
	}
	modelName := strings.ToLower(info.OriginModelName + " " + info.UpstreamModelName)
	if (strings.Contains(modelName, "fast") || strings.Contains(modelName, "mini")) &&
		resolution != "480p" && resolution != "720p" {
		return service.TaskErrorWrapperLocal(
			fmt.Errorf("model %s supports only 480p and 720p", info.OriginModelName),
			"invalid_resolution",
			http.StatusBadRequest,
		)
	}
	req.Resolution = resolution
	if req.Metadata == nil {
		req.Metadata = make(map[string]interface{})
	}
	req.Metadata["resolution"] = resolution
	c.Set("task_request", req)
	billingBody, err := common.Marshal(map[string]interface{}{
		"resolution":     resolution,
		"duration":       req.Duration,
		"aspect_ratio":   req.AspectRatio,
		"generate_audio": req.GenerateAudio,
	})
	if err != nil {
		return service.TaskErrorWrapperLocal(err, "invalid_request", http.StatusBadRequest)
	}
	info.BillingRequestInput = &billingexpr.RequestInput{Body: billingBody}
	for _, reference := range req.InputReferences {
		if reference.Type != "image_url" {
			return service.TaskErrorWrapperLocal(
				fmt.Errorf("Anitix only supports image input references"),
				"unsupported_parameter",
				http.StatusBadRequest,
			)
		}
	}
	return nil
}

func (a *TaskAdaptor) EstimateBilling(c *gin.Context, info *relaycommon.RelayInfo) map[string]float64 {
	mode, configured := billing_setting.GetConfiguredBillingMode(info.OriginModelName)
	if !configured || mode != billing_setting.BillingModeVideoSecond {
		return nil
	}
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil || req.Duration <= 0 {
		return nil
	}
	return map[string]float64{"seconds": float64(req.Duration)}
}

func (a *TaskAdaptor) BuildRequestURL(_ *relaycommon.RelayInfo) (string, error) {
	return a.baseURL + "/api/v1/tasks/video", nil
}

func (a *TaskAdaptor) BuildRequestHeader(_ *gin.Context, req *http.Request, _ *relaycommon.RelayInfo) error {
	req.Header.Set("Authorization", "Bearer "+a.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	return nil
}

func (a *TaskAdaptor) BuildRequestBody(c *gin.Context, info *relaycommon.RelayInfo) (io.Reader, error) {
	req, err := relaycommon.GetTaskRequest(c)
	if err != nil {
		return nil, err
	}
	modelName := strings.TrimSpace(info.UpstreamModelName)
	if modelName == "" {
		modelName = req.Model
	}
	payload := submitRequest{
		ModelName: modelName,
		Prompt:    req.Prompt,
		Options: submitOptions{
			AspectRatio:   req.AspectRatio,
			Quality:       strings.ToLower(strings.TrimSpace(req.Resolution)),
			GenerateAudio: req.GenerateAudio,
			Seed:          req.Seed,
		},
	}
	if req.Duration > 0 {
		payload.Options.Duration = &req.Duration
	} else if seconds, parseErr := strconv.Atoi(req.Seconds); parseErr == nil && seconds > 0 {
		payload.Options.Duration = &seconds
	}
	for _, frame := range req.FrameImages {
		switch frame.FrameType {
		case "first_frame":
			payload.Options.FirstFrameURL = frame.ImageURL.URL
		case "last_frame":
			payload.Options.LastFrameURL = frame.ImageURL.URL
		}
	}
	for _, reference := range req.InputReferences {
		if reference.Type == "image_url" && reference.ImageURL != nil {
			payload.Options.ReferenceImageURLs = append(payload.Options.ReferenceImageURLs, reference.ImageURL.URL)
		}
	}
	if len(req.FrameImages) == 0 && len(req.InputReferences) == 0 {
		switch len(req.Images) {
		case 1:
			payload.Options.FirstFrameURL = req.Images[0]
		case 2:
			payload.Options.FirstFrameURL = req.Images[0]
			payload.Options.LastFrameURL = req.Images[1]
		default:
			payload.Options.ReferenceImageURLs = append(payload.Options.ReferenceImageURLs, req.Images...)
		}
	}
	data, err := common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	c.Set(upstreamRequestContextKey, string(data))
	logger.LogDebug(c, "Anitix upstream request: channel_id=%d channel_name=%q url=%q origin_model=%q upstream_model=%q body=%s",
		info.ChannelId,
		common.GetContextKeyString(c, constant.ContextKeyChannelName),
		relaycommon.SanitizeURLForLog(a.baseURL+"/api/v1/tasks/video"),
		info.OriginModelName,
		modelName,
		common.LocalLogPreview(string(data)),
	)
	return bytes.NewReader(data), nil
}

func (a *TaskAdaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, body io.Reader) (*http.Response, error) {
	resp, err := channel.DoTaskApiRequest(a, c, info, body)
	if err != nil {
		logger.LogWarn(c, fmt.Sprintf("Anitix upstream request failed: channel_id=%d channel_name=%q url=%q error=%q body=%s",
			info.ChannelId,
			common.GetContextKeyString(c, constant.ContextKeyChannelName),
			relaycommon.SanitizeURLForLog(a.baseURL+"/api/v1/tasks/video"),
			err.Error(),
			common.LocalLogPreview(c.GetString(upstreamRequestContextKey)),
		))
		return nil, err
	}
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		responseBody, readErr := io.ReadAll(resp.Body)
		if readErr == nil {
			resp.Body = io.NopCloser(bytes.NewReader(responseBody))
		}
		logger.LogWarn(c, fmt.Sprintf("Anitix upstream rejected request: channel_id=%d channel_name=%q url=%q status=%d body=%s response=%s",
			info.ChannelId,
			common.GetContextKeyString(c, constant.ContextKeyChannelName),
			relaycommon.SanitizeURLForLog(a.baseURL+"/api/v1/tasks/video"),
			resp.StatusCode,
			common.LocalLogPreview(c.GetString(upstreamRequestContextKey)),
			common.LocalLogPreview(string(responseBody)),
		))
	}
	return resp, nil
}

func (a *TaskAdaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (string, []byte, *taskdto.TaskError) {
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("Anitix upstream response read failed: channel_id=%d error=%q", info.ChannelId, err.Error()))
		return "", nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
	}
	upstream, err := decodeTaskResponse(body)
	if err != nil {
		logger.LogError(c, fmt.Sprintf("Anitix upstream response parse failed: channel_id=%d error=%q response=%s",
			info.ChannelId, err.Error(), common.LocalLogPreview(string(body))))
		return "", nil, service.TaskErrorWrapper(fmt.Errorf("unmarshal Anitix response: %w", err), "invalid_response", http.StatusBadGateway)
	}
	if strings.TrimSpace(upstream.TaskID) == "" {
		logger.LogWarn(c, fmt.Sprintf("Anitix upstream response missing task_id: channel_id=%d response=%s",
			info.ChannelId, common.LocalLogPreview(string(body))))
		return "", nil, service.TaskErrorWrapperLocal(fmt.Errorf("Anitix response is missing task_id: %s", common.LocalLogPreview(string(body))), "invalid_response", http.StatusBadGateway)
	}
	if !relaycommon.IsOpenRouterVideoRequest(c) {
		video := kitdto.NewOpenAIVideo()
		video.ID = info.PublicTaskID
		video.TaskID = info.PublicTaskID
		video.Model = info.OriginModelName
		video.Status = model.TaskStatus(model.TaskStatusSubmitted).ToVideoStatus()
		c.JSON(http.StatusOK, video)
	}
	return upstream.TaskID, body, nil
}

func (a *TaskAdaptor) FetchTask(baseURL, key string, body map[string]any, proxy string) (*http.Response, error) {
	taskID, ok := body["task_id"].(string)
	if !ok || strings.TrimSpace(taskID) == "" {
		return nil, fmt.Errorf("invalid task_id")
	}
	req, err := http.NewRequest(http.MethodGet, strings.TrimRight(baseURL, "/")+"/api/v1/tasks/"+taskID, nil)
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
	upstream, err := decodeTaskResponse(body)
	if err != nil {
		logger.LogError(nil, fmt.Sprintf("Anitix task response parse failed: error=%q response=%s",
			err.Error(), common.LocalLogPreview(string(body))))
		return nil, fmt.Errorf("unmarshal Anitix task result: %w", err)
	}
	result := &relaycommon.TaskInfo{}
	if upstream.Progress >= 0 && upstream.Progress <= 100 {
		result.Progress = strconv.Itoa(upstream.Progress) + "%"
	}
	switch strings.ToLower(upstream.Status) {
	case "pending", "submitted", "queued":
		result.Status = string(model.TaskStatusQueued)
	case "running", "processing", "in_progress":
		result.Status = string(model.TaskStatusInProgress)
	case "completed", "succeeded", "success":
		result.Status = string(model.TaskStatusSuccess)
		result.Progress = taskcommon.ProgressComplete
		if len(upstream.Result.Videos) > 0 {
			result.RemoteUrl = upstream.Result.Videos[0]
			result.RemoteUrls = append([]string(nil), upstream.Result.Videos...)
		}
	case "failed", "error":
		result.Status = string(model.TaskStatusFailure)
		result.Progress = taskcommon.ProgressComplete
		result.Reason = upstream.ErrorMessage
		if result.Reason == "" {
			result.Reason = upstream.Message
		}
		if result.Reason == "" {
			result.Reason = fmt.Sprint(upstream.Error)
		}
		logger.LogWarn(nil, fmt.Sprintf("Anitix upstream task failed: task_id=%q reason=%q response=%s",
			upstream.TaskID, result.Reason, common.LocalLogPreview(string(body))))
	case "cancelled", "canceled":
		result.Status = string(model.TaskStatusCancelled)
	case "expired":
		result.Status = string(model.TaskStatusExpired)
	default:
		logger.LogWarn(nil, fmt.Sprintf("Anitix upstream returned unknown task status: task_id=%q status=%q response=%s",
			upstream.TaskID, upstream.Status, common.LocalLogPreview(string(body))))
		return nil, fmt.Errorf("unknown Anitix task status %q", upstream.Status)
	}
	return result, nil
}

func (a *TaskAdaptor) ConvertToOpenAIVideo(task *model.Task) ([]byte, error) {
	video := kitdto.NewOpenAIVideo()
	video.ID = task.TaskID
	video.TaskID = task.TaskID
	video.Status = task.Status.ToVideoStatus()
	video.SetProgressStr(task.Progress)
	video.CreatedAt = task.CreatedAt
	video.CompletedAt = task.UpdatedAt
	video.Model = task.Properties.OriginModelName
	if task.Status == model.TaskStatusSuccess {
		video.SetMetadata("url", taskcommon.BuildProxyURL(task.TaskID))
	}
	if task.Status == model.TaskStatusFailure {
		video.Error = &kitdto.OpenAIVideoError{Message: task.FailReason, Code: "generation_failed"}
	}
	return common.Marshal(video)
}

func (a *TaskAdaptor) GetModelList() []string { return modelList }

func (a *TaskAdaptor) GetChannelName() string { return "anitix" }
