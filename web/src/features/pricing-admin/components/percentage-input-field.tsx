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
import type {
  FieldError as HookFormFieldError,
  UseFormRegisterReturn,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'

type PercentageInputFieldProps = {
  id: string
  label: string
  description?: string
  registration: UseFormRegisterReturn
  error?: HookFormFieldError
}

export function PercentageInputField(props: PercentageInputFieldProps) {
  const { t } = useTranslation()
  return (
    <Field data-invalid={Boolean(props.error)}>
      <FieldLabel htmlFor={props.id}>{t(props.label)}</FieldLabel>
      {props.description ? (
        <FieldDescription>{t(props.description)}</FieldDescription>
      ) : null}
      <InputGroup>
        <InputGroupInput
          id={props.id}
          type='number'
          inputMode='decimal'
          min='0'
          max='99.999999999999'
          step='any'
          placeholder='0'
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
