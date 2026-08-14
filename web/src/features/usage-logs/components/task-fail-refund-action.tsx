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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { formatLogQuota } from '@/lib/format'

import { manuallyFailAndRefundTask } from '../api'
import { canManuallyFailAndRefund } from '../lib/task-refund'
import type { TaskLog } from '../types'

export function TaskFailRefundAction(props: { log: TaskLog }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const refundAmount = formatLogQuota(props.log.admin_billing?.quota || 0)

  const mutation = useMutation({
    mutationFn: () => manuallyFailAndRefundTask(props.log.task_id),
    onSuccess: async (result) => {
      setOpen(false)
      await queryClient.invalidateQueries({ queryKey: ['logs'] })
      toast.success(
        result.already_refunded
          ? t('Task was already refunded')
          : t('Task marked as failed and {{amount}} refunded', {
              amount: formatLogQuota(result.refunded_quota),
            })
      )
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : t('Failed to refund task')
      )
    },
  })

  if (!canManuallyFailAndRefund(props.log)) return null

  return (
    <>
      <Button
        type='button'
        variant='destructive'
        size='xs'
        onClick={(event) => {
          event.stopPropagation()
          setOpen(true)
        }}
      >
        {t('Fail and refund')}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t('Mark task as failed and refund?')}
        desc={t(
          'Task {{taskId}} will stop being polled and {{amount}} will be refunded to the original funding source. This action cannot be undone.',
          { taskId: props.log.task_id, amount: refundAmount }
        )}
        confirmText={t('Confirm failure and refund')}
        destructive
        isLoading={mutation.isPending}
        handleConfirm={() => mutation.mutate()}
      />
    </>
  )
}
