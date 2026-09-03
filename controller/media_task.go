package controller

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relaykit/dto"

	"github.com/gin-gonic/gin"
)

const (
	mediaTaskResponseCaptureLimit = 32 << 20
	mediaTaskArtifactLimit        = 4
	mediaTaskArtifactBytesLimit   = 16 << 20
	mediaTaskArtifactsBytesLimit  = 24 << 20
)

var markdownImageURLPattern = regexp.MustCompile(`!\[[^\]]*\]\((https?://[^\s)]+)\)`)

type mediaTaskResponseWriter struct {
	gin.ResponseWriter
	body bytes.Buffer
}

func newMediaTaskResponseWriter(writer gin.ResponseWriter) *mediaTaskResponseWriter {
	return &mediaTaskResponseWriter{ResponseWriter: writer}
}

func (w *mediaTaskResponseWriter) Write(data []byte) (int, error) {
	w.capture(data)
	return w.ResponseWriter.Write(data)
}

func (w *mediaTaskResponseWriter) WriteString(data string) (int, error) {
	w.capture([]byte(data))
	return w.ResponseWriter.WriteString(data)
}

func (w *mediaTaskResponseWriter) capture(data []byte) {
	remaining := mediaTaskResponseCaptureLimit - w.body.Len()
	if remaining <= 0 {
		return
	}
	if len(data) > remaining {
		data = data[:remaining]
	}
	_, _ = w.body.Write(data)
}

func (w *mediaTaskResponseWriter) Bytes() []byte {
	return w.body.Bytes()
}

func (w *mediaTaskResponseWriter) Reset() {
	w.body.Reset()
}

func shouldCaptureMediaTaskResponse(info *relaycommon.RelayInfo) bool {
	if info == nil {
		return false
	}
	return info.IsPlayground ||
		info.RelayMode == relayconstant.RelayModeImagesGenerations ||
		info.RelayMode == relayconstant.RelayModeImagesEdits
}

func persistCompletedMediaTask(
	c *gin.Context,
	info *relaycommon.RelayInfo,
	request dto.Request,
	responseBody []byte,
) {
	task, artifacts, ok := buildCompletedMediaTask(info, request, responseBody)
	if !ok {
		return
	}
	_, exists, err := model.GetByOnlyTaskId(task.TaskID)
	if err != nil {
		logger.LogError(c, "check completed image task: "+err.Error())
		return
	}
	if exists {
		return
	}
	if err := task.InsertWithArtifacts(artifacts); err != nil {
		logger.LogError(c, "persist completed image task: "+err.Error())
	}
}

func buildCompletedMediaTask(
	info *relaycommon.RelayInfo,
	request dto.Request,
	responseBody []byte,
) (*model.Task, []model.TaskArtifact, bool) {
	if info == nil || strings.TrimSpace(info.RequestId) == "" {
		return nil, nil, false
	}

	isDedicatedImage := info.RelayMode == relayconstant.RelayModeImagesGenerations ||
		info.RelayMode == relayconstant.RelayModeImagesEdits
	hasGeneratedImage, resultURLs, resultCount := inspectGeneratedImageResponse(responseBody, isDedicatedImage)
	if !isDedicatedImage && (!info.IsPlayground || !hasGeneratedImage) {
		return nil, nil, false
	}
	artifacts := extractGeneratedImageArtifacts(responseBody, time.Now().Unix())

	now := time.Now().Unix()
	action := "image_generation"
	if info.RelayMode == relayconstant.RelayModeImagesEdits {
		action = "image_edit"
	}
	prompt, metadata := mediaTaskRequestDetails(request)
	if resultCount > 0 {
		metadata["result_count"] = resultCount
	}
	metadata["request_id"] = info.RequestId
	if len(artifacts) > 0 {
		metadata["stored_result_count"] = len(artifacts)
		resultURLs = make([]string, len(artifacts))
		for index := range artifacts {
			resultURLs[index] = fmt.Sprintf("/api/task/self/%s/artifacts/%d", url.PathEscape(info.RequestId), index)
		}
	}

	task := &model.Task{
		CreatedAt:        now,
		UpdatedAt:        now,
		TaskID:           info.RequestId,
		Platform:         constant.TaskPlatform("image"),
		UserId:           info.UserId,
		Group:            info.UsingGroup,
		ChannelId:        info.ChannelId,
		Quota:            info.FinalConsumedQuota,
		SettlementStatus: model.TaskSettlementStatusCompleted,
		Action:           action,
		Status:           model.TaskStatusSuccess,
		SubmitTime:       info.StartTime.Unix(),
		StartTime:        info.StartTime.Unix(),
		FinishTime:       now,
		Progress:         "100%",
		Properties: model.Properties{
			Input:             truncateTaskText(prompt, 4000),
			UpstreamModelName: info.UpstreamModelName,
			OriginModelName:   info.OriginModelName,
			GenerationID:      info.RequestId,
		},
		PrivateData: model.TaskPrivateData{
			ResultURLs: resultURLs,
		},
	}
	if len(resultURLs) > 0 {
		task.PrivateData.ResultURL = resultURLs[0]
	}
	task.SetData(metadata)
	return task, artifacts, true
}

func extractGeneratedImageArtifacts(body []byte, createdAt int64) []model.TaskArtifact {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return nil
	}

	artifacts := make([]model.TaskArtifact, 0, 1)
	seen := make(map[[sha256.Size]byte]struct{})
	totalBytes := 0
	appendEncoded := func(encoded string, declaredType string) {
		if len(artifacts) >= mediaTaskArtifactLimit || totalBytes >= mediaTaskArtifactsBytesLimit {
			return
		}
		encoded = strings.Map(func(r rune) rune {
			if r == ' ' || r == '\n' || r == '\r' || r == '\t' {
				return -1
			}
			return r
		}, encoded)
		if encoded == "" || base64.StdEncoding.DecodedLen(len(encoded)) > mediaTaskArtifactBytesLimit {
			return
		}
		content, err := base64.StdEncoding.DecodeString(encoded)
		if err != nil {
			content, err = base64.RawStdEncoding.DecodeString(encoded)
		}
		if err != nil || len(content) == 0 || len(content) > mediaTaskArtifactBytesLimit || totalBytes+len(content) > mediaTaskArtifactsBytesLimit {
			return
		}
		contentType := http.DetectContentType(content)
		if !isSafeTaskImageType(contentType) {
			declaredType = strings.ToLower(strings.TrimSpace(strings.Split(declaredType, ";")[0]))
			if declaredType != "image/avif" || !looksLikeAVIF(content) {
				return
			}
			contentType = declaredType
		}
		digest := sha256.Sum256(content)
		if _, exists := seen[digest]; exists {
			return
		}
		seen[digest] = struct{}{}
		artifacts = append(artifacts, model.TaskArtifact{
			CreatedAt:   createdAt,
			Position:    len(artifacts),
			ContentType: contentType,
			Content:     content,
		})
		totalBytes += len(content)
	}

	var inspect func(any, bool, string)
	inspect = func(value any, imageContext bool, declaredType string) {
		switch typed := value.(type) {
		case map[string]any:
			mapType := declaredType
			for key, child := range typed {
				normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
				if normalized == "mime_type" || normalized == "mimetype" {
					mapType, _ = child.(string)
				}
			}
			for key, child := range typed {
				normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
				childContext := imageContext || normalized == "image_url" || normalized == "image_urls" ||
					normalized == "b64_json" || normalized == "inline_data" || normalized == "inlinedata"
				if text, ok := child.(string); ok {
					if normalized == "b64_json" || (imageContext && normalized == "data") {
						appendEncoded(text, mapType)
					}
					if mediaType, encoded, ok := parseImageDataURI(text); ok {
						appendEncoded(encoded, mediaType)
					}
				}
				inspect(child, childContext, mapType)
			}
		case []any:
			for _, child := range typed {
				inspect(child, imageContext, declaredType)
			}
		case string:
			if mediaType, encoded, ok := parseImageDataURI(typed); ok {
				appendEncoded(encoded, mediaType)
			}
		}
	}
	var payload any
	if err := common.Unmarshal(trimmed, &payload); err == nil {
		inspect(payload, false, "image/png")
	} else {
		for _, line := range bytes.Split(trimmed, []byte("\n")) {
			line = bytes.TrimSpace(line)
			if !bytes.HasPrefix(line, []byte("data:")) {
				continue
			}
			line = bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
			if common.Unmarshal(line, &payload) == nil {
				inspect(payload, false, "image/png")
			}
		}
	}
	return artifacts
}

func parseImageDataURI(value string) (string, string, bool) {
	value = strings.TrimSpace(value)
	comma := strings.IndexByte(value, ',')
	if comma <= len("data:image/") || !strings.HasPrefix(strings.ToLower(value), "data:image/") {
		return "", "", false
	}
	header := value[:comma]
	if !strings.Contains(strings.ToLower(header), ";base64") {
		return "", "", false
	}
	mediaType := strings.TrimPrefix(strings.SplitN(header, ";", 2)[0], "data:")
	return mediaType, value[comma+1:], true
}

func isSafeTaskImageType(contentType string) bool {
	switch contentType {
	case "image/png", "image/jpeg", "image/gif", "image/webp":
		return true
	default:
		return false
	}
}

func looksLikeAVIF(content []byte) bool {
	return len(content) >= 12 && string(content[4:8]) == "ftyp" &&
		(string(content[8:12]) == "avif" || string(content[8:12]) == "avis")
}

func mediaTaskRequestDetails(request dto.Request) (string, map[string]any) {
	metadata := map[string]any{}
	switch value := request.(type) {
	case *dto.ImageRequest:
		count := uint(1)
		if value.N != nil && *value.N > 0 {
			count = *value.N
		}
		metadata["n"] = count
		if value.Size != "" {
			metadata["size"] = value.Size
		}
		if value.Quality != "" {
			metadata["quality"] = value.Quality
		}
		if value.ResponseFormat != "" {
			metadata["response_format"] = value.ResponseFormat
		}
		return value.Prompt, metadata
	case *dto.GeneralOpenAIRequest:
		for index := len(value.Messages) - 1; index >= 0; index-- {
			message := value.Messages[index]
			if message.Role != "user" {
				continue
			}
			if text, ok := message.Content.(string); ok {
				return text, metadata
			}
		}
		return value.GetTokenCountMeta().CombineText, metadata
	default:
		return "", metadata
	}
}

func inspectGeneratedImageResponse(body []byte, dedicatedImage bool) (bool, []string, int) {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return dedicatedImage, nil, 0
	}

	hasImage := dedicatedImage
	resultURLs := make([]string, 0)
	resultCount := 0
	seen := make(map[string]struct{})
	appendURL := func(candidate string) {
		candidate = strings.TrimSpace(candidate)
		if len(candidate) > 4096 {
			return
		}
		parsed, err := url.ParseRequestURI(candidate)
		if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
			return
		}
		if _, exists := seen[candidate]; exists {
			return
		}
		seen[candidate] = struct{}{}
		resultURLs = append(resultURLs, candidate)
	}

	var payload any
	if err := common.Unmarshal(trimmed, &payload); err == nil {
		inspectImagePayload(payload, dedicatedImage, false, &hasImage, &resultCount, appendURL)
	} else {
		for _, line := range bytes.Split(trimmed, []byte("\n")) {
			line = bytes.TrimSpace(line)
			if !bytes.HasPrefix(line, []byte("data:")) {
				continue
			}
			line = bytes.TrimSpace(bytes.TrimPrefix(line, []byte("data:")))
			if common.Unmarshal(line, &payload) == nil {
				inspectImagePayload(payload, dedicatedImage, false, &hasImage, &resultCount, appendURL)
			}
		}
	}

	raw := string(trimmed)
	lower := strings.ToLower(raw)
	if strings.Contains(lower, `"b64_json"`) ||
		strings.Contains(lower, "data:image/") ||
		(strings.Contains(lower, `"inlinedata"`) && strings.Contains(lower, "image/")) ||
		(strings.Contains(lower, `"inline_data"`) && strings.Contains(lower, "image/")) {
		hasImage = true
		if resultCount == 0 {
			resultCount = 1
		}
	}
	for _, match := range markdownImageURLPattern.FindAllStringSubmatch(raw, -1) {
		if len(match) < 2 {
			continue
		}
		hasImage = true
		resultCount++
		appendURL(match[1])
	}
	return hasImage, resultURLs, resultCount
}

func inspectImagePayload(
	value any,
	dedicatedImage bool,
	imageContext bool,
	hasImage *bool,
	resultCount *int,
	appendURL func(string),
) {
	switch typed := value.(type) {
	case map[string]any:
		for key, child := range typed {
			normalized := strings.ToLower(strings.ReplaceAll(key, "-", "_"))
			childImageContext := imageContext || normalized == "image_url" || normalized == "image_urls" ||
				normalized == "b64_json" || normalized == "inline_data" || normalized == "inlinedata"
			if childImageContext && !imageContext {
				*hasImage = true
				*resultCount++
			}
			if text, ok := child.(string); ok {
				if childImageContext && strings.HasPrefix(strings.ToLower(strings.TrimSpace(text)), "data:image/") {
					*hasImage = true
				}
				if childImageContext || (dedicatedImage && normalized == "url") {
					appendURL(text)
				}
			}
			inspectImagePayload(child, dedicatedImage, childImageContext, hasImage, resultCount, appendURL)
		}
	case []any:
		for _, child := range typed {
			inspectImagePayload(child, dedicatedImage, imageContext, hasImage, resultCount, appendURL)
		}
	case string:
		trimmed := strings.TrimSpace(typed)
		if imageContext && strings.HasPrefix(strings.ToLower(trimmed), "data:image/") {
			*hasImage = true
		}
		if imageContext {
			appendURL(trimmed)
		}
	}
}

func truncateTaskText(value string, maxRunes int) string {
	if maxRunes <= 0 || utf8.RuneCountInString(value) <= maxRunes {
		return value
	}
	runes := []rune(value)
	return string(runes[:maxRunes])
}
