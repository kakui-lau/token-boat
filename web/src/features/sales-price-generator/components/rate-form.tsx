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

import { zodResolver } from '@hookform/resolvers/zod'
import { Calculator } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { Spinner } from '@/components/ui/spinner'
import { PercentageInputField } from '@/features/pricing-admin/components/percentage-input-field'
import { percentageToStoredRate } from '@/features/pricing-admin/lib/rate-format'

import {
  salesPriceGeneratorSchema,
  type SalesPriceGeneratorForm,
} from '../lib/schema'
import { calculateVariableCostPercentage } from '../lib/variable-cost-rate'
import type { SalesPriceGenerationInput } from '../types'

type RateFormProps = {
  hasSelectedModels: boolean
  isGenerating: boolean
  onGenerate: (input: SalesPriceGenerationInput) => void
}

const defaultValues: SalesPriceGeneratorForm = {
  payment_processing_fee_rate: '4',
  distribution_fee_rate: '5',
  operations_labor_cost_rate: '2',
  effective_tax_rate: '16',
  target_net_margin: '3',
}

export function RateForm(props: RateFormProps) {
  const { t } = useTranslation()
  const form = useForm<SalesPriceGeneratorForm>({
    resolver: zodResolver(salesPriceGeneratorSchema),
    defaultValues,
  })
  const paymentProcessingFeeRate = useWatch({
    control: form.control,
    name: 'payment_processing_fee_rate',
  })
  const distributionFeeRate = useWatch({
    control: form.control,
    name: 'distribution_fee_rate',
  })
  const operationsLaborCostRate = useWatch({
    control: form.control,
    name: 'operations_labor_cost_rate',
  })
  const totalVariableCostRate = calculateVariableCostPercentage([
    paymentProcessingFeeRate,
    distributionFeeRate,
    operationsLaborCostRate,
  ])

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit((values) => {
        const variableCostRate = calculateVariableCostPercentage([
          values.payment_processing_fee_rate,
          values.distribution_fee_rate,
          values.operations_labor_cost_rate,
        ])
        props.onGenerate({
          total_variable_cost_rate: percentageToStoredRate(variableCostRate),
          effective_tax_rate: percentageToStoredRate(values.effective_tax_rate),
          target_net_margin: percentageToStoredRate(values.target_net_margin),
        })
      })}
    >
      <Card className='shrink-0'>
        <CardHeader>
          <CardTitle>{t('Sales price assumptions')}</CardTitle>
          <CardDescription>
            {t(
              'Set the rates used to calculate sales prices. Generating a table does not change saved pricing.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className='grid gap-4 md:grid-cols-3'>
            <PercentageInputField
              id='sales-price-payment-processing-fee'
              label='Payment processing fee'
              registration={form.register('payment_processing_fee_rate')}
              error={form.formState.errors.payment_processing_fee_rate}
            />
            <PercentageInputField
              id='sales-price-distribution-fee'
              label='Distribution fee'
              registration={form.register('distribution_fee_rate')}
              error={form.formState.errors.distribution_fee_rate}
            />
            <PercentageInputField
              id='sales-price-operations-labor-cost'
              label='Operations labor cost'
              registration={form.register('operations_labor_cost_rate')}
              error={form.formState.errors.operations_labor_cost_rate}
            />
            <Field>
              <FieldLabel htmlFor='sales-price-variable-cost-rate'>
                {t('Variable Cost Rate (VCR)')}
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id='sales-price-variable-cost-rate'
                  type='number'
                  value={totalVariableCostRate}
                  readOnly
                  aria-readonly='true'
                />
                <InputGroupAddon align='inline-end'>%</InputGroupAddon>
              </InputGroup>
            </Field>
            <PercentageInputField
              id='sales-price-tax-rate'
              label='Tax Rate (TR)'
              registration={form.register('effective_tax_rate')}
              error={form.formState.errors.effective_tax_rate}
            />
            <PercentageInputField
              id='sales-price-target-margin'
              label='Target Margin (TM)'
              registration={form.register('target_net_margin')}
              error={form.formState.errors.target_net_margin}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className='justify-end gap-2'>
          <Button
            type='submit'
            disabled={!props.hasSelectedModels || props.isGenerating}
          >
            {props.isGenerating ? (
              <Spinner data-icon='inline-start' />
            ) : (
              <Calculator data-icon='inline-start' />
            )}
            {t('Generate sales prices')}
          </Button>
        </CardFooter>
      </Card>
    </form>
  )
}
