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
import type { ColumnDef } from '@tanstack/react-table'
import { Music } from 'lucide-react'
/* eslint-disable react-refresh/only-export-components */
import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { StatusBadge } from '@/components/status-badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatLogQuota, formatTimestampToDate } from '@/lib/format'
import { cn } from '@/lib/utils'

import { TASK_ACTIONS, TASK_STATUS } from '../../constants'
import { taskActionMapper, taskStatusMapper } from '../../lib/mappers'
import type { TaskLog, TaskUpstreamRequest } from '../../types'
import {
  AudioPreviewDialog,
  type AudioClip,
} from '../dialogs/audio-preview-dialog'
import { FailReasonDialog } from '../dialogs/fail-reason-dialog'
import { UpstreamRequestDialog } from '../dialogs/upstream-request-dialog'
import { TaskFailRefundAction } from '../task-fail-refund-action'
import { useUsageLogsContext } from '../usage-logs-provider'
import {
  createDurationColumn,
  createChannelColumn,
  createProgressColumn,
} from './column-helpers'

type BillingDisplayState = {
  audit: string
  auditVariant: 'danger' | 'success' | 'warning'
  notApplicable: boolean
  settlement: string
}

export function getTaskBillingDisplayState(log: TaskLog): BillingDisplayState {
  const billing = log.admin_billing
  if (!billing) {
    return {
      audit: '',
      auditVariant: 'warning',
      notApplicable: true,
      settlement: '',
    }
  }

  const notApplicable =
    billing.quota === 0 &&
    !billing.settlement_status &&
    !billing.billing_audit_status
  if (notApplicable) {
    return {
      audit: '',
      auditVariant: 'success',
      notApplicable: true,
      settlement: '',
    }
  }

  const audit = billing.billing_audit_status || 'pending'
  const hasIssue = Boolean(
    billing.settlement_error || billing.billing_audit_error
  )
  let auditVariant: BillingDisplayState['auditVariant'] = 'warning'
  if (hasIssue) auditVariant = 'danger'
  else if (audit === 'completed') auditVariant = 'success'

  return {
    audit,
    auditVariant,
    notApplicable: false,
    settlement: billing.settlement_status || 'pending',
  }
}

function parseTaskData(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function AudioPreviewCell({ log }: { log: TaskLog }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const clips = useMemo(() => {
    const data = parseTaskData(log.data)
    return data.filter(
      (c) =>
        c && typeof c === 'object' && (c as Record<string, unknown>).audio_url
    )
  }, [log.data])

  if (clips.length === 0) return null

  return (
    <>
      <button
        type='button'
        className='group flex items-center gap-1 text-left text-xs'
        onClick={() => setOpen(true)}
      >
        <Music className='text-muted-foreground size-3' />
        <span className='text-foreground leading-snug group-hover:underline'>
          {t('Click to preview audio')}
        </span>
      </button>
      <AudioPreviewDialog
        open={open}
        onOpenChange={setOpen}
        clips={clips as AudioClip[]}
      />
    </>
  )
}

function UpstreamRequestControl({ request }: { request: TaskUpstreamRequest }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        type='button'
        variant='link'
        size='xs'
        className='h-auto w-fit p-0 text-[11px]'
        onClick={() => setOpen(true)}
      >
        {t('View upstream request')}
      </Button>
      <UpstreamRequestDialog
        request={request}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

export function useTaskLogsColumns(isAdmin: boolean): ColumnDef<TaskLog>[] {
  const { t } = useTranslation()
  const columns: ColumnDef<TaskLog>[] = [
    {
      accessorKey: 'submit_time',
      header: t('Submit Time'),
      cell: ({ row }) => {
        const log = row.original
        const submitTime = row.getValue('submit_time') as number

        return (
          <div className='flex min-w-0 flex-col gap-0.5'>
            <span className='truncate font-mono text-xs tabular-nums'>
              {formatTimestampToDate(submitTime, 'seconds')}
            </span>
            {log.finish_time ? (
              <span className='text-muted-foreground/60 truncate font-mono text-[11px] tabular-nums'>
                {formatTimestampToDate(log.finish_time, 'seconds')}
              </span>
            ) : (
              <span className='text-muted-foreground/50 text-[11px]'>-</span>
            )}
          </div>
        )
      },
      size: 180,
    },
  ]

  if (isAdmin) {
    columns.push(
      createChannelColumn<TaskLog>({ headerLabel: t('Channel') }),
      {
        id: 'user',
        header: t('User'),
        accessorFn: (row) => row.username || row.user_id,
        cell: function UserCell({ row }) {
          const { sensitiveVisible, setSelectedUserId, setUserInfoDialogOpen } =
            useUsageLogsContext()
          const log = row.original
          const displayName = log.username || String(log.user_id || '?')

          return (
            <button
              type='button'
              className='flex items-center gap-1.5 text-left'
              onClick={(e) => {
                e.stopPropagation()
                setSelectedUserId(log.user_id)
                setUserInfoDialogOpen(true)
              }}
            >
              <Avatar className='ring-border/60 size-6 ring-1 max-sm:hidden'>
                <AvatarFallback
                  className={cn(
                    'text-[11px] font-semibold',
                    !sensitiveVisible && 'bg-muted text-muted-foreground'
                  )}
                  style={
                    sensitiveVisible
                      ? getUserAvatarStyle(displayName)
                      : undefined
                  }
                >
                  {sensitiveVisible ? getUserAvatarFallback(displayName) : '•'}
                </AvatarFallback>
              </Avatar>
              <span className='text-muted-foreground truncate text-sm hover:underline'>
                {sensitiveVisible ? displayName : '••••'}
              </span>
            </button>
          )
        },
      },
      {
        id: 'model',
        header: t('Model'),
        accessorFn: (row) => row.properties?.origin_model_name || '',
        cell: ({ row }) => {
          const properties = row.original.properties
          const model = properties?.origin_model_name
          const upstreamModel = properties?.upstream_model_name

          return (
            <div className='flex max-w-[220px] flex-col gap-0.5'>
              <span className='truncate font-medium' title={model}>
                {model || '-'}
              </span>
              {upstreamModel && upstreamModel !== model ? (
                <span
                  className='text-muted-foreground truncate font-mono text-[11px]'
                  title={upstreamModel}
                >
                  {t('Upstream Model')}: {upstreamModel}
                </span>
              ) : null}
            </div>
          )
        },
        size: 220,
      },
      {
        id: 'billing',
        header: t('Billing'),
        accessorFn: (row) => row.admin_billing?.quota || 0,
        cell: ({ row }) => {
          const log = row.original
          const billing = log.admin_billing
          if (!billing) return <span className='text-muted-foreground'>-</span>
          const display = getTaskBillingDisplayState(log)

          return (
            <div className='flex min-w-[170px] flex-col gap-1'>
              <div className='flex items-center gap-1.5'>
                <span className='font-mono text-xs font-semibold tabular-nums'>
                  {formatLogQuota(billing.quota)}
                </span>
                {billing.refund_quota ? (
                  <span className='text-muted-foreground text-[11px]'>
                    {t('Refund')} {formatLogQuota(billing.refund_quota)}
                  </span>
                ) : null}
              </div>
              <div className='flex flex-wrap gap-1'>
                {display.notApplicable ? (
                  <StatusBadge
                    label={t('Not applicable')}
                    variant='neutral'
                    size='sm'
                    copyable={false}
                  />
                ) : (
                  <>
                    <StatusBadge
                      label={`${t('Settlement Status')}: ${t(display.settlement === 'completed' ? 'Completed' : 'Pending')}`}
                      variant={
                        display.settlement === 'completed'
                          ? 'success'
                          : 'warning'
                      }
                      size='sm'
                      copyable={false}
                    />
                    <StatusBadge
                      label={`${t('Billing')}: ${t(display.audit === 'completed' ? 'Completed' : 'Pending')}`}
                      variant={display.auditVariant}
                      size='sm'
                      copyable={false}
                    />
                  </>
                )}
              </div>
            </div>
          )
        },
        size: 190,
      }
    )
  }

  columns.push(
    {
      accessorKey: 'task_id',
      header: t('Task ID'),
      cell: ({ row }) => {
        const log = row.original
        const taskId = row.getValue('task_id') as string
        if (!taskId) {
          return <span className='text-muted-foreground/60 text-xs'>-</span>
        }
        return (
          <div className='flex max-w-[170px] flex-col gap-0.5'>
            <StatusBadge
              label={taskId}
              copyText={taskId}
              variant='neutral'
              size='sm'
              className='border-border/60 bg-muted/30 !text-foreground max-w-full truncate rounded-md border px-1.5 py-0.5 font-mono'
            />
            <span className='text-muted-foreground/60 truncate text-[11px]'>
              {t(log.platform)} · {t(taskActionMapper.getLabel(log.action))}
            </span>
          </div>
        )
      },
      meta: { mobileTitle: true },
    },
    createDurationColumn<TaskLog>({
      submitTimeKey: 'submit_time',
      finishTimeKey: 'finish_time',
      unit: 'seconds',
      headerLabel: t('Duration'),
      warningThresholdSec: 300,
    }),
    {
      accessorKey: 'status',
      header: t('Status'),
      cell: ({ row }) => {
        const status = row.getValue('status') as string
        return (
          <StatusBadge
            label={t(taskStatusMapper.getLabel(status, status || 'Submitting'))}
            variant={taskStatusMapper.getVariant(status)}
            size='sm'
            copyable={false}
            className='-ml-1.5'
          />
        )
      },
    },
    createProgressColumn<TaskLog>({ headerLabel: t('Progress') }),
    {
      accessorKey: 'fail_reason',
      header: t('Details'),
      cell: function DetailsCell({ row }) {
        const log = row.original
        const failReason = row.getValue('fail_reason') as string
        const status = log.status
        const [dialogOpen, setDialogOpen] = useState(false)
        const upstreamRequest = isAdmin ? log.admin_upstream_request : undefined

        const isSunoSuccess =
          log.platform === 'suno' && status === TASK_STATUS.SUCCESS
        if (isSunoSuccess) {
          const data = parseTaskData(log.data)
          if (
            data.some(
              (c) =>
                c &&
                typeof c === 'object' &&
                (c as Record<string, unknown>).audio_url
            )
          ) {
            return (
              <div className='flex flex-col gap-1'>
                <AudioPreviewCell log={log} />
                {upstreamRequest ? (
                  <UpstreamRequestControl request={upstreamRequest} />
                ) : null}
              </div>
            )
          }
        }

        const isVideoTask =
          log.action === TASK_ACTIONS.GENERATE ||
          log.action === TASK_ACTIONS.TEXT_GENERATE ||
          log.action === TASK_ACTIONS.FIRST_TAIL_GENERATE ||
          log.action === TASK_ACTIONS.REFERENCE_GENERATE ||
          log.action === TASK_ACTIONS.REMIX_GENERATE
        const isSuccess = status === TASK_STATUS.SUCCESS
        const isUrl = failReason?.startsWith('http')

        if (isSuccess && isVideoTask && isUrl) {
          const videoUrl = `/v1/videos/${log.task_id}/content`
          return (
            <div className='flex flex-col gap-1'>
              <a
                href={videoUrl}
                target='_blank'
                rel='noopener noreferrer'
                className='text-foreground text-xs hover:underline'
              >
                {t('Click to preview video')}
              </a>
              {upstreamRequest ? (
                <UpstreamRequestControl request={upstreamRequest} />
              ) : null}
            </div>
          )
        }

        if (!failReason && !upstreamRequest) {
          return <span className='text-muted-foreground/60 text-xs'>-</span>
        }

        return (
          <div className='flex flex-col gap-1'>
            {failReason ? (
              <>
                <button
                  type='button'
                  className='group flex max-w-[200px] items-center gap-1 text-left text-xs'
                  onClick={() => setDialogOpen(true)}
                  title={t('Click to view full error message')}
                >
                  <span className='text-destructive truncate leading-snug group-hover:underline'>
                    {failReason}
                  </span>
                </button>
                <FailReasonDialog
                  failReason={failReason}
                  open={dialogOpen}
                  onOpenChange={setDialogOpen}
                />
              </>
            ) : null}
            {upstreamRequest ? (
              <UpstreamRequestControl request={upstreamRequest} />
            ) : null}
          </div>
        )
      },
      size: 200,
      maxSize: 220,
    }
  )

  if (isAdmin) {
    columns.push({
      id: 'actions',
      header: t('Actions'),
      cell: ({ row }) => <TaskFailRefundAction log={row.original} />,
      size: 130,
    })
  }

  return columns
}
