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
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'

import type { SalesPriceBookItem } from '../types'

type EditPriceItemDialogProps = {
  item?: SalesPriceBookItem
  pending: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (item: SalesPriceBookItem) => void
}

export function EditPriceItemDialog(props: EditPriceItemDialogProps) {
  const { t } = useTranslation()
  const [pricingMethod, setPricingMethod] = useState('manual')
  const [priceComponents, setPriceComponents] = useState('')
  const [salesBillingExpr, setSalesBillingExpr] = useState('')
  const [remark, setRemark] = useState('')

  useEffect(() => {
    setPricingMethod(props.item?.pricing_method ?? 'manual')
    setPriceComponents(props.item?.price_components ?? '')
    setSalesBillingExpr(props.item?.sales_billing_expr ?? '')
    setRemark(props.item?.remark ?? '')
  }, [props.item])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!props.item || !salesBillingExpr.trim()) return
    props.onSubmit({
      ...props.item,
      pricing_method: pricingMethod,
      price_components: priceComponents.trim(),
      sales_billing_expr: salesBillingExpr.trim(),
      remark: remark.trim(),
    })
  }

  return (
    <Dialog open={Boolean(props.item)} onOpenChange={props.onOpenChange}>
      <DialogContent className='sm:max-w-3xl'>
        <form onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t('Edit model sales price')}</DialogTitle>
            <DialogDescription>
              {t('Edit the draft price contract for {{model}}.', {
                model: props.item?.model_name ?? '',
              })}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className='py-5'>
            <Field>
              <FieldLabel htmlFor='sales-price-method'>
                {t('Pricing method')}
              </FieldLabel>
              <NativeSelect
                id='sales-price-method'
                value={pricingMethod}
                onChange={(event) => setPricingMethod(event.target.value)}
              >
                <NativeSelectOption value='manual'>
                  {t('Manual')}
                </NativeSelectOption>
                <NativeSelectOption value='fixed'>
                  {t('Fixed')}
                </NativeSelectOption>
                <NativeSelectOption value='cost_plus'>
                  {t('Cost plus')}
                </NativeSelectOption>
                <NativeSelectOption value='official_discount'>
                  {t('Official discount')}
                </NativeSelectOption>
              </NativeSelect>
            </Field>
            <Field>
              <FieldLabel htmlFor='sales-price-components'>
                {t('Price components')}
              </FieldLabel>
              <Textarea
                id='sales-price-components'
                className='min-h-28 font-mono text-xs'
                value={priceComponents}
                onChange={(event) => setPriceComponents(event.target.value)}
                required
              />
              <FieldDescription>
                {t('JSON component values must match the billing expression.')}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor='sales-billing-expression'>
                {t('Sales expression')}
              </FieldLabel>
              <Textarea
                id='sales-billing-expression'
                className='min-h-36 font-mono text-xs'
                value={salesBillingExpr}
                onChange={(event) => setSalesBillingExpr(event.target.value)}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor='sales-price-item-remark'>
                {t('Remark')}
              </FieldLabel>
              <Textarea
                id='sales-price-item-remark'
                value={remark}
                onChange={(event) => setRemark(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type='button'
              variant='outline'
              onClick={() => props.onOpenChange(false)}
            >
              {t('Cancel')}
            </Button>
            <Button
              type='submit'
              disabled={props.pending || !salesBillingExpr.trim()}
            >
              {props.pending ? <Spinner data-icon='inline-start' /> : null}
              {t('Save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
