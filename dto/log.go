package dto

// AdminRequestLog is the deliberately narrow network projection used by the
// administrator request workspace. Raw log payloads, token identifiers, and
// billing/routing metadata never cross this boundary.
type AdminRequestLog struct {
	ID                  int      `json:"id"`
	CreatedAt           int64    `json:"created_at"`
	Type                int      `json:"type"`
	Username            string   `json:"username"`
	APIKeyName          string   `json:"api_key_name,omitempty"`
	ModelName           string   `json:"model_name,omitempty"`
	CostUSD             *float64 `json:"cost_usd"`
	PromptTokens        int      `json:"prompt_tokens"`
	CompletionTokens    int      `json:"completion_tokens"`
	LatencyMilliseconds *float64 `json:"latency_ms"`
	FirstTokenLatencyMS *float64 `json:"first_token_latency_ms,omitempty"`
	IsStream            bool     `json:"is_stream"`
	ChannelID           int      `json:"channel_id,omitempty"`
	ChannelName         string   `json:"channel_name,omitempty"`
	Group               string   `json:"group,omitempty"`
	SourceIP            string   `json:"source_ip,omitempty"`
	RequestID           string   `json:"request_id,omitempty"`
	UpstreamRequestID   string   `json:"upstream_request_id,omitempty"`
	TaskID              string   `json:"task_id,omitempty"`
	Endpoint            string   `json:"endpoint,omitempty"`
	StatusCode          *int     `json:"status_code,omitempty"`
	ErrorCode           string   `json:"error_code,omitempty"`
	ErrorMessage        string   `json:"error_message,omitempty"`
}
