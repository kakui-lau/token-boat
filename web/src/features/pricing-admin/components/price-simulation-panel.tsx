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
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import { simulatePrice } from '../api'
import type { PurchasePriceVersion, RetailPriceVersion } from '../types'

type PriceSimulationPanelProps = {
  channelModelId: number
  purchaseVersions: PurchasePriceVersion[]
  retailVersions: RetailPriceVersion[]
}

const tokenFields = [
  ['prompt_tokens', 'Prompt tokens'],
  ['completion_tokens', 'Completion tokens'],
  ['cache_read_tokens', 'Cache read tokens'],
  ['cache_write_tokens', 'Cache write tokens'],
  ['image_input_tokens', 'Image input tokens'],
  ['image_output_tokens', 'Image output tokens'],
  ['audio_input_tokens', 'Audio input tokens'],
  ['audio_output_tokens', 'Audio output tokens'],
] as const

export function PriceSimulationPanel(props: PriceSimulationPanelProps) {
  const { t } = useTranslation()
  const [retailVersionId, setRetailVersionId] = useState('')
  const [tokenValues, setTokenValues] = useState<Record<string, string>>({
    prompt_tokens: '1000000',
    completion_tokens: '1000000',
    cache_read_tokens: '0',
    cache_write_tokens: '0',
    image_input_tokens: '0',
    image_output_tokens: '0',
    audio_input_tokens: '0',
    audio_output_tokens: '0',
  })
  const selectedRetail = props.retailVersions.find(
    (version) => version.id === Number(retailVersionId)
  )
  const selectedPurchase = props.purchaseVersions.find(
    (version) => version.id === selectedRetail?.purchase_price_version_id
  )
  const mutation = useMutation({
    mutationFn: () =>
      simulatePrice({
        channel_model_id: props.channelModelId,
        purchase_price_version_id: selectedPurchase?.id ?? 0,
        retail_price_version_id: selectedRetail?.id ?? 0,
        prompt_tokens: Number(tokenValues.prompt_tokens),
        completion_tokens: Number(tokenValues.completion_tokens),
        cache_read_tokens: Number(tokenValues.cache_read_tokens),
        cache_write_tokens: Number(tokenValues.cache_write_tokens),
        image_input_tokens: Number(tokenValues.image_input_tokens),
        image_output_tokens: Number(tokenValues.image_output_tokens),
        audio_input_tokens: Number(tokenValues.audio_input_tokens),
        audio_output_tokens: Number(tokenValues.audio_output_tokens),
      }),
  })
  const result = mutation.data?.data
  const hasInvalidTokens = Object.values(tokenValues).some((value) => {
    const numberValue = Number(value)
    return (
      value === '' ||
      !Number.isFinite(numberValue) ||
      numberValue < 0 ||
      numberValue > 1_000_000_000
    )
  })

  return (
    <div className='space-y-6'>
      <div className='space-y-4 rounded-lg border p-4'>
        <h3 className='font-medium'>{t('Run price simulation')}</h3>
        <FieldGroup className='grid gap-4 sm:grid-cols-2'>
          <Field className='sm:col-span-2'>
            <FieldLabel htmlFor='simulation-retail-version'>
              {t('Retail price version')}
            </FieldLabel>
            <NativeSelect
              id='simulation-retail-version'
              className='w-full'
              value={retailVersionId}
              onChange={(event) => setRetailVersionId(event.target.value)}
            >
              <NativeSelectOption value=''>
                {t('Select a version')}
              </NativeSelectOption>
              {props.retailVersions.map((version) => (
                <NativeSelectOption key={version.id} value={String(version.id)}>
                  {t('Version')} {version.version} · {t(version.status)}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {tokenFields.map(([name, label]) => (
            <Field key={name}>
              <FieldLabel htmlFor={`simulation-${name}`}>{t(label)}</FieldLabel>
              <Input
                id={`simulation-${name}`}
                type='number'
                min={0}
                max={1_000_000_000}
                step={1}
                value={tokenValues[name]}
                onChange={(event) =>
                  setTokenValues((current) => ({
                    ...current,
                    [name]: event.target.value,
                  }))
                }
              />
            </Field>
          ))}
        </FieldGroup>
        <Button
          disabled={
            !selectedRetail ||
            !selectedPurchase ||
            mutation.isPending ||
            hasInvalidTokens
          }
          onClick={() => mutation.mutate()}
        >
          {t('Simulate')}
        </Button>
      </div>

      {result ? (
        <section className='space-y-3'>
          <div className='flex items-center justify-between'>
            <h3 className='font-medium'>{t('Simulation result')}</h3>
            <Badge
              variant={result.meets_minimum_margin ? 'default' : 'destructive'}
            >
              {result.meets_minimum_margin
                ? t('Margin threshold met')
                : t('Below margin threshold')}
            </Badge>
          </div>
          <div className='grid gap-3 sm:grid-cols-2'>
            {[
              ['Purchase cost', result.purchase_cost],
              ['Retail amount', result.retail_amount],
              ['Variable cost', result.variable_cost],
              ['Pre-tax profit', result.pre_tax_profit],
              ['Tax expense', result.tax_expense],
              ['Net profit', result.net_profit],
            ].map(([label, value]) => (
              <div key={label} className='rounded-lg border p-3'>
                <p className='text-muted-foreground text-xs'>{t(label)}</p>
                <p className='font-mono text-base'>
                  {value} {result.currency}
                </p>
              </div>
            ))}
            <div className='rounded-lg border p-3'>
              <p className='text-muted-foreground text-xs'>
                {t('Gross margin rate')}
              </p>
              <p className='font-mono text-base'>
                {(Number(result.gross_margin_rate) * 100).toFixed(2)}%
              </p>
            </div>
            <div className='rounded-lg border p-3'>
              <p className='text-muted-foreground text-xs'>
                {t('Net margin rate')}
              </p>
              <p className='font-mono text-base'>
                {(Number(result.net_margin_rate) * 100).toFixed(2)}%
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  )
}
