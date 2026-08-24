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
