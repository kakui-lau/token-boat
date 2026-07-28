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

import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type PriceInputFieldProps = {
  id: string
  label: string
  registration: UseFormRegisterReturn
  error?: HookFormFieldError
  placeholder?: string
}

export function PriceInputField(props: PriceInputFieldProps) {
  const { t } = useTranslation()
  return (
    <Field data-invalid={Boolean(props.error)}>
      <FieldLabel htmlFor={props.id}>{t(props.label)}</FieldLabel>
      <Input
        id={props.id}
        inputMode='decimal'
        placeholder={props.placeholder}
        aria-invalid={Boolean(props.error)}
        {...props.registration}
      />
      {props.error?.message ? (
        <FieldError>{t(props.error.message)}</FieldError>
      ) : null}
    </Field>
  )
}
