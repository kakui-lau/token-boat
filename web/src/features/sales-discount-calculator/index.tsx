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
import {
  useForm,
  type FieldError as HookFormFieldError,
  type UseFormRegisterReturn,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { SectionPageLayout } from '@/components/layout'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'

import {
  calculateSalesDiscount,
  defaultSalesDiscountCalculatorValues,
  salesDiscountCalculatorSchema,
  type SalesDiscountCalculatorValues,
} from './lib/calculator'

const costInputFields = [
  {
    name: 'purchaseDiscount',
    id: 'purchase-discount',
    label: 'Purchase discount (%)',
  },
  { name: 'paymentFee', id: 'payment-fee', label: 'Payment fee (%)' },
  {
    name: 'distributionFee',
    id: 'distribution-fee',
    label: 'Distribution fee (%)',
  },
  {
    name: 'laborCost',
    id: 'labor-cost',
    label: 'Operations labor cost (%)',
  },
] as const satisfies ReadonlyArray<{
  name: keyof SalesDiscountCalculatorValues
  id: string
  label: string
}>

const policyInputFields = [
  {
    name: 'profitTaxRate',
    id: 'profit-tax-rate',
    label: 'Profit tax rate (%)',
  },
  {
    name: 'targetNetMargin',
    id: 'target-net-margin',
    label: 'Target net margin (%)',
  },
] as const satisfies ReadonlyArray<{
  name: keyof SalesDiscountCalculatorValues
  id: string
  label: string
}>

function formatPercentage(value: number): string {
  return `${(value * 100).toFixed(5)}%`
}

function formatDiscountTenths(value: number): string {
  return (value * 10).toFixed(5)
}

type PercentageInputProps = {
  id: string
  label: string
  registration: UseFormRegisterReturn
  error?: HookFormFieldError
}

function PercentageInput(props: PercentageInputProps) {
  const { t } = useTranslation()
  return (
    <Field data-invalid={Boolean(props.error)}>
      <FieldLabel htmlFor={props.id}>{t(props.label)}</FieldLabel>
      <InputGroup>
        <InputGroupInput
          id={props.id}
          type='number'
          inputMode='decimal'
          min='0'
          max='100'
          step='0.01'
          aria-invalid={Boolean(props.error)}
          {...props.registration}
        />
        <InputGroupAddon align='inline-end'>%</InputGroupAddon>
      </InputGroup>
      {props.error?.message ? (
        <FieldError>{t(props.error.message)}</FieldError>
      ) : null}
    </Field>
  )
}

export function SalesDiscountCalculator() {
  const { t } = useTranslation()
  const form = useForm<SalesDiscountCalculatorValues>({
    resolver: zodResolver(salesDiscountCalculatorSchema),
    mode: 'onChange',
    defaultValues: defaultSalesDiscountCalculatorValues,
  })
  const values = form.watch()
  const calculation = calculateSalesDiscount(values)

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>
        {t('Sales Discount Calculator')}
      </SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]'>
          <Card>
            <CardHeader>
              <CardTitle>{t('Pricing inputs')}</CardTitle>
              <CardDescription>
                {t(
                  'Calculate the sales discount from purchase discount and operating rates.'
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <div className='grid gap-4 sm:grid-cols-2'>
                  {costInputFields.map((field) => (
                    <PercentageInput
                      key={field.name}
                      id={field.id}
                      label={field.label}
                      registration={form.register(field.name, {
                        valueAsNumber: true,
                      })}
                      error={form.formState.errors[field.name]}
                    />
                  ))}
                  <Field>
                    <FieldLabel htmlFor='variable-cost-rate'>
                      {t('Variable cost rate (%)')}
                    </FieldLabel>
                    <InputGroup>
                      <InputGroupInput
                        id='variable-cost-rate'
                        value={
                          Number.isFinite(calculation.variableCostRate)
                            ? calculation.variableCostRate.toFixed(2)
                            : ''
                        }
                        readOnly
                      />
                      <InputGroupAddon align='inline-end'>%</InputGroupAddon>
                    </InputGroup>
                    <FieldDescription>
                      {t(
                        'Automatically calculated from the three cost components.'
                      )}
                    </FieldDescription>
                  </Field>
                  {policyInputFields.map((field) => (
                    <PercentageInput
                      key={field.name}
                      id={field.id}
                      label={field.label}
                      registration={form.register(field.name, {
                        valueAsNumber: true,
                      })}
                      error={form.formState.errors[field.name]}
                    />
                  ))}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          <div className='flex min-w-0 flex-col gap-4'>
            <Card>
              <CardHeader>
                <CardTitle>{t('Sales discount')}</CardTitle>
              </CardHeader>
              <CardContent aria-live='polite' className='flex flex-col gap-5'>
                <output
                  aria-label={t('Sales discount')}
                  className='text-4xl font-bold tracking-tight tabular-nums'
                >
                  {calculation.status === 'valid'
                    ? `${formatDiscountTenths(calculation.salesDiscount)} ${t(
                        'Discount tenths unit'
                      )}`
                    : '—'}
                </output>

                {calculation.status === 'valid' ? (
                  <dl className='grid grid-cols-2 gap-3'>
                    <div className='bg-muted/50 rounded-lg p-3'>
                      <dt className='text-muted-foreground text-xs'>
                        {t('Selling factor')}
                      </dt>
                      <dd className='mt-1 font-medium tabular-nums'>
                        {calculation.sellingFactor.toFixed(6)}
                      </dd>
                    </div>
                    <div className='bg-muted/50 rounded-lg p-3'>
                      <dt className='text-muted-foreground text-xs'>
                        {t('Markup over purchase cost')}
                      </dt>
                      <dd className='mt-1 font-medium tabular-nums'>
                        {formatPercentage(calculation.purchaseMarkupRate)}
                      </dd>
                    </div>
                  </dl>
                ) : null}

                {calculation.status === 'non_positive_denominator' ? (
                  <Alert variant='destructive'>
                    <AlertTitle>{t('Calculation unavailable')}</AlertTitle>
                    <AlertDescription>
                      {t(
                        'The rates produce a non-positive denominator. Reduce VCR, profit tax rate, or target net margin.'
                      )}
                    </AlertDescription>
                  </Alert>
                ) : null}

                {calculation.status === 'valid' ? (
                  <Alert
                    variant={
                      calculation.salesDiscount < 1 ? 'default' : 'destructive'
                    }
                  >
                    <AlertTitle>
                      {t(
                        calculation.salesDiscount < 1
                          ? 'Below official price'
                          : 'At or above official price'
                      )}
                    </AlertTitle>
                    <AlertDescription>
                      {calculation.salesDiscount < 1
                        ? t(
                            'The calculated sales discount is {{discount}} of official price.',
                            {
                              discount: `${formatDiscountTenths(
                                calculation.salesDiscount
                              )} ${t('Discount tenths unit')}`,
                            }
                          )
                        : t(
                            'This result would not be lower than the official price.'
                          )}
                    </AlertDescription>
                  </Alert>
                ) : null}
              </CardContent>
            </Card>

            <Card size='sm'>
              <CardHeader>
                <CardTitle>{t('Formula')}</CardTitle>
              </CardHeader>
              <CardContent>
                <code className='text-muted-foreground block overflow-x-auto text-xs leading-relaxed'>
                  SD = PD × (1 − TR) ÷ ((1 − VCR) × (1 − TR) − TM)
                </code>
              </CardContent>
            </Card>
          </div>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
