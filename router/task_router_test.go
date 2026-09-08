package router

import (
	"net/http"
	"reflect"
	"testing"

	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestManualTaskRefundRouteUsesFinanceOperatePermission(t *testing.T) {
	for _, route := range taskPermissionRoutes {
		if route.method == http.MethodPost && route.path == "/:task_id/fail-and-refund" {
			assert.Equal(t, authz.FinanceOperate, route.permission)
			assert.Equal(t, reflect.ValueOf(controller.ManuallyFailAndRefundTask).Pointer(), reflect.ValueOf(route.handler).Pointer())
			return
		}
	}
	require.FailNow(t, "manual task refund route not found")
}
