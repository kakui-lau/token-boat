/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/

import { useMutation, useQuery } from '@tanstack/react-query'
import { useDeferredValue, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { getPricingCatalogOptions } from '@/features/pricing-admin/api'
import {
  EMPTY_CHANNEL_MODEL_FILTERS,
  type ChannelModelFilterValues,
} from '@/features/pricing-admin/lib/channel-model-filters'
import { percentageToStoredRate } from '@/features/pricing-admin/lib/rate-format'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { downloadCSV } from '@/lib/download-csv'
import { handleServerError } from '@/lib/handle-server-error'
import { useAuthStore } from '@/stores/auth-store'

import {
  exportGeneratedSalesPrices,
  generateSalesPrices,
  getSupportedChannelModels,
} from './api'
import { GeneratedPriceTable } from './components/generated-price-table'
import { RateForm } from './components/rate-form'
import { SupportedChannelModelTable } from './components/supported-channel-model-table'
import {
  parseEffectiveRateDetails,
  type ParsedRateDetails,
} from './lib/parse-effective-rate-details'
import { calculateVariableCostPercentage } from './lib/variable-cost-rate'
import type {
  RowRateValues,
  SalesPriceGenerationInput,
  SalesPriceGenerationResponse,
  SalesPriceGeneratorFilterParams,
  SupportedChannelModel,
} from './types'

const emptySupportedChannelModels: SupportedChannelModel[] = []

const defaultRowRates: RowRateValues = {
  payment_processing_fee_rate: '4',
  distribution_fee_rate: '5',
  operations_labor_cost_rate: '2',
  effective_tax_rate: '16',
  target_net_margin: '3',
}

export function SalesPriceGenerator() {
  const { t } = useTranslation()
  const currentUser = useAuthStore((state) => state.auth.user)
  const canExport = hasPermission(
    currentUser,
    ADMIN_PERMISSION_RESOURCES.PRICING,
    ADMIN_PERMISSION_ACTIONS.EXPORT
  )
  const [filters, setFilters] = useState<ChannelModelFilterValues>({
    ...EMPTY_CHANNEL_MODEL_FILTERS,
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(200)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const deferredKeyword = useDeferredValue(filters.keyword)
  const filterParams: SalesPriceGeneratorFilterParams = {
    keyword: deferredKeyword.trim() || undefined,
    channel_id: filters.channelId ? Number(filters.channelId) : undefined,
    status: filters.status ? Number(filters.status) : undefined,
    routing_status:
      filters.routingStatus === 'available' ||
      filters.routingStatus === 'removed'
        ? filters.routingStatus
        : undefined,
    runtime_mode:
      filters.runtimeMode === 'legacy' || filters.runtimeMode === 'v2'
        ? filters.runtimeMode
        : undefined,
    retail_status:
      filters.retailStatus === 'published' ||
      filters.retailStatus === 'unpublished'
        ? filters.retailStatus
        : undefined,
  }
  const catalogQuery = useQuery({
    queryKey: ['sales-price-generator', 'catalog-options'],
    queryFn: () => getPricingCatalogOptions(),
  })
  const supportedQuery = useQuery({
    queryKey: [
      'sales-price-generator',
      'channel-models',
      deferredKeyword,
      filters.channelId,
      filters.status,
      filters.routingStatus,
      filters.runtimeMode,
      filters.retailStatus,
      page,
      pageSize,
    ],
    queryFn: () =>
      getSupportedChannelModels({
        ...filterParams,
        page,
        page_size: pageSize,
      }),
  })
  const generationMutation = useMutation({
    mutationFn: (input: SalesPriceGenerationInput) =>
      generateSalesPrices(input, filterParams),
    onSuccess: (response) => {
      setGenerationResult(response.data)
      // Seed per-row editable rates with the form values used for this
      // generation so the table inputs start in sync with the result.
      const base = pendingFormRatesRef.current ?? defaultRowRates
      const nextRates: Record<number, RowRateValues> = {}
      for (const item of response.data.items) {
        nextRates[item.model_id] = { ...base }
      }
      setRowRates(nextRates)
    },
    onError: handleServerError,
  })
  const exportMutation = useMutation({
    mutationFn: (input: SalesPriceGenerationInput) =>
      exportGeneratedSalesPrices(input, filterParams),
    onSuccess: (blob) => downloadCSV(blob, 'generated-sales-prices'),
    onError: handleServerError,
  })

  const [generationResult, setGenerationResult] =
    useState<SalesPriceGenerationResponse['data']>()
  const [regeneratingRowIds, setRegeneratingRowIds] = useState<Set<number>>(
    new Set()
  )
  // Per-row editable rate values (percentages). Kept in sync with the table
  // inputs so exports always use the latest edited values.
  const [rowRates, setRowRates] = useState<Record<number, RowRateValues>>({})
  const pendingFormRatesRef = useRef<RowRateValues>(defaultRowRates)
  const supportedItems =
    supportedQuery.data?.data.items ?? emptySupportedChannelModels

  const handleRowRegenerate = async (
    modelId: number,
    rates: ParsedRateDetails
  ) => {
    const row = generationResult?.items.find((r) => r.model_id === modelId)
    if (!row) return
    const channelModelIds = row.channels.map((c) => c.channel_model_id)

    setRegeneratingRowIds((prev) => new Set(prev).add(modelId))

    try {
      const response = await generateSalesPrices(
        {
          total_variable_cost_rate: percentageToStoredRate(rates.vcr),
          effective_tax_rate: percentageToStoredRate(rates.tr),
          target_net_margin: percentageToStoredRate(rates.tm),
          channel_model_ids: channelModelIds,
        },
        filterParams
      )
      const newRow = response.data.items[0]
      if (newRow) {
        setGenerationResult((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            items: prev.items.map((r) => (r.model_id === modelId ? newRow : r)),
            maximum_channel_count: Math.max(
              prev.maximum_channel_count,
              response.data.maximum_channel_count
            ),
          }
        })
      }
    } catch (error) {
      handleServerError(error)
    } finally {
      setRegeneratingRowIds((prev) => {
        const next = new Set(prev)
        next.delete(modelId)
        return next
      })
    }
  }

  const handleExport = () => {
    if (!generationResult) return
    // Use the latest edited rates (from live inputs) so exports match what
    // the user currently sees, even if the debounced regeneration hasn't
    // round-tripped yet. The VCR is combined from the three components.
    const modelRates = generationResult.items
      .map((item) => {
        const row = rowRates[item.model_id]
        if (row) {
          const vcr = calculateVariableCostPercentage([
            row.payment_processing_fee_rate,
            row.distribution_fee_rate,
            row.operations_labor_cost_rate,
          ])
          return {
            model_id: item.model_id,
            total_variable_cost_rate: percentageToStoredRate(vcr),
            effective_tax_rate: percentageToStoredRate(row.effective_tax_rate),
            target_net_margin: percentageToStoredRate(row.target_net_margin),
            // Pass the three VCR components so the exported CSV can split
            // them into separate columns matching what the page shows.
            payment_processing_fee_rate: row.payment_processing_fee_rate,
            distribution_fee_rate: row.distribution_fee_rate,
            operations_labor_cost_rate: row.operations_labor_cost_rate,
          }
        }
        const rates = parseEffectiveRateDetails(item.effective_rate_details)
        return {
          model_id: item.model_id,
          total_variable_cost_rate: percentageToStoredRate(rates.vcr),
          effective_tax_rate: percentageToStoredRate(rates.tr),
          target_net_margin: percentageToStoredRate(rates.tm),
        }
      })
      .filter(
        (rate) =>
          rate.total_variable_cost_rate !== '' &&
          rate.effective_tax_rate !== '' &&
          rate.target_net_margin !== ''
      )
    exportMutation.mutate({
      ...generationResult.rates,
      model_rates: modelRates.length > 0 ? modelRates : undefined,
    })
  }

  return (
    <SectionPageLayout fixedContent>
      <SectionPageLayout.Title>
        {t('Sales Price Generator')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div
          data-testid='sales-price-generator-scroll'
          className='flex h-full min-h-0 flex-col gap-5 overflow-y-auto overscroll-contain'
        >
          <RateForm
            hasSelectedModels={selectedIds.size > 0}
            isGenerating={generationMutation.isPending}
            onGenerate={(
              input: SalesPriceGenerationInput,
              formRates: RowRateValues
            ) => {
              if (selectedIds.size === 0) return
              pendingFormRatesRef.current = formRates
              generationMutation.mutate({
                ...input,
                channel_model_ids: [...selectedIds].sort(
                  (left, right) => left - right
                ),
              })
            }}
          />
          <SupportedChannelModelTable
            items={supportedItems}
            filters={filters}
            channels={catalogQuery.data?.data.channels ?? []}
            selectedIds={selectedIds}
            total={supportedQuery.data?.data.total ?? 0}
            page={page}
            pageSize={pageSize}
            isLoading={supportedQuery.isLoading}
            isFetching={supportedQuery.isFetching}
            isError={supportedQuery.isError}
            onRetry={() => void supportedQuery.refetch()}
            onFiltersChange={(nextFilters) => {
              setFilters(nextFilters)
              setPage(1)
              setSelectedIds(new Set())
              setGenerationResult(undefined)
              setRowRates({})
            }}
            onSelectionChange={(nextSelectedIds) => {
              setSelectedIds(nextSelectedIds)
              setGenerationResult(undefined)
              setRowRates({})
            }}
            onPageChange={setPage}
            onPageSizeChange={(nextPageSize) => {
              setPageSize(nextPageSize)
              setPage(1)
            }}
          />
          <GeneratedPriceTable
            result={generationResult}
            regeneratingRowIds={regeneratingRowIds}
            onRowRegenerate={handleRowRegenerate}
            rates={rowRates}
            onRatesChange={(modelId, next) => {
              setRowRates((prev) => ({ ...prev, [modelId]: next }))
            }}
            canExport={canExport}
            hasGeneratedData={Boolean(generationResult)}
            isExporting={exportMutation.isPending}
            onExport={handleExport}
          />
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
