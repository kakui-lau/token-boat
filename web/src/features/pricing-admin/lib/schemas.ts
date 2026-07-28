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
import z from 'zod'

const optionalNonNegativeDecimal = z
  .string()
  .trim()
  .refine(
    (value) =>
      value === '' ||
      (/^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value))),
    'Enter a non-negative decimal'
  )

const requiredRate = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^\d+(\.\d+)?$/.test(value) && Number(value) >= 0 && Number(value) < 1,
    'Enter a rate from 0 to less than 1'
  )

export const officialPriceSchema = z
  .object({
    currency: z.string().trim().min(1),
    input_unit_price: optionalNonNegativeDecimal,
    output_unit_price: optionalNonNegativeDecimal,
    cache_read_unit_price: optionalNonNegativeDecimal,
    cache_write_unit_price: optionalNonNegativeDecimal,
    image_input_unit_price: optionalNonNegativeDecimal,
    image_output_unit_price: optionalNonNegativeDecimal,
    audio_input_unit_price: optionalNonNegativeDecimal,
    audio_output_unit_price: optionalNonNegativeDecimal,
    remark: z.string().trim(),
  })
  .refine(
    (value) =>
      Boolean(
        value.input_unit_price ||
        value.output_unit_price ||
        value.cache_read_unit_price ||
        value.cache_write_unit_price ||
        value.image_input_unit_price ||
        value.image_output_unit_price ||
        value.audio_input_unit_price ||
        value.audio_output_unit_price
      ),
    {
      message: 'Enter at least one unit price',
      path: ['input_unit_price'],
    }
  )

export const purchasePriceSchema = z
  .object({
    pricing_mode: z.enum([
      'official_ratio',
      'component_ratio',
      'fixed_unit_price',
    ]),
    official_price_version_id: z.string(),
    purchase_discount: optionalNonNegativeDecimal,
    input_discount: optionalNonNegativeDecimal,
    output_discount: optionalNonNegativeDecimal,
    cache_read_discount: optionalNonNegativeDecimal,
    cache_write_discount: optionalNonNegativeDecimal,
    image_input_discount: optionalNonNegativeDecimal,
    image_output_discount: optionalNonNegativeDecimal,
    audio_input_discount: optionalNonNegativeDecimal,
    audio_output_discount: optionalNonNegativeDecimal,
    input_unit_price: optionalNonNegativeDecimal,
    output_unit_price: optionalNonNegativeDecimal,
    cache_read_unit_price: optionalNonNegativeDecimal,
    cache_write_unit_price: optionalNonNegativeDecimal,
    image_input_unit_price: optionalNonNegativeDecimal,
    image_output_unit_price: optionalNonNegativeDecimal,
    audio_input_unit_price: optionalNonNegativeDecimal,
    audio_output_unit_price: optionalNonNegativeDecimal,
    quote_reference: z.string().trim(),
    contract_reference: z.string().trim(),
    remark: z.string().trim(),
  })
  .superRefine((value, context) => {
    if (
      value.pricing_mode !== 'fixed_unit_price' &&
      !value.official_price_version_id
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Select an official price version',
        path: ['official_price_version_id'],
      })
    }
    if (value.pricing_mode === 'official_ratio' && !value.purchase_discount) {
      context.addIssue({
        code: 'custom',
        message: 'Enter the purchase discount',
        path: ['purchase_discount'],
      })
    }
    if (
      value.pricing_mode === 'fixed_unit_price' &&
      !value.input_unit_price &&
      !value.output_unit_price &&
      !value.cache_read_unit_price &&
      !value.cache_write_unit_price &&
      !value.image_input_unit_price &&
      !value.image_output_unit_price &&
      !value.audio_input_unit_price &&
      !value.audio_output_unit_price
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Enter at least one unit price',
        path: ['input_unit_price'],
      })
    }
    if (
      value.pricing_mode === 'component_ratio' &&
      !value.input_discount &&
      !value.output_discount &&
      !value.cache_read_discount &&
      !value.cache_write_discount &&
      !value.image_input_discount &&
      !value.image_output_discount &&
      !value.audio_input_discount &&
      !value.audio_output_discount
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Enter at least one component discount',
        path: ['input_discount'],
      })
    }
  })

export const retailPriceSchema = z.object({
  purchase_price_version_id: z
    .string()
    .min(1, 'Select a purchase price version'),
  total_variable_cost_rate: requiredRate,
  effective_tax_rate: requiredRate,
  target_net_margin: requiredRate,
  minimum_margin_rate: requiredRate,
  remark: z.string().trim(),
})

export type OfficialPriceForm = z.infer<typeof officialPriceSchema>
export type PurchasePriceForm = z.infer<typeof purchasePriceSchema>
export type RetailPriceForm = z.infer<typeof retailPriceSchema>
