package service

import (
	"bytes"
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/relay/channel/task/taskcommon"
)

func scheduleOpenRouterVideoCallback(taskID int64) {
	if taskID <= 0 {
		return
	}
	go deliverOpenRouterVideoCallback(taskID)
}

func deliverOpenRouterVideoCallback(taskID int64) {
	backoffs := []time.Duration{0, time.Second, 5 * time.Second}
	for _, backoff := range backoffs {
		if backoff > 0 {
			time.Sleep(backoff)
		}
		task, err := model.GetTaskByID(taskID)
		if err != nil || task.PrivateData.CallbackURL == "" || task.PrivateData.CallbackDeliveredAt > 0 {
			return
		}
		task.PrivateData.CallbackAttempts++
		if err := sendOpenRouterVideoCallback(task); err != nil {
			task.PrivateData.CallbackLastError = err.Error()
			_ = task.Update()
			continue
		}
		task.PrivateData.CallbackLastError = ""
		task.PrivateData.CallbackDeliveredAt = time.Now().Unix()
		if err := task.Update(); err != nil {
			logger.LogError(context.Background(), fmt.Sprintf("persist video callback success for task %s: %s", task.TaskID, err.Error()))
		}
		return
	}
}

func sendOpenRouterVideoCallback(task *model.Task) error {
	if err := ValidateSSRFProtectedFetchURL(task.PrivateData.CallbackURL); err != nil {
		return fmt.Errorf("callback URL blocked: %w", err)
	}
	response := dto.OpenRouterVideoGenerationResponse{
		ID:         task.TaskID,
		PollingURL: "/v1/videos/" + task.TaskID,
		Status:     dto.OpenRouterVideoStatusPending,
	}
	if task.Properties.GenerationID != "" {
		response.GenerationID = common.GetPointer(task.Properties.GenerationID)
	}
	switch task.Status {
	case model.TaskStatusSuccess:
		response.Status = dto.OpenRouterVideoStatusCompleted
		response.UnsignedURLs = task.GetDirectResultURLs()
		if len(response.UnsignedURLs) == 0 {
			response.UnsignedURLs = []string{taskcommon.BuildProxyURL(task.TaskID) + "?index=0"}
		}
	case model.TaskStatusFailure:
		response.Status = dto.OpenRouterVideoStatusFailed
		if task.FailReason != "" {
			response.Error = common.GetPointer(task.FailReason)
		}
	case model.TaskStatusCancelled:
		response.Status = dto.OpenRouterVideoStatusCancelled
	case model.TaskStatusExpired:
		response.Status = dto.OpenRouterVideoStatusExpired
	default:
		return fmt.Errorf("task is not terminal")
	}
	if task.PrivateData.BillingContext != nil && task.PrivateData.BillingContext.QuotaPerUnit > 0 {
		cost := float64(task.Quota) / task.PrivateData.BillingContext.QuotaPerUnit
		response.Usage = &dto.OpenRouterVideoGenerationUsage{Cost: &cost, IsBYOK: false}
	}
	body, err := common.Marshal(response)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, task.PrivateData.CallbackURL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "new-api-video-callback/1.0")
	resp, err := GetSSRFProtectedHTTPClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return fmt.Errorf("callback returned HTTP %d", resp.StatusCode)
	}
	return nil
}
