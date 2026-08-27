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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type {
  SalesPriceBookVersion,
  SalesPriceBookVersionStatus,
} from '../types'
import {
  PriceBookSelectionAction,
  SelectablePriceBookRow,
} from './price-book-selection'
import { TableRecordCount } from './table-record-count'

type PriceBookVersionTableProps = {
  versions: SalesPriceBookVersion[]
  currentVersionId?: number
  selectedVersionId?: number
  isPublishing: boolean
  isCloning: boolean
  canWrite?: boolean
  canPublish?: boolean
  onSelect: (versionId: number) => void
  onGenerate: (versionId: number) => void
  onEditPolicy?: (version: SalesPriceBookVersion) => void
  onPublish: (versionId: number) => void
  onDeleteDraft: (versionId: number) => void
  onClone: (versionId: number) => void
}

function statusLabel(
  status: SalesPriceBookVersionStatus,
  t: (key: string) => string
) {
  switch (status) {
    case 'draft':
      return t('Draft')
    case 'active':
      return t('Active')
    case 'scheduled':
      return t('Scheduled')
    case 'superseded':
      return t('Superseded')
    case 'cancelled':
      return t('Cancelled')
  }
}

function percentage(value: string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? `${parsed * 100}%` : '—'
}

function costBasisLabel(strategy: string, t: (key: string) => string) {
  if (strategy === 'max_eligible_cost') {
    return t('Highest eligible purchase cost')
  }
  if (strategy === 'min_eligible_cost') {
    return t('Minimum eligible purchase cost')
  }
  if (strategy === 'designated_channel') {
    return t('Designated channel')
  }
  return strategy
}

function PriceBookVersionRows(
  props: PriceBookVersionTableProps & {
    rows: SalesPriceBookVersion[]
  }
) {
  const { t } = useTranslation()
  const canWrite = props.canWrite ?? true
  const canPublish = props.canPublish ?? true

  return props.rows.map((version) => {
    const isCurrent = props.currentVersionId === version.id
    const isSelected = props.selectedVersionId === version.id
    const selectVersion = () => {
      if (isSelected) {
        return
      }
      props.onSelect(version.id)
    }
    let versionActions = null
    if (version.status === 'draft') {
      versionActions = (
        <>
          {canWrite ? (
            <>
              <Button
                size='sm'
                variant='outline'
                onClick={() => props.onEditPolicy?.(version)}
              >
                {t('Edit pricing parameters')}
              </Button>
              <Button
                size='sm'
                variant='outline'
                onClick={() => props.onGenerate(version.id)}
              >
                {t('Generate prices')}
              </Button>
              <Button
                size='sm'
                variant='destructive'
                onClick={() => props.onDeleteDraft(version.id)}
              >
                {t('Delete draft')}
              </Button>
            </>
          ) : null}
          {canPublish ? (
            <Button
              size='sm'
              disabled={props.isPublishing}
              onClick={() => props.onPublish(version.id)}
            >
              {t('Publish')}
            </Button>
          ) : null}
        </>
      )
    } else if (canWrite) {
      versionActions = (
        <Button
          size='sm'
          variant='outline'
          disabled={props.isCloning}
          onClick={() => props.onClone(version.id)}
        >
          {t('Restore as new draft')}
        </Button>
      )
    }

    return (
      <SelectablePriceBookRow
        key={version.id}
        selected={isSelected}
        onSelect={selectVersion}
      >
        <TableCell className='bg-card sticky left-0 z-10'>
          <div className='flex flex-wrap items-center gap-2'>
            <span className='font-semibold'>v{version.version}</span>
            {isCurrent ? <Badge>{t('Currently billed')}</Badge> : null}
          </div>
        </TableCell>
        <TableCell>
          <Badge variant={version.status === 'active' ? 'default' : 'outline'}>
            {statusLabel(version.status, t)}
          </Badge>
        </TableCell>
        <TableCell>{costBasisLabel(version.cost_basis_strategy, t)}</TableCell>
        <TableCell>
          <div className='flex flex-col gap-1 text-sm'>
            <span>
              {t('Variable costs')}{' '}
              {percentage(version.total_variable_cost_rate)}
            </span>
            <span className='text-muted-foreground'>
              {t('Tax {{tax}} · Target margin {{margin}}', {
                tax: percentage(version.effective_tax_rate),
                margin: percentage(version.target_net_margin),
              })}
            </span>
          </div>
        </TableCell>
        <TableCell>
          <div className='flex flex-wrap gap-2'>
            <PriceBookSelectionAction
              selected={isSelected}
              onSelect={selectVersion}
            />
            {versionActions}
          </div>
        </TableCell>
      </SelectablePriceBookRow>
    )
  })
}

export function PriceBookVersionTable(props: PriceBookVersionTableProps) {
  const { t } = useTranslation()
  const [historyOpen, setHistoryOpen] = useState(false)
  const currentVersions = props.versions.filter(
    (version) =>
      version.status !== 'cancelled' && version.status !== 'superseded'
  )
  const historicalVersions = props.versions.filter(
    (version) =>
      version.status === 'cancelled' || version.status === 'superseded'
  )
  const orderedCurrentVersions = [...currentVersions].sort((left, right) => {
    if (left.id === props.currentVersionId) return -1
    if (right.id === props.currentVersionId) return 1
    return right.version - left.version
  })

  return (
    <div className='flex flex-col gap-3'>
      <Table className='min-w-[58rem]'>
        <TableHeader>
          <TableRow>
            <TableHead className='bg-card sticky left-0 z-10'>
              {t('Version')}
            </TableHead>
            <TableHead>{t('Status')}</TableHead>
            <TableHead>{t('Cost basis')}</TableHead>
            <TableHead>{t('Pricing parameters')}</TableHead>
            <TableHead>{t('Actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <PriceBookVersionRows {...props} rows={orderedCurrentVersions} />
        </TableBody>
      </Table>
      <TableRecordCount total={orderedCurrentVersions.length} />
      {historicalVersions.length > 0 ? (
        <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
          <CollapsibleTrigger
            render={<Button variant='ghost' className='w-full' />}
          >
            {historyOpen
              ? t('Hide historical versions')
              : t('Show {{count}} historical versions', {
                  count: historicalVersions.length,
                })}
          </CollapsibleTrigger>
          <CollapsibleContent className='mt-3'>
            <Table className='min-w-[58rem]'>
              <TableHeader>
                <TableRow>
                  <TableHead className='bg-card sticky left-0 z-10'>
                    {t('Version')}
                  </TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead>{t('Cost basis')}</TableHead>
                  <TableHead>{t('Pricing parameters')}</TableHead>
                  <TableHead>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <PriceBookVersionRows {...props} rows={historicalVersions} />
              </TableBody>
            </Table>
            <div className='mt-3'>
              <TableRecordCount total={historicalVersions.length} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </div>
  )
}
