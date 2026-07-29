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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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

type BusinessPriceRule = {
  id: string
  name: string
  component: string
  unit: string
  unit_size: string
  unit_price: string
  upper_bound: string
  operation: string
  quality: string
  resolution: string
  with_audio: string
  billing_event: string
  voice_tier: string
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

const componentOptionsByMode: Record<
  string,
  { value: string; label: string; unit: string }[]
> = {
  request: [
    { value: 'request', label: 'Request', unit: 'request' },
    { value: 'tool_call', label: 'Tool call', unit: 'request' },
    { value: 'generated_item', label: 'Generated item', unit: 'request' },
  ],
  image: [
    { value: 'image_output', label: 'Image output', unit: 'image' },
    { value: 'image_input', label: 'Image input', unit: 'image' },
  ],
  audio_duration: [
    { value: 'audio_input', label: 'Audio input', unit: 'second' },
    { value: 'audio_output', label: 'Audio output', unit: 'second' },
  ],
  video_duration: [
    { value: 'video_output', label: 'Video output', unit: 'second' },
    { value: 'video_input', label: 'Video input', unit: 'second' },
  ],
  character: [
    { value: 'character_input', label: 'Character input', unit: 'character' },
    { value: 'character_output', label: 'Character output', unit: 'character' },
  ],
  mixed: [
    { value: 'token_input', label: 'Token input', unit: 'token' },
    { value: 'token_output', label: 'Token output', unit: 'token' },
    { value: 'cache_read', label: 'Cache read', unit: 'token' },
    { value: 'request', label: 'Request', unit: 'request' },
    { value: 'image_output', label: 'Image output', unit: 'image' },
    { value: 'audio_input', label: 'Audio input', unit: 'second' },
    { value: 'audio_output', label: 'Audio output', unit: 'second' },
    { value: 'video_output', label: 'Video output', unit: 'second' },
    { value: 'character_input', label: 'Character input', unit: 'character' },
  ],
}

const operationOptions = [
  { value: 'any', label: 'Any' },
  { value: 'generate', label: 'Generate' },
  { value: 'edit', label: 'Edit' },
  { value: 'variation', label: 'Variation' },
  { value: 'upscale', label: 'Upscale' },
]

const qualityOptions = [
  { value: 'any', label: 'Any' },
  { value: 'draft', label: 'Draft' },
  { value: 'standard', label: 'Standard' },
  { value: 'high', label: 'High' },
]

const resolutionOptions = [
  { value: 'any', label: 'Any' },
  { value: 'auto', label: 'Auto' },
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
]

const openRouterVideoRates = [
  { resolution: '480p', unitPrice: '0.06726' },
  { resolution: '720p', unitPrice: '0.1512' },
  { resolution: '1080p', unitPrice: '0.3402' },
  { resolution: '4K', unitPrice: '1.361' },
]

function createBusinessRule(mode: string, index: number): BusinessPriceRule {
  const first = componentOptionsByMode[mode]?.[0] ?? {
    value: 'request',
    unit: 'request',
  }
  return {
    id: `rule-${Date.now()}-${index}`,
    name: index === 0 ? 'base' : `tier_${index + 1}`,
    component: first.value,
    unit: first.unit,
    unit_size:
      first.unit === 'character' || first.unit === 'token' ? '1000000' : '1',
    unit_price: '',
    upper_bound: '',
    operation: '',
    quality: '',
    resolution: '',
    with_audio: '',
    billing_event: 'succeeded',
    voice_tier: '',
  }
}

function createOpenRouterVideoRules(): BusinessPriceRule[] {
  const resolutionRules = openRouterVideoRates.map(
    ({ resolution, unitPrice }, index) => ({
      ...createBusinessRule('video_duration', index),
      name: resolution.toLowerCase(),
      resolution,
      unit_price: unitPrice,
    })
  )
  return [
    ...resolutionRules,
    {
      ...createBusinessRule('video_duration', resolutionRules.length),
      name: 'fallback_4k',
      unit_price: openRouterVideoRates.at(-1)?.unitPrice ?? '1.361',
    },
  ]
}

function normalizedBusinessRules(
  mode: string,
  components: Record<string, unknown>,
  priceStructure: string
): BusinessPriceRule[] {
  if (!Array.isArray(components.rules) || components.rules.length === 0) {
    if (priceStructure === 'tiered') {
      return [
        { ...createBusinessRule(mode, 0), upper_bound: '1000' },
        createBusinessRule(mode, 1),
      ]
    }
    if (priceStructure === 'expression') {
      return [createBusinessRule(mode, 0), createBusinessRule(mode, 1)]
    }
    return [createBusinessRule(mode, 0)]
  }
  return (components.rules as Partial<BusinessPriceRule>[]).map(
    (rule, index) => ({
      ...createBusinessRule(mode, index),
      ...rule,
      id: rule.id || `rule-${index + 1}`,
    })
  )
}

function businessRuleExpression(rules: BusinessPriceRule[]): string {
  const usageVariable = (rule: BusinessPriceRule) => {
    if (rule.component === 'token_input') return 'p'
    if (rule.component === 'token_output') return 'c'
    if (rule.component === 'cache_read') return 'cr'
    if (rule.unit === 'image') return 'images'
    if (rule.unit === 'character') return 'chars'
    if (rule.unit === 'second') {
      return rule.component.startsWith('video') ? 'video_s' : 'audio_s'
    }
    return 'req'
  }
  const ruleBody = (rule: BusinessPriceRule) => {
    const divisor = Number(rule.unit_size) > 0 ? rule.unit_size : '1'
    return `tier(${JSON.stringify(rule.name || 'base')}, ${usageVariable(rule)} / ${divisor} * ${rule.unit_price || '0'})`
  }
  const condition = (rule: BusinessPriceRule) => {
    const conditions: string[] = []
    if (rule.upper_bound) {
      conditions.push(`${usageVariable(rule)} <= ${rule.upper_bound}`)
    }
    if (rule.operation) {
      conditions.push(`param("operation") == ${JSON.stringify(rule.operation)}`)
    }
    if (rule.quality) {
      conditions.push(`param("quality") == ${JSON.stringify(rule.quality)}`)
    }
    if (rule.resolution) {
      conditions.push(
        `param("resolution") == ${JSON.stringify(rule.resolution)}`
      )
    }
    if (rule.with_audio) {
      conditions.push(`param("with_audio") == ${rule.with_audio}`)
    }
    return conditions.join(' && ')
  }
  if (rules.length === 0) return 'v2:tier("base", 0)'
  return `v2:${rules
    .map((rule, index) => {
      const when = condition(rule)
      if (index === rules.length - 1) return ruleBody(rule)
      if (!when) return ''
      return `${when} ? ${ruleBody(rule)}`
    })
    .filter(Boolean)
    .join(' : ')}`
}

function priceRuleTitle(
  index: number,
  total: number,
  tiered: boolean,
  translate: (key: string) => string
): string {
  if (index === total - 1) {
    return translate('Default rule')
  }
  return tiered
    ? `${translate('Tier')} ${index + 1}`
    : `${translate('Price rule')} ${index + 1}`
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
      expression_schema_version:
        props.version.billing_mode === 'token' ? 'v1' : 'v2',
    })
  }

  if (
    props.version.billing_mode === 'token' &&
    (props.version.price_structure === 'tiered' ||
      props.version.price_structure === 'expression')
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

  if (props.version.billing_mode !== 'token') {
    const rules = normalizedBusinessRules(
      props.version.billing_mode,
      components,
      props.version.price_structure
    )
    const updateRules = (nextRules: BusinessPriceRule[]) =>
      updateComponents(
        { ...components, schema_version: 'v2', rules: nextRules },
        businessRuleExpression(nextRules)
      )
    const componentOptions = (
      componentOptionsByMode[props.version.billing_mode] ?? []
    ).map((option) => ({ ...option, label: t(option.label) }))
    const showTierConditions = props.version.price_structure === 'tiered'
    const showConditionalFields = props.version.price_structure === 'expression'
    const defaultRule =
      rules.at(-1) ?? createBusinessRule(props.version.billing_mode, 0)
    return (
      <div className='space-y-3'>
        {showTierConditions && (
          <div className='bg-muted/30 rounded-lg border p-3'>
            <p className='text-sm font-medium'>{t('When to use tiers')}</p>
            <p className='text-muted-foreground mt-1 text-sm'>
              {t(
                'Use tiered pricing only when the unit price changes after a usage or context threshold.'
              )}
            </p>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t(
                'Example: the first 1,000 requests use one rate and later requests use another rate.'
              )}
            </p>
          </div>
        )}
        {showConditionalFields && (
          <div className='bg-muted/30 rounded-lg border p-3'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div>
                <p className='text-sm font-medium'>
                  {t('When to use conditional pricing')}
                </p>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {t(
                    'Use conditional pricing when request options such as resolution, quality, operation, or audio change the price.'
                  )}
                </p>
              </div>
              {props.version.billing_mode === 'video_duration' ? (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={() => {
                    const templateRules = createOpenRouterVideoRules()
                    updateComponents(
                      {
                        ...components,
                        schema_version: 'v2',
                        provider_reference: {
                          provider: 'openrouter',
                          billing_basis: 'alternative_reference',
                          video_token_unit_price: '7',
                          price_unit: 'per_1m_video_tokens',
                        },
                        rules: templateRules,
                      },
                      businessRuleExpression(templateRules)
                    )
                  }}
                >
                  {t('Apply OpenRouter video template')}
                </Button>
              ) : null}
            </div>
            {props.version.billing_mode === 'video_duration' ? (
              <p className='text-muted-foreground mt-2 text-xs'>
                {t(
                  'The template bills by video seconds and resolution. Audio is included, and unknown resolutions use the conservative 4K rate.'
                )}
              </p>
            ) : null}
          </div>
        )}
        {!showTierConditions && !showConditionalFields && (
          <p className='text-muted-foreground text-sm'>
            {t(
              'Add one row for each billable operation or market price variant.'
            )}
          </p>
        )}
        {showTierConditions && (
          <p className='text-muted-foreground text-sm'>
            {t(
              'Each row is a pricing tier. Conditions are evaluated in order, and the final row acts as the default tier.'
            )}
          </p>
        )}
        {showConditionalFields && (
          <p className='text-muted-foreground text-sm'>
            {t(
              'Configure common conditions below. The final row is used when no earlier rule matches.'
            )}
          </p>
        )}
        {rules.map((rule, index) => (
          <div key={rule.id} className='space-y-3 rounded-lg border p-3'>
            <div className='flex items-center justify-between gap-3'>
              <p className='font-medium'>
                {priceRuleTitle(index, rules.length, showTierConditions, t)}
              </p>
              <Button
                type='button'
                size='icon'
                variant='ghost'
                disabled={rules.length === 1}
                aria-label={t('Delete price rule')}
                onClick={() =>
                  updateRules(
                    rules.filter((_, ruleIndex) => ruleIndex !== index)
                  )
                }
              >
                <Trash2 />
              </Button>
            </div>
            <FieldGroup className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              {showTierConditions ? (
                <Field>
                  <FieldLabel>{t('Tier name')}</FieldLabel>
                  <Input
                    value={rule.name}
                    onChange={(event) => {
                      const next = [...rules]
                      next[index] = { ...rule, name: event.target.value }
                      updateRules(next)
                    }}
                  />
                </Field>
              ) : null}
              <Field>
                <FieldLabel>{t('Billing component')}</FieldLabel>
                <Select
                  items={componentOptions}
                  value={rule.component}
                  onValueChange={(value) => {
                    if (!value) return
                    const option = componentOptions.find(
                      (item) => item.value === value
                    )
                    const next = [...rules]
                    next[index] = {
                      ...rule,
                      component: value,
                      unit: option?.unit ?? rule.unit,
                      unit_size:
                        option?.unit === 'character' || option?.unit === 'token'
                          ? '1000000'
                          : '1',
                    }
                    updateRules(next)
                  }}
                >
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {componentOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t('Billing unit')}</FieldLabel>
                <Input value={t(rule.unit)} disabled />
              </Field>
              <Field>
                <FieldLabel>{t('Units per price')}</FieldLabel>
                <Input
                  type='number'
                  min={1}
                  step={1}
                  value={rule.unit_size}
                  onChange={(event) => {
                    const next = [...rules]
                    next[index] = { ...rule, unit_size: event.target.value }
                    updateRules(next)
                  }}
                />
              </Field>
              <Field>
                <FieldLabel>{t('Unit price')}</FieldLabel>
                <Input
                  type='number'
                  min={0}
                  step='any'
                  required
                  value={rule.unit_price}
                  onChange={(event) => {
                    const next = [...rules]
                    next[index] = { ...rule, unit_price: event.target.value }
                    updateRules(next)
                  }}
                />
              </Field>
              {showTierConditions && index < rules.length - 1 ? (
                <Field>
                  <FieldLabel>{t('Usage upper bound')}</FieldLabel>
                  <Input
                    type='number'
                    min={0}
                    step='any'
                    required
                    value={rule.upper_bound}
                    placeholder={t('No limit')}
                    onChange={(event) => {
                      const next = [...rules]
                      next[index] = {
                        ...rule,
                        upper_bound: event.target.value,
                      }
                      updateRules(next)
                    }}
                  />
                </Field>
              ) : null}
              {index < rules.length - 1 &&
              showConditionalFields &&
              (props.version.billing_mode === 'image' ||
                props.version.billing_mode === 'video_duration' ||
                props.version.billing_mode === 'mixed') ? (
                <>
                  <Field>
                    <FieldLabel>{t('Operation')}</FieldLabel>
                    <Select
                      items={operationOptions.map((option) => ({
                        ...option,
                        label: t(option.label),
                      }))}
                      value={rule.operation || 'any'}
                      onValueChange={(value) => {
                        if (!value) return
                        const next = [...rules]
                        next[index] = {
                          ...rule,
                          operation: value === 'any' ? '' : value,
                        }
                        updateRules(next)
                      }}
                    >
                      <SelectTrigger
                        className='w-full'
                        aria-label={t('Operation')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {operationOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.label)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>{t('Quality')}</FieldLabel>
                    <Select
                      items={qualityOptions.map((option) => ({
                        ...option,
                        label: t(option.label),
                      }))}
                      value={rule.quality || 'any'}
                      onValueChange={(value) => {
                        if (!value) return
                        const next = [...rules]
                        next[index] = {
                          ...rule,
                          quality: value === 'any' ? '' : value,
                        }
                        updateRules(next)
                      }}
                    >
                      <SelectTrigger
                        className='w-full'
                        aria-label={t('Quality')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {qualityOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.label)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>{t('Resolution')}</FieldLabel>
                    <Select
                      items={resolutionOptions.map((option) => ({
                        ...option,
                        label: t(option.label),
                      }))}
                      value={rule.resolution || 'any'}
                      onValueChange={(value) => {
                        if (!value) return
                        const next = [...rules]
                        next[index] = {
                          ...rule,
                          resolution: value === 'any' ? '' : value,
                        }
                        updateRules(next)
                      }}
                    >
                      <SelectTrigger
                        className='w-full'
                        aria-label={t('Resolution')}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {resolutionOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.label)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              ) : null}
              {index < rules.length - 1 &&
              showConditionalFields &&
              (props.version.billing_mode === 'video_duration' ||
                props.version.billing_mode === 'mixed') ? (
                <Field>
                  <FieldLabel>{t('Audio option')}</FieldLabel>
                  <Select
                    items={[
                      { value: 'any', label: t('Any') },
                      { value: 'true', label: t('With audio') },
                      { value: 'false', label: t('Without audio') },
                    ]}
                    value={rule.with_audio || 'any'}
                    onValueChange={(value) => {
                      if (!value) return
                      const next = [...rules]
                      next[index] = {
                        ...rule,
                        with_audio: value === 'any' ? '' : value,
                      }
                      updateRules(next)
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value='any'>{t('Any')}</SelectItem>
                        <SelectItem value='true'>{t('With audio')}</SelectItem>
                        <SelectItem value='false'>
                          {t('Without audio')}
                        </SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ) : null}
            </FieldGroup>
          </div>
        ))}
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={() =>
            updateRules(
              rules.length === 0
                ? [createBusinessRule(props.version.billing_mode, 0)]
                : [
                    ...rules.slice(0, -1),
                    createBusinessRule(
                      props.version.billing_mode,
                      rules.length
                    ),
                    defaultRule,
                  ]
            )
          }
        >
          <Plus data-icon='inline-start' />
          {showTierConditions ? t('Add tier') : t('Add price rule')}
        </Button>
        {showConditionalFields ? (
          <details className='rounded-lg border'>
            <summary className='cursor-pointer px-3 py-2 text-sm font-medium'>
              {t('Advanced expression')}
            </summary>
            <div className='space-y-3 border-t p-3'>
              <p className='text-muted-foreground text-xs'>
                {t(
                  'Only edit the generated expression when the visual rules cannot describe the provider price.'
                )}
              </p>
              <Field>
                <FieldLabel htmlFor='official-custom-expression'>
                  {t('Billing Expression')}
                </FieldLabel>
                <Textarea
                  id='official-custom-expression'
                  className='min-h-36 font-mono text-xs'
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
          </details>
        ) : null}
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
