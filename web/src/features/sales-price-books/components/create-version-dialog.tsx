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
import { useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { percentageToStoredRate } from '@/features/pricing-admin/lib/rate-format'
import { handleServerError } from '@/lib/handle-server-error'

import { createSalesPriceBookVersion } from '../api'

type CreateVersionDialogProps = {
  open: boolean
  priceBookId: number
  onOpenChange: (open: boolean) => void
}

export function CreateVersionDialog(props: CreateVersionDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [costBasis, setCostBasis] = useState('max_eligible_cost')
  const [paymentFee, setPaymentFee] = useState('4')
  const [distributionFee, setDistributionFee] = useState('5')
  const [operationsRate, setOperationsRate] = useState('2')
  const [taxRate, setTaxRate] = useState('16')
  const [targetMargin, setTargetMargin] = useState('3')
  const [minimumMargin, setMinimumMargin] = useState('2')
  const variableCostRate = useMemo(() => {
    return [paymentFee, distributionFee, operationsRate]
      .map((value) => Number(value))
      .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
      .toString()
  }, [distributionFee, operationsRate, paymentFee])
  const mutation = useMutation({
    mutationFn: () =>
      createSalesPriceBookVersion(props.priceBookId, {
        cost_basis_strategy: costBasis,
        reprice_mode: 'review',
        payment_fee_rate: percentageToStoredRate(paymentFee),
        distribution_fee_rate: percentageToStoredRate(distributionFee),
        operations_labor_rate: percentageToStoredRate(operationsRate),
        total_variable_cost_rate: percentageToStoredRate(variableCostRate),
        effective_tax_rate: percentageToStoredRate(taxRate),
        target_net_margin: percentageToStoredRate(targetMargin),
        minimum_margin_rate: percentageToStoredRate(minimumMargin),
        rounding_mode: 'ceil',
        rounding_scale: 5,
        risk_action: 'exclude_channel',
        remark: '',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'versions', props.priceBookId],
      })
      toast.success(t('Draft price book version created'))
      props.onOpenChange(false)
    },
    onError: handleServerError,
  })

  const rateInput = (
    id: string,
    label: string,
    value: string,
    setValue: (value: string) => void
  ) => (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type='number'
        min='0'
        max='100'
        step='0.01'
        value={value}
        onChange={(event) => setValue(event.target.value)}
        required
      />
    </Field>
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('Create draft version')}</DialogTitle>
            <DialogDescription>
              {t(
                'Published versions are immutable. Changes require a new draft.'
              )}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-5'>
            <Field>
              <FieldLabel>{t('Cost basis strategy')}</FieldLabel>
              <Select
                value={costBasis}
                onValueChange={(value) => value && setCostBasis(value)}
              >
                <SelectTrigger className='w-full'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value='max_eligible_cost'>
                      {t('Maximum eligible purchase cost')}
                    </SelectItem>
                    <SelectItem value='min_eligible_cost'>
                      {t('Minimum eligible purchase cost')}
                    </SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <div className='grid gap-4 sm:grid-cols-3'>
              {rateInput(
                'payment-fee',
                t('Payment fee (%)'),
                paymentFee,
                setPaymentFee
              )}
              {rateInput(
                'distribution-fee',
                t('Distribution fee (%)'),
                distributionFee,
                setDistributionFee
              )}
              {rateInput(
                'operations-rate',
                t('Operations labor cost (%)'),
                operationsRate,
                setOperationsRate
              )}
            </div>
            <Field>
              <FieldLabel>{t('Variable cost rate (%)')}</FieldLabel>
              <Input value={variableCostRate} readOnly />
              <FieldDescription>
                {t('Automatically calculated from the three cost components.')}
              </FieldDescription>
            </Field>
            <div className='grid gap-4 sm:grid-cols-3'>
              {rateInput(
                'tax-rate',
                t('Effective tax rate (%)'),
                taxRate,
                setTaxRate
              )}
              {rateInput(
                'target-margin',
                t('Target net margin (%)'),
                targetMargin,
                setTargetMargin
              )}
              {rateInput(
                'minimum-margin',
                t('Minimum margin (%)'),
                minimumMargin,
                setMinimumMargin
              )}
            </div>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => props.onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button type='submit' disabled={mutation.isPending}>
              {mutation.isPending ? <Spinner data-icon='inline-start' /> : null}
              {t('Create draft')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
