package router

import (
	"net/http"

	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service/authz"
	"github.com/gin-gonic/gin"
)

func registerTaskRoutes(apiRouter *gin.RouterGroup) {
	taskRoute := apiRouter.Group("/task")
	taskRoute.GET("/self", middleware.UserAuth(), controller.GetUserTask)
	taskRoute.GET("/self/:task_id/artifacts/:position", middleware.UserAuth(), controller.GetUserTaskArtifact)
	taskRoute.GET("/", middleware.AdminAuth(), controller.GetAllTask)

	for _, route := range taskPermissionRoutes {
		taskRoute.Handle(
			route.method,
			route.path,
			middleware.AdminAuth(),
			middleware.RequirePermission(route.permission),
			middleware.CriticalRateLimit(),
			route.handler,
		)
	}
}

var taskPermissionRoutes = []permissionRoute{
	{
		method:     http.MethodPost,
		path:       "/:task_id/fail-and-refund",
		permission: authz.FinanceOperate,
		handler:    controller.ManuallyFailAndRefundTask,
	},
}
