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

import { calculateVariableCostPercentage } from './variable-cost-rate'

const requiredPercentage = z
  .string()
  .trim()
  .refine(
    (value) =>
      /^\d+(\.\d+)?$/.test(value) && Number(value) >= 0 && Number(value) < 100,
    'Enter a percentage from 0 to less than 100'
  )

export const salesPriceGeneratorSchema = z
  .object({
    payment_processing_fee_rate: requiredPercentage,
    distribution_fee_rate: requiredPercentage,
    operations_labor_cost_rate: requiredPercentage,
    effective_tax_rate: requiredPercentage,
    target_net_margin: requiredPercentage,
  })
  .superRefine((value, context) => {
    const totalVariableCostPercentage = calculateVariableCostPercentage([
      value.payment_processing_fee_rate,
      value.distribution_fee_rate,
      value.operations_labor_cost_rate,
    ])
    if (!totalVariableCostPercentage) return

    const variableCostRate = Number(totalVariableCostPercentage) / 100
    if (variableCostRate >= 1) {
      context.addIssue({
        code: 'custom',
        path: ['operations_labor_cost_rate'],
        message: 'The combined variable cost rate must be less than 100%.',
      })
      return
    }

    const taxRate = Number(value.effective_tax_rate) / 100
    const targetMargin = Number(value.target_net_margin) / 100
    const denominator = (1 - variableCostRate) * (1 - taxRate) - targetMargin
    if (denominator > 0) return

    context.addIssue({
      code: 'custom',
      path: ['target_net_margin'],
      message: 'The configured rates produce an invalid sales price.',
    })
  })

export type SalesPriceGeneratorForm = z.infer<typeof salesPriceGeneratorSchema>
