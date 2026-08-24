package controller

import (
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/gin-gonic/gin"
)

func AdminListSalesPriceBooks(c *gin.Context) {
	page, pageSize, err := salesPriceBookPageQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	books, total, err := pricingadmin.ListSalesPriceBooks(pricingadmin.SalesPriceBookListFilter{
		Keyword:  c.Query("keyword"),
		Audience: c.Query("audience"),
		Status:   c.Query("status"),
		Page:     page,
		PageSize: pageSize,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": books, "total": total, "page": page, "page_size": pageSize,
	})
}

func AdminCreateSalesPriceBook(c *gin.Context) {
	var input model.SalesPriceBook
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.CreateSalesPriceBook(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminListSalesPriceBookVersions(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	versions, err := pricingadmin.ListSalesPriceBookVersions(priceBookId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, versions)
}

func AdminCreateSalesPriceBookVersion(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input model.SalesPriceBookVersion
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	input.PriceBookId = priceBookId
	if err := pricingadmin.CreateSalesPriceBookVersion(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminCloneSalesPriceBookVersion(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input struct {
		SourceVersionId int `json:"source_version_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	version, err := pricingadmin.CloneSalesPriceBookVersion(
		priceBookId,
		input.SourceVersionId,
		c.GetInt("id"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, version)
}

func AdminDisableSalesPriceBook(c *gin.Context) {
	priceBookId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.DisableSalesPriceBook(priceBookId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminListSalesPriceBookItems(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	items, err := pricingadmin.ListSalesPriceBookItems(versionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, items)
}

func AdminCompareSalesPriceBookVersions(c *gin.Context) {
	targetVersionId, ok := positivePathId(c)
	if !ok {
		return
	}
	baseVersionId, err := optionalPositiveQueryId(c, "base_version_id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if baseVersionId == 0 {
		common.ApiError(c, errors.New("base_version_id must be provided"))
		return
	}
	diff, err := pricingadmin.CompareSalesPriceBookVersions(baseVersionId, targetVersionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, diff)
}

func AdminExportSalesPriceBookItems(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	items, err := pricingadmin.ListSalesPriceBookItems(versionId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	filename := fmt.Sprintf(
		"sales-price-book-version-%d-items-%s.csv",
		versionId,
		time.Now().UTC().Format("20060102-150405"),
	)
	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
	c.Status(200)
	_, _ = c.Writer.Write([]byte{0xEF, 0xBB, 0xBF})
	writer := csv.NewWriter(c.Writer)
	_ = writer.Write([]string{
		"模型名称", "状态", "计费模式", "价格结构", "定价方式", "销售系数",
		"官方折扣", "币种", "销售表达式", "表达式哈希", "备注",
	})
	for _, item := range items {
		_ = writer.Write([]string{
			spreadsheetSafeCSVCell(item.ModelName),
			item.Status,
			item.BillingMode,
			item.PriceStructure,
			item.PricingMethod,
			item.SellingFactor,
			item.OfficialDiscount,
			item.Currency,
			spreadsheetSafeCSVCell(item.SalesBillingExpr),
			item.SalesExprHash,
			spreadsheetSafeCSVCell(item.Remark),
		})
	}
	writer.Flush()
}

func AdminSaveSalesPriceBookItem(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input model.SalesPriceBookItem
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	input.PriceBookVersionId = versionId
	if err := pricingadmin.SaveSalesPriceBookItem(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminGenerateSalesPriceBookItems(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	var input pricingadmin.SalesPriceBookGenerationInput
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := pricingadmin.GenerateSalesPriceBookItems(versionId, input, c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, result)
}

func AdminGetPricingChangeBatch(c *gin.Context) {
	batchId, ok := positivePathId(c)
	if !ok {
		return
	}
	batch, items, err := pricingadmin.GetPricingChangeBatch(batchId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"batch": batch, "items": items})
}

func AdminListPricingChangeBatches(c *gin.Context) {
	page, pageSize, err := salesPriceBookPageQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	items, total, err := pricingadmin.ListPricingChangeBatches(
		pricingadmin.PricingChangeBatchListFilter{
			Keyword: c.Query("keyword"), Status: c.Query("status"),
			TriggerType: c.Query("trigger_type"), Page: page, PageSize: pageSize,
		},
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": items, "total": total, "page": page, "page_size": pageSize,
	})
}

func AdminPublishSalesPriceBookVersion(c *gin.Context) {
	versionId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.PublishSalesPriceBookVersion(versionId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminListUserPriceBookAssignments(c *gin.Context) {
	page, pageSize, err := salesPriceBookPageQuery(c)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	userId, err := optionalPositiveQueryId(c, "user_id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	priceBookId, err := optionalPositiveQueryId(c, "price_book_id")
	if err != nil {
		common.ApiError(c, err)
		return
	}
	assignments, total, err := pricingadmin.ListUserPriceBookAssignments(
		pricingadmin.UserPriceBookAssignmentListFilter{
			Keyword:     c.Query("keyword"),
			UserId:      userId,
			PriceBookId: priceBookId,
			Status:      c.Query("status"),
			Page:        page,
			PageSize:    pageSize,
		},
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items": assignments, "total": total, "page": page, "page_size": pageSize,
	})
}

func salesPriceBookPageQuery(c *gin.Context) (int, int, error) {
	page := 1
	if rawPage := strings.TrimSpace(c.Query("p")); rawPage != "" {
		parsed, err := strconv.Atoi(rawPage)
		if err != nil || parsed <= 0 {
			return 0, 0, errors.New("p must be a positive integer")
		}
		page = parsed
	}
	pageSize := pricingadmin.SalesPriceBookDefaultPageSize
	rawPageSize := strings.TrimSpace(c.Query("page_size"))
	if rawPageSize == "" {
		rawPageSize = strings.TrimSpace(c.Query("ps"))
	}
	if rawPageSize == "" {
		rawPageSize = strings.TrimSpace(c.Query("size"))
	}
	if rawPageSize != "" {
		parsed, err := strconv.Atoi(rawPageSize)
		if err != nil || parsed <= 0 {
			return 0, 0, errors.New("page_size must be a positive integer")
		}
		pageSize = min(parsed, pricingadmin.SalesPriceBookMaximumPageSize)
	}
	return page, pageSize, nil
}

func optionalPositiveQueryId(c *gin.Context, key string) (int, error) {
	raw := strings.TrimSpace(c.Query(key))
	if raw == "" {
		return 0, nil
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("%s must be a positive integer", key)
	}
	return parsed, nil
}

func AdminAssignUserToSalesPriceBook(c *gin.Context) {
	var input model.UserPriceBookAssignment
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.AssignUserToSalesPriceBook(&input, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, &input)
}

func AdminCancelUserPriceBookAssignment(c *gin.Context) {
	assignmentId, ok := positivePathId(c)
	if !ok {
		return
	}
	if err := pricingadmin.CancelUserPriceBookAssignment(assignmentId, c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}

func AdminGetDefaultSalesPriceBook(c *gin.Context) {
	defaultKey := c.DefaultQuery("default_key", "toc_default")
	value, err := pricingadmin.GetDefaultSalesPriceBook(defaultKey)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, value)
}

func AdminSetDefaultSalesPriceBook(c *gin.Context) {
	var input struct {
		DefaultKey  string `json:"default_key"`
		PriceBookId int    `json:"price_book_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := pricingadmin.SetDefaultSalesPriceBook(
		input.DefaultKey,
		input.PriceBookId,
		c.GetInt("id"),
	); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
