package dto

type PlayGroundRequest struct {
	Model     string `json:"model,omitempty"`
	Group     string `json:"group,omitempty"`
	ChannelId *int   `json:"channel_id,omitempty"`
	APIKeyId  *int   `json:"api_key_id,omitempty"`
}
