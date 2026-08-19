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

import { Calculator } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import {
  parseEffectiveRateDetails,
  type ParsedRateDetails,
} from '../lib/parse-effective-rate-details'
import type {
  GeneratedSalesPriceRow,
  SalesPriceGenerationResponse,
} from '../types'

type GeneratedPriceTableProps = {
  result?: SalesPriceGenerationResponse['data']
  regeneratingRowIds?: Set<number>
  onRowRegenerate?: (modelId: number, rates: ParsedRateDetails) => void
}

function channelLabel(index: number): string {
  let label = ''
  for (
    let remaining = index;
    remaining >= 0;
    remaining = Math.floor(remaining / 26) - 1
  ) {
    label = String.fromCharCode(65 + (remaining % 26)) + label
  }
  return label
}

function EditableRateCells({
  row,
  regeneratingRowIds,
  onRowRegenerate,
}: {
  row: GeneratedSalesPriceRow
  regeneratingRowIds: Set<number>
  onRowRegenerate?: (modelId: number, rates: ParsedRateDetails) => void
}) {
  const { t } = useTranslation()
  const isRegenerating = regeneratingRowIds.has(row.model_id)
  const [vcr, setVcr] = useState(() =>
    parseEffectiveRateDetails(row.effective_rate_details)
  )
  // Keep a ref so the debounce effect doesn't fire when the callback identity changes
  const onRowRegenerateRef = useRef(onRowRegenerate)
  onRowRegenerateRef.current = onRowRegenerate

  // Sync local values when the row's effective_rate_details changes
  // (e.g. after initial generation or a row regeneration round-trip)
  useEffect(() => {
    setVcr(parseEffectiveRateDetails(row.effective_rate_details))
  }, [row.effective_rate_details])

  // Debounce: when the user edits a rate, wait 500ms then trigger regeneration
  useEffect(() => {
    const current = parseEffectiveRateDetails(row.effective_rate_details)
    if (
      vcr.vcr === current.vcr &&
      vcr.tr === current.tr &&
      vcr.tm === current.tm
    ) {
      return // nothing changed — skip
    }
    if (!vcr.vcr || !vcr.tr || !vcr.tm) {
      return // don't regenerate with empty fields
    }

    const timer = setTimeout(() => {
      onRowRegenerateRef.current?.(row.model_id, vcr)
    }, 500)

    return () => clearTimeout(timer)
  }, [vcr, row.effective_rate_details, row.model_id])

  return (
    <>
      <TableCell>
        {isRegenerating ? (
          <Spinner data-testid={`vcr-spinner-${row.model_id}`} />
        ) : (
          <InputGroup className='w-20'>
            <InputGroupInput
              type='number'
              value={vcr.vcr}
              onChange={(e) =>
                setVcr((prev) => ({ ...prev, vcr: e.target.value }))
              }
              aria-label={t('VCR')}
            />
            <InputGroupAddon align='inline-end'>%</InputGroupAddon>
          </InputGroup>
        )}
      </TableCell>
      <TableCell>
        {isRegenerating ? (
          <Spinner data-testid={`tr-spinner-${row.model_id}`} />
        ) : (
          <InputGroup className='w-20'>
            <InputGroupInput
              type='number'
              value={vcr.tr}
              onChange={(e) =>
                setVcr((prev) => ({ ...prev, tr: e.target.value }))
              }
              aria-label={t('TR')}
            />
            <InputGroupAddon align='inline-end'>%</InputGroupAddon>
          </InputGroup>
        )}
      </TableCell>
      <TableCell>
        {isRegenerating ? (
          <Spinner data-testid={`tm-spinner-${row.model_id}`} />
        ) : (
          <InputGroup className='w-20'>
            <InputGroupInput
              type='number'
              value={vcr.tm}
              onChange={(e) =>
                setVcr((prev) => ({ ...prev, tm: e.target.value }))
              }
              aria-label={t('TM')}
            />
            <InputGroupAddon align='inline-end'>%</InputGroupAddon>
          </InputGroup>
        )}
      </TableCell>
    </>
  )
}

export function GeneratedPriceTable(props: GeneratedPriceTableProps) {
  const { t } = useTranslation()
  const maximumChannelCount = props.result?.maximum_channel_count ?? 0
  const regeneratingRowIds = props.regeneratingRowIds ?? new Set<number>()

  return (
    <Card className='shrink-0'>
      <CardHeader>
        <CardTitle>{t('Generated sales price table')}</CardTitle>
        <CardDescription>
          {t(
            'Each model occupies one row, with channel columns added dynamically.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!props.result ? (
          <Empty className='min-h-44'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Calculator />
              </EmptyMedia>
              <EmptyTitle>{t('No generated sales prices')}</EmptyTitle>
              <EmptyDescription>
                {t('Set the rates and click Generate sales prices.')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {props.result && props.result.items.length === 0 ? (
          <Empty className='min-h-44'>
            <EmptyHeader>
              <EmptyMedia variant='icon'>
                <Calculator />
              </EmptyMedia>
              <EmptyTitle>{t('No generated sales prices')}</EmptyTitle>
              <EmptyDescription>
                {t('No supported channel models are available for generation.')}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        {props.result && props.result.items.length > 0 ? (
          <div
            data-testid='generated-price-scroll'
            className='rounded-lg border'
          >
            <Table className='min-w-max'>
              <TableHeader className='bg-card sticky top-0 z-10'>
                <TableRow>
                  <TableHead>{t('Model Name')}</TableHead>
                  <TableHead>{t('VCR')}</TableHead>
                  <TableHead>{t('TR')}</TableHead>
                  <TableHead>{t('TM')}</TableHead>
                  <TableHead>{t('Minimum sales discount')}</TableHead>
                  <TableHead>{t('Minimum purchase discount')}</TableHead>
                  {Array.from({ length: maximumChannelCount }, (_, index) => {
                    const label = channelLabel(index)
                    return [
                      <TableHead key={`${label}-name`}>
                        {t('Channel {{label}} name', { label })}
                      </TableHead>,
                      <TableHead key={`${label}-purchase`}>
                        {t('Channel {{label}} purchase discount', { label })}
                      </TableHead>,
                      <TableHead key={`${label}-sales`}>
                        {t('Channel {{label}} sales discount', { label })}
                      </TableHead>,
                    ]
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.result.items.map((item) => (
                  <TableRow key={item.model_id}>
                    <TableCell className='font-medium'>
                      {item.model_name}
                    </TableCell>
                    <EditableRateCells
                      row={item}
                      regeneratingRowIds={regeneratingRowIds}
                      onRowRegenerate={props.onRowRegenerate}
                    />
                    <TableCell>{item.minimum_retail_discount || '—'}</TableCell>
                    <TableCell>
                      {item.minimum_purchase_discount || '—'}
                    </TableCell>
                    {Array.from({ length: maximumChannelCount }, (_, index) => {
                      const channel = item.channels[index]
                      const label = channelLabel(index)
                      return [
                        <TableCell key={`${label}-name`}>
                          {channel?.channel_name || '—'}
                        </TableCell>,
                        <TableCell key={`${label}-purchase`}>
                          {channel?.purchase_discount || '—'}
                        </TableCell>,
                        <TableCell key={`${label}-sales`}>
                          {channel?.retail_discount || '—'}
                        </TableCell>,
                      ]
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
