package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/authz"

	// Import oauth package to register providers via init()
	_ "github.com/QuantumNous/new-api/oauth"

	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func SetApiRouter(router *gin.Engine) {
	apiRouter := router.Group("/api")
	apiRouter.Use(middleware.RouteTag("api"))
	apiRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	apiRouter.Use(middleware.BodyStorageCleanup()) // 清理请求体存储
	apiRouter.Use(middleware.GlobalAPIRateLimit())
	anonymousRequestBodyLimit := middleware.AnonymousRequestBodyLimit()
	{
		apiRouter.GET("/setup", controller.GetSetup)
		apiRouter.POST("/setup", anonymousRequestBodyLimit, controller.PostSetup)
		apiRouter.GET("/status", controller.GetStatus)
		apiRouter.GET("/uptime/status", controller.GetUptimeKumaStatus)
		apiRouter.GET("/models", middleware.UserAuth(), controller.DashboardListModels)
		apiRouter.GET("/status/test", middleware.AdminAuth(), controller.TestStatus)
		apiRouter.GET("/notice", controller.GetNotice)
		apiRouter.GET("/user-agreement", controller.GetUserAgreement)
		apiRouter.GET("/privacy-policy", controller.GetPrivacyPolicy)
		apiRouter.GET("/about", controller.GetAbout)
		//apiRouter.GET("/midjourney", controller.GetMidjourney)
		apiRouter.GET("/home_page_content", controller.GetHomePageContent)
		apiRouter.GET("/pricing", middleware.HeaderNavModuleAuth("pricing"), controller.GetPricing)
		apiRouter.POST("/pricing/quote", middleware.UserAuth(), controller.QuotePricing)
		perfMetricsRoute := apiRouter.Group("/perf-metrics")
		perfMetricsRoute.Use(middleware.HeaderNavModulePublicOrUserAuth("pricing"))
		{
			perfMetricsRoute.GET("/summary", controller.GetPerfMetricsSummary)
			perfMetricsRoute.GET("", controller.GetPerfMetrics)
		}
		apiRouter.GET("/rankings", middleware.HeaderNavModuleAuth("rankings"), controller.GetRankings)
		apiRouter.GET("/verification", middleware.EmailVerificationRateLimit(), middleware.TurnstileCheck(), controller.SendEmailVerification)
		apiRouter.GET("/reset_password", middleware.CriticalRateLimit(), middleware.TurnstileCheck(), controller.SendPasswordResetEmail)
		apiRouter.POST("/user/reset", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, controller.ResetPassword)
		// OAuth routes - specific routes must come before :provider wildcard
		apiRouter.POST("/oauth/state", middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.TryUserAuth(), anonymousRequestBodyLimit, controller.GenerateOAuthCode)
		apiRouter.POST("/oauth/email/bind", middleware.UserAuth(), middleware.CriticalRateLimit(), controller.EmailBind)
		// Non-standard OAuth (WeChat, Telegram) - keep original routes
		apiRouter.GET("/oauth/wechat", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.WeChatAuth)
		apiRouter.POST("/oauth/wechat/bind", middleware.UserAuth(), middleware.CriticalRateLimit(), controller.WeChatBind)
		apiRouter.GET("/oauth/telegram/login", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramLogin)
		apiRouter.POST("/oauth/telegram/bind/start", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramBindStart)
		apiRouter.GET("/oauth/telegram/bind/:flow_token", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.TelegramBind)
		// Standard OAuth providers (GitHub, Discord, OIDC, LinuxDO) - unified route
		apiRouter.GET("/oauth/:provider", middleware.CriticalRateLimit(), middleware.DisableCache(), middleware.TryUserAuth(), controller.HandleOAuth)

		apiRouter.POST("/stripe/webhook", anonymousRequestBodyLimit, middleware.PaymentCallbackAudit(model.PaymentProviderStripe), controller.StripeWebhook)
		apiRouter.POST("/creem/webhook", anonymousRequestBodyLimit, middleware.PaymentCallbackAudit(model.PaymentProviderCreem), controller.CreemWebhook)
		apiRouter.POST("/waffo/webhook", anonymousRequestBodyLimit, middleware.PaymentCallbackAudit(model.PaymentProviderWaffo), controller.WaffoWebhook)
		// :env separates test vs prod URLs so the operator can register each
		// in Pancake's matching webhook slot; handler enforces env match.
		apiRouter.POST("/waffo-pancake/webhook/:env", anonymousRequestBodyLimit, middleware.PaymentCallbackAudit(model.PaymentProviderWaffoPancake), controller.WaffoPancakeWebhook)

		// Universal secure verification routes
		apiRouter.POST("/verify", middleware.UserAuth(), middleware.CriticalRateLimit(), middleware.DisableCache(), controller.UniversalVerify)

		userRoute := apiRouter.Group("/user")
		{
			userRoute.POST("/auth/refresh", middleware.SessionCookieOriginGuard(), middleware.AuthRefreshRateLimit(), middleware.DisableCache(), controller.RefreshAuth)
			userRoute.POST("/auth/logout", middleware.SessionCookieOriginGuard(), middleware.DisableCache(), controller.AuthLogout)
			userRoute.POST("/register", middleware.CriticalRateLimit(), anonymousRequestBodyLimit, middleware.TurnstileCheck(), controller.Register)
			userRoute.POST("/login", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, middleware.TurnstileCheck(), controller.Login)
			userRoute.POST("/login/2fa", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.Verify2FALogin)
			userRoute.POST("/passkey/login/begin", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.PasskeyLoginBegin)
			userRoute.POST("/passkey/login/finish", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.PasskeyLoginFinish)
			userRoute.POST("/evm-wallet/login/begin", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.EVMWalletLoginBegin)
			userRoute.POST("/evm-wallet/register/begin", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, middleware.TurnstileCheck(), controller.EVMWalletRegisterBegin)
			userRoute.POST("/evm-wallet/login/finish", middleware.CriticalRateLimit(), middleware.DisableCache(), anonymousRequestBodyLimit, controller.EVMWalletLoginFinish)
			//userRoute.POST("/tokenlog", middleware.CriticalRateLimit(), controller.TokenLog)
			userRoute.POST("/epay/notify", anonymousRequestBodyLimit, middleware.PaymentCallbackAudit(model.PaymentProviderEpay), controller.EpayNotify)
			userRoute.GET("/epay/notify", middleware.PaymentCallbackAudit(model.PaymentProviderEpay), controller.EpayNotify)
			userRoute.GET("/groups", controller.GetUserGroups)

			selfRoute := userRoute.Group("/")
			selfRoute.Use(middleware.UserAuth())
			{
				selfRoute.GET("/sessions", middleware.DisableCache(), controller.GetLoginSessions)
				selfRoute.DELETE("/sessions/:sid", middleware.DisableCache(), controller.DeleteLoginSession)
				selfRoute.POST("/sessions/revoke-others", middleware.DisableCache(), controller.RevokeOtherLoginSessions)
				selfRoute.GET("/self/groups", controller.GetUserGroups)
				selfRoute.GET("/self", controller.GetSelf)
				selfRoute.GET("/models", controller.GetUserModels)
				selfRoute.PUT("/self", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.UpdateSelf)
				selfRoute.DELETE("/self", controller.DeleteSelf)
				selfRoute.GET("/token", middleware.DisableCache(), controller.GenerateAccessToken)
				selfRoute.GET("/passkey", controller.PasskeyStatus)
				selfRoute.GET("/evm-wallet", middleware.DisableCache(), controller.EVMWalletBindingStatus)
				selfRoute.POST("/evm-wallet/bind/begin", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.EVMWalletBindBegin)
				selfRoute.POST("/evm-wallet/bind/finish", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.EVMWalletBindFinish)
				selfRoute.POST("/evm-wallet/password/begin", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.EVMWalletPasswordSetupBegin)
				selfRoute.POST("/evm-wallet/password/finish", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.EVMWalletPasswordSetupFinish)
				selfRoute.DELETE("/evm-wallet", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.EVMWalletBindingDelete)
				selfRoute.POST("/passkey/register/begin", middleware.DisableCache(), controller.PasskeyRegisterBegin)
				selfRoute.POST("/passkey/register/finish", middleware.DisableCache(), controller.PasskeyRegisterFinish)
				selfRoute.POST("/passkey/verify/begin", middleware.DisableCache(), controller.PasskeyVerifyBegin)
				selfRoute.POST("/passkey/verify/finish", middleware.DisableCache(), controller.PasskeyVerifyFinish)
				selfRoute.DELETE("/passkey", middleware.DisableCache(), controller.PasskeyDelete)
				selfRoute.GET("/aff", controller.GetAffCode)
				selfRoute.GET("/topup/info", controller.GetTopUpInfo)
				selfRoute.GET("/topup/self", controller.GetUserTopUps)
				selfRoute.POST("/topup", middleware.CriticalRateLimit(), controller.TopUp)
				selfRoute.POST("/pay", middleware.CriticalRateLimit(), controller.RequestEpay)
				selfRoute.POST("/amount", controller.RequestAmount)
				selfRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.RequestStripePay)
				selfRoute.POST("/stripe/amount", controller.RequestStripeAmount)
				selfRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.RequestCreemPay)
				selfRoute.POST("/waffo/amount", controller.RequestWaffoAmount)
				selfRoute.POST("/waffo/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPay)
				selfRoute.POST("/waffo-pancake/amount", controller.RequestWaffoPancakeAmount)
				selfRoute.POST("/waffo-pancake/pay", middleware.CriticalRateLimit(), controller.RequestWaffoPancakePay)
				selfRoute.POST("/aff_transfer", controller.TransferAffQuota)
				selfRoute.GET("/setting", middleware.DisableCache(), controller.GetUserSetting)
				selfRoute.PUT("/setting", controller.UpdateUserSetting)

				// 2FA routes
				selfRoute.GET("/2fa/status", controller.Get2FAStatus)
				selfRoute.POST("/2fa/setup", middleware.DisableCache(), controller.Setup2FA)
				selfRoute.POST("/2fa/enable", middleware.DisableCache(), controller.Enable2FA)
				selfRoute.POST("/2fa/disable", middleware.DisableCache(), controller.Disable2FA)
				selfRoute.POST("/2fa/backup_codes", middleware.DisableCache(), controller.RegenerateBackupCodes)

				// Check-in routes
				selfRoute.GET("/checkin", controller.GetCheckinStatus)
				selfRoute.POST("/checkin", middleware.TurnstileCheck(), controller.DoCheckin)

				// Custom OAuth bindings
				selfRoute.GET("/oauth/bindings", controller.GetUserOAuthBindings)
				selfRoute.DELETE("/oauth/bindings/:provider_id", controller.UnbindCustomOAuth)
			}

			adminRoute := userRoute.Group("/")
			adminRoute.Use(middleware.AdminAuth())
			{
				adminRoute.GET("/", controller.GetAllUsers)
				adminRoute.GET("/topup", middleware.RequirePermission(authz.FinanceRead), controller.GetAllTopUps)
				adminRoute.GET("/topup/summary", middleware.RequirePermission(authz.FinanceRead), controller.GetAdminFinanceOverview)
				adminRoute.GET("/topup/trend", middleware.RequirePermission(authz.FinanceRead), controller.GetAdminFinanceTrend)
				adminRoute.GET("/topup/export", middleware.RequirePermission(authz.FinanceExport), controller.ExportAdminTopUps)
				adminRoute.POST("/topup/complete", middleware.RequirePermission(authz.FinanceOperate), controller.AdminCompleteTopUp)
				adminRoute.GET("/finance/callback-events", middleware.RequirePermission(authz.FinanceRead), controller.GetAdminPaymentCallbackEvents)
				adminRoute.GET("/finance/callback-events/summary", middleware.RequirePermission(authz.FinanceRead), controller.GetAdminPaymentCallbackSummary)
				adminRoute.GET("/finance/users", middleware.RequirePermission(authz.FinanceRead), controller.GetAdminFinanceUsers)
				adminRoute.GET("/finance/users/:id", middleware.RequirePermission(authz.FinanceRead), controller.GetAdminFinanceUserDetail)
				adminRoute.GET("/finance/alerts", middleware.RequirePermission(authz.FinanceRead), controller.GetAdminFinanceAlerts)
				adminRoute.GET("/finance/alerts/summary", middleware.RequirePermission(authz.FinanceRead), controller.GetAdminFinanceAlertSummary)
				adminRoute.POST("/finance/alerts/scan", middleware.RequirePermission(authz.FinanceOperate), controller.ScanAdminFinanceAlerts)
				adminRoute.POST("/finance/alerts/:id/acknowledge", middleware.RequirePermission(authz.FinanceOperate), controller.AcknowledgeAdminFinanceAlert)
				adminRoute.POST("/finance/alerts/:id/resolve", middleware.RequirePermission(authz.FinanceOperate), controller.ResolveAdminFinanceAlert)
				adminRoute.GET("/search", controller.SearchUsers)
				adminRoute.GET("/:id/oauth/bindings", controller.GetUserOAuthBindingsByAdmin)
				adminRoute.DELETE("/:id/oauth/bindings/:provider_id", controller.UnbindCustomOAuthByAdmin)
				adminRoute.DELETE("/:id/bindings/:binding_type", controller.AdminClearUserBinding)
				adminRoute.GET("/:id", controller.GetUser)
				adminRoute.POST("/", controller.CreateUser)
				adminRoute.POST("/manage", controller.ManageUser)
				adminRoute.PUT("/", controller.UpdateUser)
				adminRoute.DELETE("/:id", controller.DeleteUser)
				adminRoute.DELETE("/:id/reset_passkey", controller.AdminResetPasskey)

				// Admin 2FA routes
				adminRoute.GET("/2fa/stats", controller.Admin2FAStats)
				adminRoute.DELETE("/:id/2fa", controller.AdminDisable2FA)
			}
		}

		// Subscription billing (plans, purchase, admin management)
		subscriptionRoute := apiRouter.Group("/subscription")
		subscriptionRoute.Use(middleware.UserAuth())
		{
			subscriptionRoute.GET("/plans", controller.GetSubscriptionPlans)
			subscriptionRoute.GET("/self", controller.GetSubscriptionSelf)
			subscriptionRoute.PUT("/self/preference", controller.UpdateSubscriptionPreference)
			subscriptionRoute.POST("/balance/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestBalancePay)
			subscriptionRoute.POST("/epay/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestEpay)
			subscriptionRoute.POST("/stripe/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestStripePay)
			subscriptionRoute.POST("/creem/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestCreemPay)
			subscriptionRoute.POST("/waffo-pancake/pay", middleware.CriticalRateLimit(), controller.SubscriptionRequestWaffoPancakePay)
		}
		subscriptionAdminRoute := apiRouter.Group("/subscription/admin")
		subscriptionAdminRoute.Use(middleware.AdminAuth())
		{
			subscriptionAdminRoute.GET("/plans", controller.AdminListSubscriptionPlans)
			subscriptionAdminRoute.POST("/plans", controller.AdminCreateSubscriptionPlan)
			subscriptionAdminRoute.PUT("/plans/:id", controller.AdminUpdateSubscriptionPlan)
			subscriptionAdminRoute.PATCH("/plans/:id", controller.AdminUpdateSubscriptionPlanStatus)
			subscriptionAdminRoute.POST("/bind", controller.AdminBindSubscription)
			subscriptionAdminRoute.POST("/plans/:id/subscriptions/reset", controller.AdminResetPlanSubscriptions)

			// User subscription management (admin)
			subscriptionAdminRoute.GET("/users/:id/subscriptions", controller.AdminListUserSubscriptions)
			subscriptionAdminRoute.POST("/users/:id/subscriptions", controller.AdminCreateUserSubscription)
			subscriptionAdminRoute.POST("/users/:id/subscriptions/reset", controller.AdminResetUserSubscriptionsByPlan)
			subscriptionAdminRoute.POST("/user_subscriptions/:id/invalidate", controller.AdminInvalidateUserSubscription)
			subscriptionAdminRoute.DELETE("/user_subscriptions/:id", controller.AdminDeleteUserSubscription)
		}

		// Subscription payment callbacks (no auth)
		apiRouter.POST("/subscription/epay/notify", anonymousRequestBodyLimit, middleware.PaymentCallbackAudit(model.PaymentProviderEpay), controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/notify", middleware.PaymentCallbackAudit(model.PaymentProviderEpay), controller.SubscriptionEpayNotify)
		apiRouter.GET("/subscription/epay/return", controller.SubscriptionEpayReturn)
		apiRouter.POST("/subscription/epay/return", anonymousRequestBodyLimit, controller.SubscriptionEpayReturn)
		optionRoute := apiRouter.Group("/option")
		optionRoute.Use(middleware.RootAuth())
		{
			optionRoute.GET("/", controller.GetOptions)
			optionRoute.PUT("/", controller.UpdateOption)
			optionRoute.POST("/payment_compliance", controller.ConfirmPaymentCompliance)
			optionRoute.GET("/channel_affinity_cache", controller.GetChannelAffinityCacheStats)
			optionRoute.DELETE("/channel_affinity_cache", controller.ClearChannelAffinityCache)
			optionRoute.GET("/waffo-pancake/catalog", controller.ListWaffoPancakeCatalog)
			optionRoute.POST("/waffo-pancake/pair", controller.CreateWaffoPancakePair)
			optionRoute.POST("/waffo-pancake/save", controller.SaveWaffoPancake)
			optionRoute.POST("/waffo-pancake/subscription-product", controller.CreateWaffoPancakeSubscriptionProduct)
			optionRoute.GET("/waffo-pancake/subscription-product-options", controller.ListWaffoPancakeSubscriptionProductOptions)
		}

		// Custom OAuth provider management (root only)
		customOAuthRoute := apiRouter.Group("/custom-oauth-provider")
		customOAuthRoute.Use(middleware.RootAuth())
		{
			customOAuthRoute.POST("/discovery", controller.FetchCustomOAuthDiscovery)
			customOAuthRoute.GET("/", controller.GetCustomOAuthProviders)
			customOAuthRoute.GET("/:id", controller.GetCustomOAuthProvider)
			customOAuthRoute.POST("/", controller.CreateCustomOAuthProvider)
			customOAuthRoute.PUT("/:id", controller.UpdateCustomOAuthProvider)
			customOAuthRoute.DELETE("/:id", controller.DeleteCustomOAuthProvider)
		}
		performanceRoute := apiRouter.Group("/performance")
		performanceRoute.Use(middleware.RootAuth())
		{
			performanceRoute.GET("/stats", controller.GetPerformanceStats)
			performanceRoute.DELETE("/disk_cache", controller.ClearDiskCache)
			performanceRoute.POST("/reset_stats", controller.ResetPerformanceStats)
			performanceRoute.POST("/gc", controller.ForceGC)
			performanceRoute.GET("/logs", controller.GetLogFiles)
			performanceRoute.DELETE("/logs", controller.CleanupLogFiles)
		}
		registerChannelRoutes(apiRouter)
		registerAuthzRoutes(apiRouter)
		tokenRoute := apiRouter.Group("/token")
		tokenRoute.Use(middleware.UserAuth())
		{
			tokenRoute.GET("/", controller.GetAllTokens)
			tokenRoute.GET("/search", middleware.SearchRateLimit(), controller.SearchTokens)
			tokenRoute.GET("/auto-groups", controller.GetTokenAutoGroups)
			tokenRoute.GET("/:id", controller.GetToken)
			tokenRoute.POST("/:id/key", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKey)
			tokenRoute.POST("/", controller.AddToken)
			tokenRoute.PUT("/", controller.UpdateToken)
			tokenRoute.DELETE("/:id", controller.DeleteToken)
			tokenRoute.POST("/batch", controller.DeleteTokenBatch)
			tokenRoute.POST("/batch/keys", middleware.CriticalRateLimit(), middleware.DisableCache(), controller.GetTokenKeysBatch)
		}

		usageRoute := apiRouter.Group("/usage")
		usageRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			tokenUsageRoute := usageRoute.Group("/token")
			tokenUsageRoute.Use(middleware.TokenAuthReadOnly())
			{
				tokenUsageRoute.GET("/", controller.GetTokenUsage)
			}
		}

		redemptionRoute := apiRouter.Group("/redemption")
		redemptionRoute.Use(middleware.AdminAuth())
		{
			redemptionRoute.GET("/", controller.GetAllRedemptions)
			redemptionRoute.GET("/search", controller.SearchRedemptions)
			redemptionRoute.GET("/:id", controller.GetRedemption)
			redemptionRoute.POST("/", controller.AddRedemption)
			redemptionRoute.PUT("/", controller.UpdateRedemption)
			redemptionRoute.DELETE("/invalid", controller.DeleteInvalidRedemption)
			redemptionRoute.DELETE("/:id", controller.DeleteRedemption)
		}
		logRoute := apiRouter.Group("/log")
		logRoute.GET("/", middleware.AdminAuth(), controller.GetAllLogs)
		logRoute.GET("/stat", middleware.AdminAuth(), controller.GetLogsStat)
		logRoute.GET("/user-model-usage", middleware.AdminAuth(), controller.GetUserModelUsage)
		logRoute.GET("/self/stat", middleware.UserAuth(), controller.GetLogsSelfStat)
		logRoute.GET("/self/usage", middleware.UserAuth(), controller.GetUserUsageAnalytics)
		logRoute.GET("/self/detail/:request_id", middleware.UserAuth(), controller.GetUserRequestLog)
		logRoute.GET("/channel_affinity_usage_cache", middleware.AdminAuth(), controller.GetChannelAffinityUsageCacheStats)
		logRoute.GET("/search", middleware.AdminAuth(), controller.SearchAllLogs)
		logRoute.GET("/self", middleware.UserAuth(), controller.GetUserLogs)
		logRoute.GET("/self/search", middleware.UserAuth(), middleware.SearchRateLimit(), controller.SearchUserLogs)

		systemTaskRoute := apiRouter.Group("/system-task")
		systemTaskRoute.Use(middleware.RootAuth())
		{
			systemTaskRoute.POST("/log-cleanup", controller.CreateLogCleanupSystemTask)
			systemTaskRoute.GET("/list", controller.ListSystemTasks)
			systemTaskRoute.GET("/current", controller.GetCurrentSystemTask)
			systemTaskRoute.GET("/:task_id", controller.GetSystemTask)
		}
		systemInfoRoute := apiRouter.Group("/system-info")
		systemInfoRoute.Use(middleware.RootAuth())
		{
			systemInfoRoute.GET("/instances", controller.ListSystemInstances)
			systemInfoRoute.DELETE("/stale-instances", controller.DeleteStaleSystemInstances)
			systemInfoRoute.DELETE("/instances/:node_name", controller.DeleteStaleSystemInstance)
		}

		dataRoute := apiRouter.Group("/data")
		dataRoute.GET("/", middleware.AdminAuth(), controller.GetAllQuotaDates)
		dataRoute.GET("/users", middleware.AdminAuth(), controller.GetQuotaDatesByUser)
		dataRoute.GET("/self", middleware.UserAuth(), controller.GetUserQuotaDates)
		dataRoute.GET("/flow", middleware.AdminAuth(), controller.GetAllFlowQuotaDates)
		channelDailyUsageRoute := apiRouter.Group("/channel-daily-usages")
		channelDailyUsageRoute.Use(middleware.AdminAuth())
		{
			channelDailyUsageRoute.GET("/", controller.AdminListChannelDailyUsages)
			channelDailyUsageRoute.GET("/summary", controller.AdminSummarizeChannelDailyUsages)
			channelDailyUsageRoute.GET("/monthly-summary", controller.AdminListChannelMonthlyUsageSummary)
			channelDailyUsageRoute.GET("/filter-options", controller.AdminListChannelDailyUsageFilterOptions)
			channelDailyUsageRoute.GET("/settlement-month", controller.AdminGetChannelDailyUsageMonth)
			channelDailyUsageRoute.GET("/export", controller.AdminExportChannelDailyUsages)
			channelDailyUsageRoute.POST("/recalculate", controller.AdminRecalculateChannelDailyUsages)
			channelDailyUsageRoute.POST("/lock", controller.AdminLockChannelDailyUsages)
			channelDailyUsageRoute.POST("/unlock", controller.AdminUnlockChannelDailyUsages)
		}
		dataRoute.GET("/flow/self", middleware.UserAuth(), controller.GetUserFlowQuotaDates)

		logRoute.Use(middleware.CORS(), middleware.CriticalRateLimit())
		{
			logRoute.GET("/token", middleware.TokenAuthReadOnly(), controller.GetLogByKey)
		}
		groupRoute := apiRouter.Group("/group")
		groupRoute.Use(middleware.AdminAuth())
		{
			groupRoute.GET("/", controller.GetGroups)
		}

		prefillGroupRoute := apiRouter.Group("/prefill_group")
		prefillGroupRoute.Use(middleware.AdminAuth())
		{
			prefillGroupRoute.GET("/", controller.GetPrefillGroups)
			prefillGroupRoute.POST("/", controller.CreatePrefillGroup)
			prefillGroupRoute.PUT("/", controller.UpdatePrefillGroup)
			prefillGroupRoute.DELETE("/:id", controller.DeletePrefillGroup)
		}

		mjRoute := apiRouter.Group("/mj")
		mjRoute.GET("/self", middleware.UserAuth(), controller.GetUserMidjourney)
		mjRoute.GET("/", middleware.AdminAuth(), controller.GetAllMidjourney)

		taskRoute := apiRouter.Group("/task")
		{
			taskRoute.GET("/self", middleware.UserAuth(), controller.GetUserTask)
			taskRoute.GET("/self/:task_id/artifacts/:position", middleware.UserAuth(), controller.GetUserTaskArtifact)
			taskRoute.GET("/", middleware.AdminAuth(), controller.GetAllTask)
			taskRoute.POST("/:task_id/fail-and-refund", middleware.AdminAuth(), middleware.CriticalRateLimit(), controller.ManuallyFailAndRefundTask)
		}

		vendorRoute := apiRouter.Group("/vendors")
		vendorRoute.Use(middleware.AdminAuth())
		{
			vendorRoute.GET("/", controller.GetAllVendors)
			vendorRoute.GET("/search", controller.SearchVendors)
			vendorRoute.GET("/:id", controller.GetVendorMeta)
			vendorRoute.POST("/", controller.CreateVendorMeta)
			vendorRoute.PUT("/", controller.UpdateVendorMeta)
			vendorRoute.DELETE("/:id", controller.DeleteVendorMeta)
		}

		modelsRoute := apiRouter.Group("/models")
		modelsRoute.Use(middleware.AdminAuth())
		{
			modelsRoute.GET("/sync_upstream/preview", controller.SyncUpstreamPreview)
			modelsRoute.POST("/sync_upstream", controller.SyncUpstreamModels)
			modelsRoute.GET("/missing", controller.GetMissingModels)
			modelsRoute.GET("/", controller.GetAllModelsMeta)
			modelsRoute.GET("/search", controller.SearchModelsMeta)
			modelsRoute.GET("/routing-targets", controller.GetModelRoutingTargets)
			modelsRoute.GET("/:id", controller.GetModelMeta)
			modelsRoute.POST("/", controller.CreateModelMeta)
			modelsRoute.PUT("/", controller.UpdateModelMeta)
			modelsRoute.DELETE("/:id", controller.DeleteModelMeta)
		}

		pricingAdminRoute := apiRouter.Group("/pricing-admin")
		pricingAdminRoute.Use(middleware.AdminAuth())
		{
			pricingAdminRoute.GET("/channel-models", middleware.RequirePermission(authz.PricingRead), controller.AdminListChannelModels)
			pricingAdminRoute.GET("/channel-models/ids", middleware.RequirePermission(authz.PricingRead), controller.AdminListChannelModelIds)
			pricingAdminRoute.GET("/channel-models/export", middleware.RequirePermission(authz.PricingExport), controller.AdminExportChannelPricing)
			pricingAdminRoute.POST("/channel-models/export-selected", middleware.RequirePermission(authz.PricingExport), controller.AdminExportSelectedChannelPricing)
			pricingAdminRoute.POST("/channel-models/export-selected-purchase-discounts", middleware.RequirePermission(authz.PricingExport), controller.AdminExportSelectedChannelPurchaseDiscounts)
			pricingAdminRoute.GET("/price-books", middleware.RequirePermission(authz.PricingRead), controller.AdminListSalesPriceBooks)
			pricingAdminRoute.POST("/price-books", middleware.RequirePermission(authz.PricingWrite), controller.AdminCreateSalesPriceBook)
			pricingAdminRoute.PUT("/price-books/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminUpdateSalesPriceBook)
			pricingAdminRoute.GET("/price-books/:id/versions", middleware.RequirePermission(authz.PricingRead), controller.AdminListSalesPriceBookVersions)
			pricingAdminRoute.GET("/price-books/:id/audit-records", middleware.RequirePermission(authz.PricingRead), controller.AdminListSalesPriceBookAuditRecords)
			pricingAdminRoute.POST("/price-books/:id/versions", middleware.RequirePermission(authz.PricingWrite), controller.AdminCreateSalesPriceBookVersion)
			pricingAdminRoute.POST("/price-books/:id/versions/clone", middleware.RequirePermission(authz.PricingWrite), controller.AdminCloneSalesPriceBookVersion)
			pricingAdminRoute.PUT("/price-book-versions/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminUpdateSalesPriceBookVersionDraft)
			pricingAdminRoute.POST("/price-books/:id/disable", middleware.RequirePermission(authz.PricingPublish), controller.AdminDisableSalesPriceBook)
			pricingAdminRoute.POST("/price-books/:id/enable", middleware.RequirePermission(authz.PricingPublish), controller.AdminEnableSalesPriceBook)
			pricingAdminRoute.POST("/price-books/:id/archive", middleware.RequirePermission(authz.PricingPublish), controller.AdminArchiveSalesPriceBook)
			pricingAdminRoute.DELETE("/price-book-versions/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminDeleteSalesPriceBookVersionDraft)
			pricingAdminRoute.GET("/price-book-versions/:id/items", middleware.RequirePermission(authz.PricingRead), controller.AdminListSalesPriceBookItems)
			pricingAdminRoute.GET("/price-book-versions/:id/channel-model-overrides", middleware.RequirePermission(authz.PricingRead), controller.AdminListSalesPriceBookChannelModelOverrides)
			pricingAdminRoute.PUT("/price-book-versions/:id/channel-model-overrides/:channel_model_id", middleware.RequirePermission(authz.PricingWrite), controller.AdminSaveSalesPriceBookChannelModelOverride)
			pricingAdminRoute.DELETE("/price-book-versions/:id/channel-model-overrides/:channel_model_id", middleware.RequirePermission(authz.PricingWrite), controller.AdminDeleteSalesPriceBookChannelModelOverride)
			pricingAdminRoute.GET("/price-book-versions/:id/diff", middleware.RequirePermission(authz.PricingRead), controller.AdminCompareSalesPriceBookVersions)
			pricingAdminRoute.GET("/price-book-versions/:id/items/export", middleware.RequirePermission(authz.PricingExport), controller.AdminExportSalesPriceBookItems)
			pricingAdminRoute.GET("/price-book-versions/:id/channel-models/export", middleware.RequirePermission(authz.PricingExport), controller.AdminExportSalesPriceBookChannelModels)
			pricingAdminRoute.POST("/price-book-versions/:id/items", middleware.RequirePermission(authz.PricingWrite), controller.AdminSaveSalesPriceBookItem)
			pricingAdminRoute.POST("/price-book-items/:id/accept-review", middleware.RequirePermission(authz.PricingPublish), controller.AdminAcceptSalesPriceBookItemReview)
			pricingAdminRoute.POST("/price-book-items/:id/reject-review", middleware.RequirePermission(authz.PricingPublish), controller.AdminRejectSalesPriceBookItemReview)
			pricingAdminRoute.POST("/price-book-items/:id/status", middleware.RequirePermission(authz.PricingWrite), controller.AdminSetSalesPriceBookItemStatus)
			pricingAdminRoute.DELETE("/price-book-items/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminDeleteSalesPriceBookItem)
			pricingAdminRoute.POST("/price-book-items/batch-delete", middleware.RequirePermission(authz.PricingWrite), controller.AdminDeleteSalesPriceBookItems)
			pricingAdminRoute.POST("/price-book-versions/:id/generate-items", middleware.RequirePermission(authz.PricingWrite), controller.AdminGenerateSalesPriceBookItems)
			pricingAdminRoute.POST("/price-book-versions/:id/publish", middleware.RequirePermission(authz.PricingPublish), controller.AdminPublishSalesPriceBookVersion)
			pricingAdminRoute.GET("/pricing-change-batches", middleware.RequirePermission(authz.PricingRead), controller.AdminListPricingChangeBatches)
			pricingAdminRoute.GET("/pricing-change-batches/:id", middleware.RequirePermission(authz.PricingRead), controller.AdminGetPricingChangeBatch)
			pricingAdminRoute.POST("/pricing-change-batches/:id/publish-generated", middleware.RequirePermission(authz.PricingPublish), controller.AdminPublishGeneratedPricingChangeBatch)
			pricingAdminRoute.POST("/pricing-automation/reconcile", middleware.RequirePermission(authz.PricingWrite), controller.AdminReconcilePricingAutomation)
			pricingAdminRoute.GET("/user-price-book-assignments", middleware.RequirePermission(authz.PricingRead), controller.AdminListUserPriceBookAssignments)
			pricingAdminRoute.POST("/user-price-book-assignments", middleware.RequirePermission(authz.PricingWrite), controller.AdminAssignUserToSalesPriceBook)
			pricingAdminRoute.POST("/user-price-book-assignments/:id/cancel", middleware.RequirePermission(authz.PricingWrite), controller.AdminCancelUserPriceBookAssignment)
			pricingAdminRoute.GET("/price-book-defaults", middleware.RequirePermission(authz.PricingRead), controller.AdminGetDefaultSalesPriceBook)
			pricingAdminRoute.PUT("/price-book-defaults", middleware.RequirePermission(authz.PricingPublish), controller.AdminSetDefaultSalesPriceBook)
			pricingAdminRoute.GET("/request-pricing-snapshots", middleware.RequirePermission(authz.PricingGovernanceRead), controller.AdminListRequestPricingSnapshots)
			pricingAdminRoute.GET("/request-pricing-snapshots/summary", middleware.RequirePermission(authz.PricingGovernanceRead), controller.AdminGetPricingReconciliationSummary)
			pricingAdminRoute.GET("/request-pricing-snapshots/financial-summary", middleware.RequirePermission(authz.PricingGovernanceRead), controller.AdminGetPricingFinancialSummary)
			pricingAdminRoute.GET("/request-pricing-snapshots/export", middleware.RequirePermission(authz.PricingGovernanceExport), controller.AdminExportRequestPricingSnapshots)
			pricingAdminRoute.POST("/request-pricing-snapshots/:id/confirm-refunded", middleware.RequirePermission(authz.PricingGovernanceOperate), controller.AdminConfirmRequestPricingSnapshotRefunded)
			pricingAdminRoute.POST("/request-pricing-snapshots/:id/provider-cost", middleware.RequirePermission(authz.PricingGovernanceOperate), controller.AdminRecordProviderReportedCost)
			pricingAdminRoute.GET("/catalog-options", middleware.RequirePermission(authz.PricingRead), controller.AdminListPricingCatalogOptions)
			pricingAdminRoute.GET("/runtime-status", middleware.RequirePermission(authz.PricingRead), controller.AdminGetPricingRuntimeStatus)
			pricingAdminRoute.GET("/circuit-overview", middleware.RequirePermission(authz.PricingGovernanceRead), controller.AdminGetPricingCircuitOverview)
			pricingAdminRoute.GET("/circuit-events", middleware.RequirePermission(authz.PricingGovernanceRead), controller.AdminListPricingCircuitEvents)
			pricingAdminRoute.POST("/circuit-overview/:channel_id/reset", middleware.RequirePermission(authz.PricingGovernanceOperate), controller.AdminResetPricingCircuit)
			pricingAdminRoute.GET("/official-price-overview", middleware.RequirePermission(authz.PricingRead), controller.AdminListOfficialPriceOverview)
			pricingAdminRoute.POST("/channel-models", middleware.RequirePermission(authz.PricingWrite), controller.AdminCreateChannelModel)
			pricingAdminRoute.PUT("/channel-models/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminUpdateChannelModel)
			pricingAdminRoute.POST("/channel-models/delete-selected", middleware.RequirePermission(authz.PricingWrite), controller.AdminDeleteSelectedChannelModels)
			pricingAdminRoute.POST("/channel-models/sync", middleware.RequirePermission(authz.PricingWrite), controller.AdminSyncChannelModels)
			pricingAdminRoute.GET("/official-prices", middleware.RequirePermission(authz.PricingRead), controller.AdminListOfficialPriceVersions)
			pricingAdminRoute.POST("/official-prices", middleware.RequirePermission(authz.PricingWrite), controller.AdminCreateOfficialPriceVersion)
			pricingAdminRoute.PUT("/official-prices/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminUpdateOfficialPriceVersionDraft)
			pricingAdminRoute.POST("/official-prices/sync", middleware.RequirePermission(authz.PricingWrite), controller.AdminSyncOfficialPrices)
			pricingAdminRoute.GET("/official-prices/sync-batches", middleware.RequirePermission(authz.PricingRead), controller.AdminListOfficialPriceSyncBatches)
			pricingAdminRoute.POST("/official-prices/publish-latest", middleware.RequirePermission(authz.PricingPublish), controller.AdminPublishLatestOfficialPriceDrafts)
			pricingAdminRoute.POST("/official-prices/:id/publish", middleware.RequirePermission(authz.PricingPublish), controller.AdminPublishOfficialPriceVersion)
			pricingAdminRoute.POST("/official-prices/:id/refresh-purchase-drafts", middleware.RequirePermission(authz.PricingWrite), controller.AdminRefreshPurchaseDraftsForOfficialPrice)
			pricingAdminRoute.DELETE("/official-prices/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminDeleteOfficialPriceDraft)
			pricingAdminRoute.POST("/drafts/official-flat", middleware.RequirePermission(authz.PricingWrite), controller.AdminCreateOfficialFlatPriceDraft)
			pricingAdminRoute.PUT("/drafts/official-flat/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminUpdateOfficialFlatPriceDraft)
			pricingAdminRoute.GET("/purchase-prices", middleware.RequirePermission(authz.PricingRead), controller.AdminListPurchasePriceVersions)
			pricingAdminRoute.POST("/purchase-prices", middleware.RequirePermission(authz.PricingWrite), controller.AdminCreatePurchasePriceVersion)
			pricingAdminRoute.POST("/purchase-prices/:id/publish", middleware.RequirePermission(authz.PricingPublish), controller.AdminPublishPurchasePriceVersion)
			pricingAdminRoute.POST("/purchase-prices/:id/reprice-sales-books", middleware.RequirePermission(authz.PricingWrite), controller.AdminRepriceSalesPriceBooksForPurchaseVersion)
			pricingAdminRoute.GET("/purchase-prices/:id/suspend-impact", middleware.RequirePermission(authz.PricingRead), controller.AdminGetPurchasePriceSuspendImpact)
			pricingAdminRoute.POST("/purchase-prices/:id/suspend", middleware.RequirePermission(authz.PricingPublish), controller.AdminSuspendPurchasePriceVersion)
			pricingAdminRoute.DELETE("/purchase-prices/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminDeletePurchasePriceDraft)
			pricingAdminRoute.POST("/drafts/purchase", middleware.RequirePermission(authz.PricingWrite), controller.AdminCreateStructuredPurchasePriceDraft)
			pricingAdminRoute.PUT("/drafts/purchase/:id", middleware.RequirePermission(authz.PricingWrite), controller.AdminUpdateStructuredPurchasePriceDraft)
		}

		// Deployments (model deployment management)
		deploymentsRoute := apiRouter.Group("/deployments")
		deploymentsRoute.Use(middleware.AdminAuth())
		{
			deploymentsRoute.GET("/settings", controller.GetModelDeploymentSettings)
			deploymentsRoute.POST("/settings/test-connection", controller.TestIoNetConnection)
			deploymentsRoute.GET("/", controller.GetAllDeployments)
			deploymentsRoute.GET("/search", controller.SearchDeployments)
			deploymentsRoute.POST("/test-connection", controller.TestIoNetConnection)
			deploymentsRoute.GET("/hardware-types", controller.GetHardwareTypes)
			deploymentsRoute.GET("/locations", controller.GetLocations)
			deploymentsRoute.GET("/available-replicas", controller.GetAvailableReplicas)
			deploymentsRoute.POST("/price-estimation", controller.GetPriceEstimation)
			deploymentsRoute.GET("/check-name", controller.CheckClusterNameAvailability)
			deploymentsRoute.POST("/", controller.CreateDeployment)

			deploymentsRoute.GET("/:id", controller.GetDeployment)
			deploymentsRoute.GET("/:id/logs", controller.GetDeploymentLogs)
			deploymentsRoute.GET("/:id/containers", controller.ListDeploymentContainers)
			deploymentsRoute.GET("/:id/containers/:container_id", controller.GetContainerDetails)
			deploymentsRoute.PUT("/:id", controller.UpdateDeployment)
			deploymentsRoute.PUT("/:id/name", controller.UpdateDeploymentName)
			deploymentsRoute.POST("/:id/extend", controller.ExtendDeployment)
			deploymentsRoute.DELETE("/:id", controller.DeleteDeployment)
		}
	}
}
