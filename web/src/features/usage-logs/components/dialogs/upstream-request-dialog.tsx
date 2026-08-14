/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/copy-button'
import { Dialog } from '@/components/dialog'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'

import type { TaskUpstreamRequest } from '../../types'

interface UpstreamRequestDialogProps {
  request: TaskUpstreamRequest
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UpstreamRequestDialog({
  request,
  open,
  onOpenChange,
}: UpstreamRequestDialogProps) {
  const { t } = useTranslation()
  const formattedBody = (() => {
    try {
      return JSON.stringify(JSON.parse(request.body), null, 2)
    } catch {
      return request.body
    }
  })()
  const completeRequest = JSON.stringify(
    {
      method: request.method,
      url: request.url,
      failure: request.failure,
      body: (() => {
        try {
          return JSON.parse(request.body)
        } catch {
          return request.body
        }
      })(),
    },
    null,
    2
  )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('Upstream Request Details')}
      description={t(
        'Only administrators can view upstream request parameters'
      )}
      contentClassName='sm:max-w-3xl'
      contentHeight='auto'
      bodyClassName='space-y-4'
    >
      <ScrollArea className='max-h-[70vh] pr-4'>
        <div className='flex flex-col gap-4 py-4'>
          <div className='grid gap-3 sm:grid-cols-2'>
            <div className='flex flex-col gap-1'>
              <Label>{t('Request Method')}</Label>
              <p className='bg-muted rounded-md border p-2 font-mono text-xs'>
                {request.method}
              </p>
            </div>
            {request.failure ? (
              <div className='flex flex-col gap-1'>
                <Label>{t('Failure')}</Label>
                <p className='bg-muted rounded-md border p-2 font-mono text-xs'>
                  {request.failure}
                </p>
              </div>
            ) : null}
          </div>
          <div className='flex flex-col gap-1'>
            <Label>{t('Upstream URL')}</Label>
            <p className='bg-muted overflow-wrap-anywhere rounded-md border p-2 font-mono text-xs break-all'>
              {request.url}
            </p>
          </div>
          <div className='flex flex-col gap-1'>
            <div className='flex items-center justify-between'>
              <Label>{t('Complete Upstream Request Body')}</Label>
              <CopyButton
                value={completeRequest}
                tooltip={t('Copy complete upstream request')}
              />
            </div>
            <pre className='bg-muted overflow-wrap-anywhere max-h-[48vh] overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap'>
              {formattedBody}
            </pre>
          </div>
        </div>
      </ScrollArea>
    </Dialog>
  )
}
