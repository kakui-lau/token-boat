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

export const percentageErrorKey = 'Enter a percentage from 0 to 100.'

const percentageSchema = z
  .number({ error: percentageErrorKey })
  .finite(percentageErrorKey)
  .min(0, percentageErrorKey)
  .max(100, percentageErrorKey)

export const salesDiscountCalculatorSchema = z.object({
  purchaseDiscount: percentageSchema,
  paymentFee: percentageSchema,
  distributionFee: percentageSchema,
  laborCost: percentageSchema,
  profitTaxRate: percentageSchema,
  targetNetMargin: percentageSchema,
})

export type SalesDiscountCalculatorValues = z.infer<
  typeof salesDiscountCalculatorSchema
>

export const defaultSalesDiscountCalculatorValues: SalesDiscountCalculatorValues =
  {
    purchaseDiscount: 70,
    paymentFee: 4,
    distributionFee: 5,
    laborCost: 2,
    profitTaxRate: 16,
    targetNetMargin: 3,
  }

export type SalesDiscountCalculation =
  | {
      status: 'valid'
      variableCostRate: number
      sellingFactor: number
      salesDiscount: number
      purchaseMarkupRate: number
    }
  | {
      status: 'invalid_input' | 'non_positive_denominator'
      variableCostRate: number
    }

export function calculateVariableCostRate(
  values: Pick<
    SalesDiscountCalculatorValues,
    'paymentFee' | 'distributionFee' | 'laborCost'
  >
): number {
  return values.paymentFee + values.distributionFee + values.laborCost
}

export function calculateSalesDiscount(
  values: SalesDiscountCalculatorValues
): SalesDiscountCalculation {
  const variableCostRate = calculateVariableCostRate(values)
  const percentages = [
    values.purchaseDiscount,
    values.paymentFee,
    values.distributionFee,
    values.laborCost,
    values.profitTaxRate,
    values.targetNetMargin,
  ]
  if (
    percentages.some(
      (value) => !Number.isFinite(value) || value < 0 || value > 100
    )
  ) {
    return { status: 'invalid_input', variableCostRate }
  }

  const vcr = variableCostRate / 100
  const taxRate = values.profitTaxRate / 100
  const targetMargin = values.targetNetMargin / 100
  const taxTerm = 1 - taxRate
  const denominator = (1 - vcr) * taxTerm - targetMargin
  if (denominator <= 0) {
    return { status: 'non_positive_denominator', variableCostRate }
  }

  const sellingFactor = taxTerm / denominator
  return {
    status: 'valid',
    variableCostRate,
    sellingFactor,
    salesDiscount: (values.purchaseDiscount / 100) * sellingFactor,
    purchaseMarkupRate: sellingFactor - 1,
  }
}
