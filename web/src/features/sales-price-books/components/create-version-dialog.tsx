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
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
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
import {
  percentageToStoredRate,
  storedRateToPercentage,
} from '@/features/pricing-admin/lib/rate-format'
import { handleServerError } from '@/lib/handle-server-error'

import {
  createSalesPriceBookVersion,
  updateSalesPriceBookVersion,
} from '../api'
import type { SalesPriceBookVersion } from '../types'

type CreateVersionDialogProps = {
  open: boolean
  priceBookId: number
  version?: SalesPriceBookVersion
  onOpenChange: (open: boolean) => void
  onSaved?: (version: SalesPriceBookVersion) => void
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
  const [dirty, setDirty] = useState(false)
  const [discardOpen, setDiscardOpen] = useState(false)
  useEffect(() => {
    if (!props.open) return
    const version = props.version
    setCostBasis(version?.cost_basis_strategy ?? 'max_eligible_cost')
    setPaymentFee(
      version ? storedRateToPercentage(version.payment_fee_rate) : '4'
    )
    setDistributionFee(
      version ? storedRateToPercentage(version.distribution_fee_rate) : '5'
    )
    setOperationsRate(
      version ? storedRateToPercentage(version.operations_labor_rate) : '2'
    )
    setTaxRate(
      version ? storedRateToPercentage(version.effective_tax_rate) : '16'
    )
    setTargetMargin(
      version ? storedRateToPercentage(version.target_net_margin) : '3'
    )
    setMinimumMargin(
      version ? storedRateToPercentage(version.minimum_margin_rate) : '2'
    )
    setDirty(false)
    setDiscardOpen(false)
  }, [props.open, props.version])
  const variableCostRate = useMemo(() => {
    return [paymentFee, distributionFee, operationsRate]
      .map((value) => Number(value))
      .reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
      .toString()
  }, [distributionFee, operationsRate, paymentFee])
  let costBasisLabel = t('Maximum eligible purchase cost (recommended)')
  let costBasisDescription = t(
    'Uses the highest cost from the selected active purchase prices to protect margin when routing changes. Recommended for TOC and most TOB price books.'
  )
  if (costBasis === 'min_eligible_cost') {
    costBasisLabel = t('Minimum eligible purchase cost')
    costBasisDescription = t(
      'Uses the lowest cost from the selected active purchase prices. Use only when routing is guaranteed to stay on a low-cost channel; otherwise margin may fall below the minimum.'
    )
  }
  const mutation = useMutation({
    mutationFn: () => {
      const input = {
        cost_basis_strategy: costBasis,
        payment_fee_rate: percentageToStoredRate(paymentFee),
        distribution_fee_rate: percentageToStoredRate(distributionFee),
        operations_labor_rate: percentageToStoredRate(operationsRate),
        total_variable_cost_rate: percentageToStoredRate(variableCostRate),
        effective_tax_rate: percentageToStoredRate(taxRate),
        target_net_margin: percentageToStoredRate(targetMargin),
        minimum_margin_rate: percentageToStoredRate(minimumMargin),
        remark: props.version?.remark ?? '',
      }
      if (props.version) {
        return updateSalesPriceBookVersion(props.version.id, input)
      }
      return createSalesPriceBookVersion(props.priceBookId, input)
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({
        queryKey: ['sales-price-books', 'versions', props.priceBookId],
      })
      toast.success(
        props.version
          ? t('Draft pricing parameters updated')
          : t('Draft price book version created')
      )
      props.onSaved?.(response.data)
      setDirty(false)
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
        onChange={(event) => {
          setValue(event.target.value)
          setDirty(true)
        }}
        required
      />
    </Field>
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate()
  }

  const requestOpenChange = (open: boolean) => {
    if (!open && dirty && !mutation.isPending) {
      setDiscardOpen(true)
      return
    }
    props.onOpenChange(open)
  }

  return (
    <>
      <Dialog open={props.open} onOpenChange={requestOpenChange}>
        <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {props.version
                  ? t('Edit draft pricing parameters')
                  : t('Create draft version')}
              </DialogTitle>
              <DialogDescription>
                {t(
                  'Published versions are immutable. Changes require a new draft.'
                )}
                {props.version ? (
                  <>
                    <br />
                    {t(
                      'Changing pricing parameters clears the draft model prices and requires regeneration.'
                    )}
                  </>
                ) : null}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className='py-5'>
              <Field>
                <FieldLabel htmlFor='cost-basis-strategy'>
                  {t('Cost basis strategy')}
                </FieldLabel>
                <Select
                  value={costBasis}
                  onValueChange={(value) => {
                    if (!value) return
                    setCostBasis(value)
                    setDirty(true)
                  }}
                >
                  <SelectTrigger id='cost-basis-strategy' className='w-full'>
                    <SelectValue>{costBasisLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value='max_eligible_cost'>
                        {t('Maximum eligible purchase cost (recommended)')}
                      </SelectItem>
                      <SelectItem value='min_eligible_cost'>
                        {t('Minimum eligible purchase cost')}
                      </SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>{costBasisDescription}</FieldDescription>
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
                  {t(
                    'Automatically calculated from the three cost components.'
                  )}
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
                onClick={() => requestOpenChange(false)}
                disabled={mutation.isPending}
              >
                {t('Cancel')}
              </Button>
              <Button type='submit' disabled={mutation.isPending}>
                {mutation.isPending ? (
                  <Spinner data-icon='inline-start' />
                ) : null}
                {props.version
                  ? t('Save pricing parameters')
                  : t('Create draft')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Discard unsaved changes?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('Your changes have not been saved.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Keep editing')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => {
                setDirty(false)
                setDiscardOpen(false)
                props.onOpenChange(false)
              }}
            >
              {t('Discard changes')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
