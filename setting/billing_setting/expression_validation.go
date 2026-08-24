package billing_setting

import (
	"fmt"

	"github.com/QuantumNous/new-api/pkg/billingexpr"
)

// SmokeTestExpr validates a purchase or sales billing expression against
// representative request and usage vectors before a price version is saved.
func SmokeTestExpr(expression string) error {
	vectors := []billingexpr.TokenParams{
		{},
		{P: 1000, C: 1000, Len: 1000},
		{
			P: 1000, C: 1000, Len: 1000,
			CR: 1000, CC: 1000, CC1h: 1000,
			Img: 1000, ImgO: 1000, AI: 1000, AO: 1000,
			Req: 1, Imgs: 2, AudS: 3, VidS: 4, Chars: 1000,
		},
		{P: 100000, C: 100000, Len: 100000},
		{P: 1000000, C: 1000000, Len: 1000000},
	}
	requests := []billingexpr.RequestInput{
		{},
		{
			Headers: map[string]string{"anthropic-beta": "fast-mode-2026-02-01"},
			Body:    []byte(`{"service_tier":"fast","operation":"generate","quality":"high","resolution":"1080p","with_audio":true,"stream_options":{"include_usage":true},"messages":[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21]}`),
		},
	}
	for _, usage := range vectors {
		for _, request := range requests {
			result, _, err := billingexpr.RunExprWithRequest(expression, usage, request)
			if err != nil {
				return fmt.Errorf("vector {p=%g, c=%g}: run failed: %w", usage.P, usage.C, err)
			}
			if result < 0 {
				return fmt.Errorf("vector {p=%g, c=%g}: result %f < 0", usage.P, usage.C, result)
			}
		}
	}
	return nil
}
