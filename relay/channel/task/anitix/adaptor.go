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
	Error   any    `json:"error,omitempty"`
	Code    any    `json:"code,omitempty"`
	Message string `json:"message,omitempty"`
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
		return "", nil, service.TaskErrorWrapper(err, "read_response_body_failed", http.StatusInternalServerError)
	}
	var upstream taskResponse
	if err := common.Unmarshal(body, &upstream); err != nil {
		return "", nil, service.TaskErrorWrapper(fmt.Errorf("unmarshal Anitix response: %w", err), "invalid_response", http.StatusBadGateway)
	}
	if strings.TrimSpace(upstream.TaskID) == "" {
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
	var upstream taskResponse
	if err := common.Unmarshal(body, &upstream); err != nil {
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
		result.Reason = upstream.Message
		if result.Reason == "" {
			result.Reason = fmt.Sprint(upstream.Error)
		}
	case "cancelled", "canceled":
		result.Status = string(model.TaskStatusCancelled)
	case "expired":
		result.Status = string(model.TaskStatusExpired)
	default:
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
