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
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

import { createOfficialFlatDraft } from '../api'
import { officialPriceSchema, type OfficialPriceForm } from '../lib/schemas'
import type { OfficialPriceVersion } from '../types'
import { PriceInputField } from './price-input-field'
import { VersionList } from './version-list'

type OfficialPricePanelProps = {
  modelId: number
  versions: OfficialPriceVersion[]
  isPublishing: boolean
  onPublish: (id: number) => void
  onCreated: () => Promise<void>
}

export function OfficialPricePanel(props: OfficialPricePanelProps) {
  const { t } = useTranslation()
  const form = useForm<OfficialPriceForm>({
    resolver: zodResolver(officialPriceSchema),
    defaultValues: {
      currency: 'USD',
      input_unit_price: '',
      output_unit_price: '',
      cache_read_unit_price: '',
      cache_write_unit_price: '',
      remark: '',
    },
  })
  const createMutation = useMutation({
    mutationFn: (value: OfficialPriceForm) =>
      createOfficialFlatDraft({
        model_id: props.modelId,
        currency: value.currency,
        prices: {
          input_unit_price: value.input_unit_price,
          output_unit_price: value.output_unit_price,
          cache_read_unit_price: value.cache_read_unit_price,
          cache_write_unit_price: value.cache_write_unit_price,
        },
        remark: value.remark,
      }),
    onSuccess: async () => {
      form.reset()
      await props.onCreated()
      toast.success(t('Official price draft created'))
    },
  })

  return (
    <div className='space-y-6'>
      <form
        className='space-y-4 rounded-lg border p-4'
        onSubmit={form.handleSubmit((value) => createMutation.mutate(value))}
      >
        <h3 className='font-medium'>{t('Create official price draft')}</h3>
        <FieldGroup className='grid gap-4 sm:grid-cols-2'>
          <Field>
            <FieldLabel htmlFor='official-currency'>{t('Currency')}</FieldLabel>
            <Input
              id='official-currency'
              maxLength={8}
              {...form.register('currency')}
            />
          </Field>
          <PriceInputField
            id='official-input-price'
            label='Input price per 1M tokens'
            registration={form.register('input_unit_price')}
            error={form.formState.errors.input_unit_price}
          />
          <PriceInputField
            id='official-output-price'
            label='Output price per 1M tokens'
            registration={form.register('output_unit_price')}
            error={form.formState.errors.output_unit_price}
          />
          <PriceInputField
            id='official-cache-read-price'
            label='Cache read price per 1M tokens'
            registration={form.register('cache_read_unit_price')}
            error={form.formState.errors.cache_read_unit_price}
          />
          <PriceInputField
            id='official-cache-write-price'
            label='Cache write price per 1M tokens'
            registration={form.register('cache_write_unit_price')}
            error={form.formState.errors.cache_write_unit_price}
          />
        </FieldGroup>
        <Field>
          <FieldLabel htmlFor='official-remark'>{t('Remark')}</FieldLabel>
          <Textarea id='official-remark' {...form.register('remark')} />
        </Field>
        <Button type='submit' disabled={createMutation.isPending}>
          {t('Save Draft')}
        </Button>
      </form>

      <section className='space-y-3'>
        <h3 className='font-medium'>{t('Official price versions')}</h3>
        <VersionList
          items={props.versions}
          isPublishing={props.isPublishing}
          onPublish={props.onPublish}
        />
      </section>
    </div>
  )
}
