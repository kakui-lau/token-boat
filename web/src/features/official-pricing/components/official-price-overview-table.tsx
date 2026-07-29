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
import dayjs from 'dayjs'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { OfficialPriceOverview } from '@/features/pricing-admin/types'

type OfficialPriceOverviewTableProps = {
  allRows: OfficialPriceOverview[]
  rows: OfficialPriceOverview[]
  isLoading: boolean
  isDeleting: boolean
  isPublishing: boolean
  onManage: (modelId: number) => void
  onDeleteDraft: (draftId: number) => void
  onPublishDraft: (draftId: number) => void
}

function displayPrice(value: string): string {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return value
  return new Intl.NumberFormat('en-US', {
    useGrouping: false,
    maximumFractionDigits: 12,
  }).format(numericValue)
}

function PriceValue(props: { currency: string; value: string; unit?: string }) {
  if (!props.value) {
    return <span className='text-muted-foreground'>—</span>
  }
  return (
    <div className='tabular-nums'>
      <span className='font-medium'>
        {props.currency} {displayPrice(props.value)}
      </span>
      {props.unit ? (
        <span className='text-muted-foreground ml-1 text-xs'>
          / {props.unit}
        </span>
      ) : null}
    </div>
  )
}

export function OfficialPriceOverviewTable(
  props: OfficialPriceOverviewTableProps
) {
  const { t } = useTranslation()
  const [deleteDraftId, setDeleteDraftId] = useState<number | null>(null)
  let pricedCount = 0
  let activeCount = 0
  let draftCount = 0
  for (const row of props.allRows) {
    if (row.version_count > 0) {
      pricedCount++
    }
    if (row.status === 'active') {
      activeCount++
    }
    draftCount += row.draft_count
  }
  const stats = [
    { label: t('Total models'), value: props.allRows.length },
    { label: t('Priced Models'), value: pricedCount },
    { label: t('Active Prices'), value: activeCount },
    { label: t('Drafts'), value: draftCount },
  ]

  return (
    <div className='space-y-4'>
      <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-4'>
        {stats.map((stat) => (
          <Card key={stat.label} size='sm'>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className='text-2xl tabular-nums'>
                {stat.value}
              </CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card className='gap-0 py-0'>
        <CardHeader className='border-b py-4'>
          <CardTitle>{t('Catalog Coverage')}</CardTitle>
          <CardDescription>
            {t(
              'Review active prices, pending drafts, billing modes, and multimodal price components.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className='overflow-x-auto p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className='min-w-56'>{t('Model')}</TableHead>
                <TableHead>{t('Status')}</TableHead>
                <TableHead>{t('Billing')}</TableHead>
                <TableHead className='min-w-40'>{t('Input price')}</TableHead>
                <TableHead className='min-w-40'>{t('Output price')}</TableHead>
                <TableHead className='min-w-64'>
                  {t('Additional Components')}
                </TableHead>
                <TableHead className='min-w-36'>{t('Version')}</TableHead>
                <TableHead className='text-right'>{t('Actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {props.isLoading
                ? Array.from({ length: 5 }, (_, index) => (
                    <TableRow key={index}>
                      <TableCell colSpan={8}>
                        <Skeleton className='h-8 w-full' />
                      </TableCell>
                    </TableRow>
                  ))
                : null}
              {!props.isLoading
                ? props.rows.map((row) => {
                    let billingLabel = t('Not configured')
                    if (row.billing_mode === 'token') {
                      billingLabel = t('Token')
                    } else if (row.billing_mode === 'request') {
                      billingLabel = t('Per request')
                    } else if (row.billing_mode === 'image') {
                      billingLabel = t('Image')
                    } else if (row.billing_mode === 'audio_duration') {
                      billingLabel = t('Audio duration')
                    } else if (row.billing_mode === 'video_duration') {
                      billingLabel = t('Video duration')
                    } else if (row.billing_mode === 'character') {
                      billingLabel = t('Character')
                    } else if (row.billing_mode === 'mixed') {
                      billingLabel = t('Mixed')
                    }
                    let structureLabel = '—'
                    if (row.price_structure === 'flat') {
                      structureLabel = t('Flat rate')
                    } else if (row.price_structure === 'tiered') {
                      structureLabel = t('Tiered pricing')
                    } else if (row.price_structure === 'expression') {
                      structureLabel = t('Expression pricing')
                    }
                    let statusLabel = t('Not configured')
                    let statusVariant: 'default' | 'warning' | 'outline' =
                      'outline'
                    if (row.status === 'active') {
                      statusLabel = t('active')
                      statusVariant = 'default'
                    } else if (row.status === 'draft') {
                      statusLabel = t('draft')
                      statusVariant = 'warning'
                    } else if (row.status === 'suspended') {
                      statusLabel = t('suspended')
                    } else if (row.status === 'expired') {
                      statusLabel = t('expired')
                    }
                    return (
                      <TableRow key={row.model_id}>
                        <TableCell>
                          <div className='min-w-0'>
                            <p className='max-w-72 truncate font-medium'>
                              {row.model_name}
                            </p>
                            <p className='text-muted-foreground text-xs'>
                              ID {row.model_id}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className='flex flex-col items-start gap-1.5'>
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                            {row.draft_count > 0 ? (
                              <span className='text-muted-foreground text-xs'>
                                {t('{{count}} pending drafts', {
                                  count: row.draft_count,
                                })}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <p className='font-medium'>{billingLabel}</p>
                          <p className='text-muted-foreground text-xs'>
                            {structureLabel}
                          </p>
                        </TableCell>
                        <TableCell>
                          <PriceValue
                            currency={row.currency}
                            value={row.input_unit_price}
                            unit={t('1M tokens')}
                          />
                        </TableCell>
                        <TableCell>
                          <PriceValue
                            currency={row.currency}
                            value={row.output_unit_price}
                            unit={t('1M tokens')}
                          />
                        </TableCell>
                        <TableCell>
                          <div className='grid grid-cols-2 gap-x-4 gap-y-1 text-xs'>
                            {row.cache_read_unit_price ? (
                              <span>
                                <span className='text-muted-foreground'>
                                  {t('Cache Read')}:{' '}
                                </span>
                                {row.currency}{' '}
                                {displayPrice(row.cache_read_unit_price)}
                              </span>
                            ) : null}
                            {row.cache_write_unit_price ? (
                              <span>
                                <span className='text-muted-foreground'>
                                  {t('Cache Write')}:{' '}
                                </span>
                                {row.currency}{' '}
                                {displayPrice(row.cache_write_unit_price)}
                              </span>
                            ) : null}
                            {row.image_input_unit_price ||
                            row.image_output_unit_price ? (
                              <span>
                                <span className='text-muted-foreground'>
                                  {t('Image')}:{' '}
                                </span>
                                {row.currency}{' '}
                                {displayPrice(
                                  row.image_input_unit_price ||
                                    row.image_output_unit_price
                                )}
                              </span>
                            ) : null}
                            {row.audio_input_unit_price ||
                            row.audio_output_unit_price ? (
                              <span>
                                <span className='text-muted-foreground'>
                                  {t('Audio')}:{' '}
                                </span>
                                {row.currency}{' '}
                                {displayPrice(
                                  row.audio_input_unit_price ||
                                    row.audio_output_unit_price
                                )}
                              </span>
                            ) : null}
                            {row.request_unit_price ? (
                              <span>
                                <span className='text-muted-foreground'>
                                  {t('Request')}:{' '}
                                </span>
                                {row.currency}{' '}
                                {displayPrice(row.request_unit_price)}
                              </span>
                            ) : null}
                            {row.video_second_unit_price ? (
                              <span>
                                <span className='text-muted-foreground'>
                                  {t('Video')}:{' '}
                                </span>
                                {row.currency}{' '}
                                {displayPrice(row.video_second_unit_price)}
                              </span>
                            ) : null}
                            {!row.cache_read_unit_price &&
                            !row.cache_write_unit_price &&
                            !row.image_input_unit_price &&
                            !row.image_output_unit_price &&
                            !row.audio_input_unit_price &&
                            !row.audio_output_unit_price &&
                            !row.request_unit_price &&
                            !row.video_second_unit_price ? (
                              <span className='text-muted-foreground'>—</span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {row.version > 0 ? (
                            <>
                              <p className='font-medium'>
                                v{row.version}{' '}
                                <span className='text-muted-foreground font-normal'>
                                  / {row.version_count}
                                </span>
                              </p>
                              <p className='text-muted-foreground text-xs'>
                                {row.effective_from > 0
                                  ? dayjs
                                      .unix(row.effective_from)
                                      .format('YYYY-MM-DD HH:mm')
                                  : t('Not effective')}
                              </p>
                            </>
                          ) : (
                            <span className='text-muted-foreground'>—</span>
                          )}
                        </TableCell>
                        <TableCell className='text-right'>
                          <div className='flex justify-end gap-2'>
                            {row.latest_draft_id > 0 ? (
                              <>
                                <Button
                                  size='sm'
                                  disabled={props.isPublishing}
                                  onClick={() =>
                                    props.onPublishDraft(row.latest_draft_id)
                                  }
                                >
                                  {t('Publish')}
                                </Button>
                                <Button
                                  size='sm'
                                  variant='destructive'
                                  disabled={props.isDeleting}
                                  onClick={() =>
                                    setDeleteDraftId(row.latest_draft_id)
                                  }
                                >
                                  {t('Delete')}
                                </Button>
                              </>
                            ) : null}
                            <Button
                              size='sm'
                              variant={
                                row.status === 'unconfigured'
                                  ? 'default'
                                  : 'outline'
                              }
                              onClick={() => props.onManage(row.model_id)}
                            >
                              {t('Versions')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })
                : null}
              {!props.isLoading && props.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className='h-32 text-center'>
                    <p className='font-medium'>{t('No models found')}</p>
                    <p className='text-muted-foreground mt-1 text-sm'>
                      {t('Try another model name or clear the search filter.')}
                    </p>
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleteDraftId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteDraftId(null)
          }
        }}
        title={t('Delete price draft?')}
        desc={t(
          'This draft will be permanently deleted. Published price history is never deleted.'
        )}
        confirmText={t('Delete Draft')}
        destructive
        isLoading={props.isDeleting}
        handleConfirm={() => {
          if (deleteDraftId !== null) {
            props.onDeleteDraft(deleteDraftId)
          }
          setDeleteDraftId(null)
        }}
      />
    </div>
  )
}
