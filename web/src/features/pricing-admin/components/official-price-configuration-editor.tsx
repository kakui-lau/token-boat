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
import { Plus, Trash2 } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  combineBillingExpr,
  splitBillingExprAndRequestRules,
} from '@/features/pricing/lib/billing-expr'
import { TieredPricingEditor } from '@/features/system-settings/models/tiered-pricing-editor'

import type { OfficialPriceVersion } from '../types'

type PriceField = {
  key: string
  label: string
}

type StructuredTier = {
  id: string
  name: string
  up_to: string
  unit_price: string
}

type OfficialPriceConfigurationEditorProps = {
  version: OfficialPriceVersion
  onChange: (version: OfficialPriceVersion) => void
}

const tokenFields: PriceField[] = [
  { key: 'input_unit_price', label: 'Input / 1M tokens' },
  { key: 'output_unit_price', label: 'Output / 1M tokens' },
  { key: 'cache_read_unit_price', label: 'Cache Read / 1M tokens' },
  { key: 'cache_write_unit_price', label: 'Cache Write / 1M tokens' },
  { key: 'image_input_unit_price', label: 'Image Input / 1M tokens' },
  { key: 'image_output_unit_price', label: 'Image Output / 1M tokens' },
  { key: 'audio_input_unit_price', label: 'Audio Input / 1M tokens' },
  { key: 'audio_output_unit_price', label: 'Audio Output / 1M tokens' },
]

const fieldsByMode: Record<string, PriceField[]> = {
  token: tokenFields,
  request: [{ key: 'request_unit_price', label: 'Price per request' }],
  image: [{ key: 'image_unit_price', label: 'Price per image' }],
  audio_duration: [
    { key: 'audio_second_unit_price', label: 'Price per audio second' },
  ],
  video_duration: [
    { key: 'video_second_unit_price', label: 'Price per video second' },
  ],
  character: [
    { key: 'character_unit_price', label: 'Price per 1M characters' },
  ],
  mixed: [
    ...tokenFields,
    { key: 'request_unit_price', label: 'Price per request' },
    { key: 'image_unit_price', label: 'Price per image' },
    { key: 'audio_second_unit_price', label: 'Price per audio second' },
    { key: 'video_second_unit_price', label: 'Price per video second' },
    { key: 'character_unit_price', label: 'Price per 1M characters' },
  ],
}

function readComponents(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // The save handler reports malformed JSON for expression-mode edits.
  }
  return {}
}

function generatedFlatExpression(
  mode: string,
  components: Record<string, unknown>
) {
  if (mode !== 'token') {
    return 'v1:tier("flat", 0)'
  }
  const expressionVariables: Record<string, string> = {
    input_unit_price: 'p',
    output_unit_price: 'c',
    cache_read_unit_price: 'cr',
    cache_write_unit_price: 'cc',
    image_input_unit_price: 'img',
    image_output_unit_price: 'img_o',
    audio_input_unit_price: 'ai',
    audio_output_unit_price: 'ao',
  }
  const parts = tokenFields.flatMap((field) => {
    const value = String(components[field.key] ?? '').trim()
    return value ? [`${expressionVariables[field.key]} * ${value}`] : []
  })
  return `v1:tier("flat", ${parts.length > 0 ? parts.join(' + ') : '0'})`
}

export function OfficialPriceConfigurationEditor(
  props: OfficialPriceConfigurationEditorProps
) {
  const { t } = useTranslation()
  const components = useMemo(
    () => readComponents(props.version.price_components),
    [props.version.price_components]
  )
  const fields = fieldsByMode[props.version.billing_mode] ?? []
  const updateComponents = (
    nextComponents: Record<string, unknown>,
    nextExpression?: string
  ) => {
    props.onChange({
      ...props.version,
      price_components: JSON.stringify(nextComponents, null, 2),
      billing_expr:
        nextExpression ??
        generatedFlatExpression(props.version.billing_mode, nextComponents),
      expression_source: 'generated',
    })
  }

  if (
    props.version.billing_mode === 'token' &&
    props.version.price_structure === 'tiered'
  ) {
    const split = splitBillingExprAndRequestRules(props.version.billing_expr)
    return (
      <TieredPricingEditor
        billingExpr={split.billingExpr}
        requestRuleExpr={split.requestRuleExpr}
        onBillingExprChange={(billingExpr) =>
          props.onChange({
            ...props.version,
            billing_expr:
              combineBillingExpr(billingExpr, split.requestRuleExpr) ??
              billingExpr,
            expression_source: 'generated',
          })
        }
        onRequestRuleExprChange={(requestRuleExpr) =>
          props.onChange({
            ...props.version,
            billing_expr:
              combineBillingExpr(split.billingExpr, requestRuleExpr) ??
              split.billingExpr,
            expression_source: 'generated',
          })
        }
      />
    )
  }

  if (props.version.price_structure === 'expression') {
    return (
      <div className='space-y-4'>
        <Field>
          <FieldLabel htmlFor='official-expression-components'>
            {t('Price Components')}
          </FieldLabel>
          <Textarea
            id='official-expression-components'
            className='min-h-32 font-mono text-xs'
            value={props.version.price_components}
            onChange={(event) =>
              props.onChange({
                ...props.version,
                price_components: event.target.value,
                expression_source: 'custom',
              })
            }
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='official-custom-expression'>
            {t('Billing Expression')}
          </FieldLabel>
          <Textarea
            id='official-custom-expression'
            className='min-h-44 font-mono text-xs'
            value={props.version.billing_expr}
            onChange={(event) =>
              props.onChange({
                ...props.version,
                billing_expr: event.target.value,
                expression_source: 'custom',
              })
            }
          />
        </Field>
      </div>
    )
  }

  if (props.version.price_structure === 'tiered') {
    const tiers = Array.isArray(components.tiers)
      ? (components.tiers as Partial<StructuredTier>[]).map((tier, index) => ({
          id: tier.id || `tier-${index + 1}`,
          name: tier.name || `tier_${index + 1}`,
          up_to: tier.up_to || '',
          unit_price: tier.unit_price || '',
        }))
      : [{ id: 'tier-1', name: 'base', up_to: '', unit_price: '' }]
    const updateTiers = (nextTiers: StructuredTier[]) =>
      updateComponents({ tiers: nextTiers }, 'v1:tier("structured_draft", 0)')
    return (
      <div className='space-y-3'>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Configure usage tiers here. This billing mode remains draft-only until its runtime usage variable is enabled.'
          )}
        </p>
        {tiers.map((tier, index) => (
          <div
            key={tier.id}
            className='grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_auto]'
          >
            <Field>
              <FieldLabel>{t('Tier name')}</FieldLabel>
              <Input
                value={tier.name}
                onChange={(event) => {
                  const next = [...tiers]
                  next[index] = { ...tier, name: event.target.value }
                  updateTiers(next)
                }}
              />
            </Field>
            <Field>
              <FieldLabel>{t('Upper bound')}</FieldLabel>
              <Input
                type='number'
                min={0}
                step='any'
                value={tier.up_to}
                placeholder={t('No limit')}
                onChange={(event) => {
                  const next = [...tiers]
                  next[index] = { ...tier, up_to: event.target.value }
                  updateTiers(next)
                }}
              />
            </Field>
            <Field>
              <FieldLabel>{t('Unit price')}</FieldLabel>
              <Input
                type='number'
                min={0}
                step='any'
                value={tier.unit_price}
                onChange={(event) => {
                  const next = [...tiers]
                  next[index] = { ...tier, unit_price: event.target.value }
                  updateTiers(next)
                }}
              />
            </Field>
            <Button
              type='button'
              size='icon'
              variant='ghost'
              className='self-end'
              disabled={tiers.length === 1}
              aria-label={t('Delete tier')}
              onClick={() => updateTiers(tiers.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() =>
            updateTiers([
              ...tiers,
              {
                id: `tier-${Date.now()}`,
                name: `tier_${tiers.length + 1}`,
                up_to: '',
                unit_price: '',
              },
            ])
          }
        >
          <Plus data-icon='inline-start' />
          {t('Add tier')}
        </Button>
      </div>
    )
  }

  return (
    <FieldGroup className='grid gap-4 sm:grid-cols-2'>
      {fields.map((field) => (
        <Field key={field.key}>
          <FieldLabel htmlFor={`official-component-${field.key}`}>
            {t(field.label)}
          </FieldLabel>
          <Input
            id={`official-component-${field.key}`}
            type='number'
            min={0}
            step='any'
            value={String(components[field.key] ?? '')}
            onChange={(event) => {
              const next = { ...components }
              if (event.target.value === '') {
                delete next[field.key]
              } else {
                next[field.key] = event.target.value
              }
              updateComponents(next)
            }}
          />
        </Field>
      ))}
    </FieldGroup>
  )
}
