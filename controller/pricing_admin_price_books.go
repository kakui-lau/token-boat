package controller

import (
	"errors"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service/pricingadmin"
	"github.com/gin-gonic/gin"
)

func AdminListSalesPriceBooks(c *gin.Context) {
	books, err := pricingadmin.ListSalesPriceBooks()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, books)
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
	userId := 0
	if raw := c.Query("user_id"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			common.ApiError(c, errors.New("user_id must be a positive integer"))
			return
		}
		userId = parsed
	}
	assignments, err := pricingadmin.ListUserPriceBookAssignments(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, assignments)
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
