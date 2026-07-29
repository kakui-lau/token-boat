/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type {
  FieldError as HookFormFieldError,
  UseFormRegisterReturn,
} from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'

type DiscountInputFieldProps = {
  id: string
  label: string
  registration: UseFormRegisterReturn
  error?: HookFormFieldError
}

export function DiscountInputField(props: DiscountInputFieldProps) {
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
          step='any'
          placeholder='7'
          aria-invalid={Boolean(props.error)}
          {...props.registration}
        />
        <InputGroupAddon align='inline-end'>
          {t('Discount tenths unit')}
        </InputGroupAddon>
      </InputGroup>
      {props.error?.message ? (
        <FieldError>{t(props.error.message)}</FieldError>
      ) : null}
    </Field>
  )
}
