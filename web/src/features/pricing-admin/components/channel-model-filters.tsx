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
import { Search01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'

import type { ChannelModelFilterValues } from '../lib/channel-model-filters'

type ChannelModelFiltersProps = {
  value: ChannelModelFilterValues
  channels: Array<{ id: number; name: string }>
  onChange: (value: ChannelModelFilterValues) => void
  idPrefix: string
}

export function ChannelModelFilters(props: ChannelModelFiltersProps) {
  const { t } = useTranslation()

  return (
    <FieldGroup className='flex-row flex-wrap items-end gap-3'>
      <Field className='max-w-md'>
        <FieldLabel htmlFor={`${props.idPrefix}-search`} className='sr-only'>
          {t('Search channels or models')}
        </FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <HugeiconsIcon
              icon={Search01Icon}
              strokeWidth={2}
              aria-hidden='true'
            />
          </InputGroupAddon>
          <InputGroupInput
            id={`${props.idPrefix}-search`}
            value={props.value.keyword}
            placeholder={t('Search channels or models')}
            onChange={(event) =>
              props.onChange({
                ...props.value,
                keyword: event.target.value,
              })
            }
          />
        </InputGroup>
      </Field>
      <Field className='w-auto'>
        <FieldLabel htmlFor={`${props.idPrefix}-channel`}>
          {t('Channel')}
        </FieldLabel>
        <NativeSelect
          id={`${props.idPrefix}-channel`}
          className='w-48'
          value={props.value.channelId}
          onChange={(event) =>
            props.onChange({
              ...props.value,
              channelId: event.target.value,
            })
          }
        >
          <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
          {props.channels.map((channel) => (
            <NativeSelectOption key={channel.id} value={String(channel.id)}>
              {channel.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </Field>
      <Field className='w-auto'>
        <FieldLabel htmlFor={`${props.idPrefix}-status`}>
          {t('Status')}
        </FieldLabel>
        <NativeSelect
          id={`${props.idPrefix}-status`}
          className='w-36'
          value={props.value.status}
          onChange={(event) =>
            props.onChange({
              ...props.value,
              status: event.target.value,
            })
          }
        >
          <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
          <NativeSelectOption value='1'>{t('Enabled')}</NativeSelectOption>
          <NativeSelectOption value='0'>{t('Disabled')}</NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field className='w-auto'>
        <FieldLabel htmlFor={`${props.idPrefix}-routing`}>
          {t('Routing')}
        </FieldLabel>
        <NativeSelect
          id={`${props.idPrefix}-routing`}
          className='w-44'
          value={props.value.routingStatus}
          onChange={(event) =>
            props.onChange({
              ...props.value,
              routingStatus: event.target.value,
            })
          }
        >
          <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
          <NativeSelectOption value='available'>
            {t('Available')}
          </NativeSelectOption>
          <NativeSelectOption value='removed'>
            {t('Removed from channel')}
          </NativeSelectOption>
        </NativeSelect>
      </Field>
      <Field className='w-auto'>
        <FieldLabel htmlFor={`${props.idPrefix}-purchase-status`}>
          {t('Purchase Status')}
        </FieldLabel>
        <NativeSelect
          id={`${props.idPrefix}-purchase-status`}
          className='w-40'
          value={props.value.purchaseStatus}
          onChange={(event) =>
            props.onChange({
              ...props.value,
              purchaseStatus: event.target.value,
            })
          }
        >
          <NativeSelectOption value=''>{t('All')}</NativeSelectOption>
          <NativeSelectOption value='published'>
            {t('Published')}
          </NativeSelectOption>
          <NativeSelectOption value='unpublished'>
            {t('Not Published')}
          </NativeSelectOption>
        </NativeSelect>
      </Field>
    </FieldGroup>
  )
}
