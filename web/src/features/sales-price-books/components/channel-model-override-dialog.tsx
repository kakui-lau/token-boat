/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import {
  percentageToStoredRate,
  storedRateToPercentage,
} from '@/features/pricing-admin/lib/rate-format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  deleteSalesPriceBookChannelModelOverride,
  getSalesPriceBookChannelModelOverrides,
  saveSalesPriceBookChannelModelOverride,
} from '../api'
import type { SalesPriceBookVersion } from '../types'

type ChannelModelOverrideDialogProps = {
  open: boolean
  version: SalesPriceBookVersion
  modelName: string
  channel?: { channel_model_id: number; channel_name: string }
  onOpenChange: (open: boolean) => void
}

type RateField =
  | 'payment_fee_rate'
  | 'distribution_fee_rate'
  | 'operations_labor_rate'
  | 'effective_tax_rate'
  | 'target_net_margin'
  | 'minimum_margin_rate'

const emptyRates: Record<RateField, string> = {
  payment_fee_rate: '',
  distribution_fee_rate: '',
  operations_labor_rate: '',
  effective_tax_rate: '',
  target_net_margin: '',
  minimum_margin_rate: '',
}

export function ChannelModelOverrideDialog(
  props: ChannelModelOverrideDialogProps
) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const channelModelId = props.channel?.channel_model_id ?? 0
  const [rates, setRates] = useState(emptyRates)
  const [remark, setRemark] = useState('')
  const overridesQuery = useQuery({
    queryKey: [
      'sales-price-books',
      'channel-model-overrides',
      props.version.id,
    ],
    queryFn: () => getSalesPriceBookChannelModelOverrides(props.version.id),
    enabled: props.open && channelModelId > 0,
  })
  const current = overridesQuery.data?.data?.find(
    (item) => item.channel_model_id === channelModelId
  )

  useEffect(() => {
    if (!props.open || overridesQuery.isLoading) return
    if (!current) {
      setRates(emptyRates)
      setRemark('')
      return
    }
    setRates({
      payment_fee_rate: current.payment_fee_rate
        ? storedRateToPercentage(current.payment_fee_rate)
        : '',
      distribution_fee_rate: current.distribution_fee_rate
        ? storedRateToPercentage(current.distribution_fee_rate)
        : '',
      operations_labor_rate: current.operations_labor_rate
        ? storedRateToPercentage(current.operations_labor_rate)
        : '',
      effective_tax_rate: current.effective_tax_rate
        ? storedRateToPercentage(current.effective_tax_rate)
        : '',
      target_net_margin: current.target_net_margin
        ? storedRateToPercentage(current.target_net_margin)
        : '',
      minimum_margin_rate: current.minimum_margin_rate
        ? storedRateToPercentage(current.minimum_margin_rate)
        : '',
    })
    setRemark(current.remark ?? '')
  }, [current, overridesQuery.isLoading, props.open])

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: [
          'sales-price-books',
          'channel-model-overrides',
          props.version.id,
        ],
      }),
      queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'items', props.version.id],
      }),
      queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'version-diff'],
      }),
      queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'audit-records'],
      }),
    ])
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      saveSalesPriceBookChannelModelOverride(props.version.id, channelModelId, {
        payment_fee_rate: toStoredRate(rates.payment_fee_rate),
        distribution_fee_rate: toStoredRate(rates.distribution_fee_rate),
        operations_labor_rate: toStoredRate(rates.operations_labor_rate),
        effective_tax_rate: toStoredRate(rates.effective_tax_rate),
        target_net_margin: toStoredRate(rates.target_net_margin),
        minimum_margin_rate: toStoredRate(rates.minimum_margin_rate),
        remark,
      }),
    onSuccess: async () => {
      await invalidate()
      toast.success(t('Channel model special parameters saved'))
      props.onOpenChange(false)
    },
    onError: handleServerError,
  })
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteSalesPriceBookChannelModelOverride(
        props.version.id,
        channelModelId
      ),
    onSuccess: async () => {
      await invalidate()
      toast.success(t('Channel model now inherits version defaults'))
      props.onOpenChange(false)
    },
    onError: handleServerError,
  })

  const defaults: Record<RateField, string> = {
    payment_fee_rate: storedRateToPercentage(props.version.payment_fee_rate),
    distribution_fee_rate: storedRateToPercentage(
      props.version.distribution_fee_rate
    ),
    operations_labor_rate: storedRateToPercentage(
      props.version.operations_labor_rate
    ),
    effective_tax_rate: storedRateToPercentage(
      props.version.effective_tax_rate
    ),
    target_net_margin: storedRateToPercentage(props.version.target_net_margin),
    minimum_margin_rate: storedRateToPercentage(
      props.version.minimum_margin_rate
    ),
  }
  const fields: Array<{ name: RateField; label: string }> = [
    { name: 'payment_fee_rate', label: t('Payment fee') },
    { name: 'distribution_fee_rate', label: t('Distribution fee') },
    { name: 'operations_labor_rate', label: t('Operations labor cost') },
    { name: 'effective_tax_rate', label: t('Effective tax rate') },
    { name: 'target_net_margin', label: t('Target net margin') },
    { name: 'minimum_margin_rate', label: t('Minimum margin rate') },
  ]
  const pending = saveMutation.isPending || deleteMutation.isPending
  const hasSpecialRate = Object.values(rates).some(
    (value) => value.trim() !== ''
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    saveMutation.mutate()
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('Channel model special parameters')}</DialogTitle>
            <DialogDescription>
              {props.modelName} · {props.channel?.channel_name}
            </DialogDescription>
          </DialogHeader>
          <div className='py-5'>
            <Alert>
              <AlertTitle>{t('Only fill exceptional values')}</AlertTitle>
              <AlertDescription>
                {t(
                  'Blank fields inherit the price book version defaults. Zero is an explicit zero. Saving changes keeps the current price for comparison but marks it as requiring regeneration before publishing.'
                )}
              </AlertDescription>
            </Alert>
            {overridesQuery.isLoading ? (
              <div className='flex min-h-40 items-center justify-center'>
                <Spinner />
              </div>
            ) : (
              <FieldGroup className='grid gap-4 py-5 sm:grid-cols-2'>
                {fields.map((field) => (
                  <Field key={field.name}>
                    <FieldLabel htmlFor={`channel-override-${field.name}`}>
                      {field.label} (%)
                    </FieldLabel>
                    <Input
                      id={`channel-override-${field.name}`}
                      type='number'
                      min='0'
                      max='100'
                      step='0.01'
                      value={rates[field.name]}
                      placeholder={t('Inherit {{value}}%', {
                        value: defaults[field.name],
                      })}
                      onChange={(event) =>
                        setRates((previous) => ({
                          ...previous,
                          [field.name]: event.target.value,
                        }))
                      }
                    />
                    <FieldDescription>
                      {rates[field.name] === ''
                        ? t('Currently inherits {{value}}%', {
                            value: defaults[field.name],
                          })
                        : t('Special value for this channel model')}
                    </FieldDescription>
                  </Field>
                ))}
                <Field className='sm:col-span-2'>
                  <FieldLabel htmlFor='channel-override-remark'>
                    {t('Remark')}
                  </FieldLabel>
                  <Input
                    id='channel-override-remark'
                    value={remark}
                    maxLength={255}
                    onChange={(event) => setRemark(event.target.value)}
                  />
                </Field>
              </FieldGroup>
            )}
          </div>
          <DialogFooter className='flex-row justify-between sm:justify-between'>
            <div>
              {current ? (
                <Button
                  type='button'
                  variant='destructive'
                  disabled={pending}
                  onClick={() => deleteMutation.mutate()}
                >
                  {t('Restore version defaults')}
                </Button>
              ) : null}
            </div>
            <div className='flex gap-2'>
              <Button
                type='button'
                variant='outline'
                disabled={pending}
                onClick={() => props.onOpenChange(false)}
              >
                {t('Cancel')}
              </Button>
              <Button
                type='submit'
                disabled={
                  pending || overridesQuery.isLoading || !hasSpecialRate
                }
              >
                {pending ? <Spinner /> : null}
                {t('Save special parameters')}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function toStoredRate(value: string) {
  return value.trim() === '' ? null : percentageToStoredRate(value)
}
