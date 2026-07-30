package service

import (
	"errors"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type refundResultFunding struct {
	refundErr error
	refunded  bool
}

func (f *refundResultFunding) Source() string       { return BillingSourceWallet }
func (f *refundResultFunding) PreConsume(int) error { return nil }
func (f *refundResultFunding) Settle(int) error     { return nil }
func (f *refundResultFunding) Refund() error {
	f.refunded = true
	return f.refundErr
}

func TestRefundWithResultCompletesRefundBeforeReturning(t *testing.T) {
	gin.SetMode(gin.TestMode)
	funding := &refundResultFunding{}
	session := &BillingSession{
		relayInfo:     &relaycommon.RelayInfo{IsPlayground: true},
		funding:       funding,
		tokenConsumed: 10,
	}
	callbackCalled := false

	session.RefundWithResult(&gin.Context{}, func(err error) {
		require.NoError(t, err)
		assert.True(t, funding.refunded)
		callbackCalled = true
	})

	assert.True(t, callbackCalled)
}

func TestRefundWithResultReportsFailureBeforeReturning(t *testing.T) {
	gin.SetMode(gin.TestMode)
	expectedErr := errors.New("refund failed")
	funding := &refundResultFunding{refundErr: expectedErr}
	session := &BillingSession{
		relayInfo:     &relaycommon.RelayInfo{IsPlayground: true},
		funding:       funding,
		tokenConsumed: 10,
	}
	var callbackErr error

	session.RefundWithResult(&gin.Context{}, func(err error) {
		callbackErr = err
	})

	assert.ErrorIs(t, callbackErr, expectedErr)
	assert.True(t, funding.refunded)
}
