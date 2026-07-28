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
import { createFileRoute, redirect } from '@tanstack/react-router'
import z from 'zod'

import { OfficialPricing } from '@/features/official-pricing'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

const officialPricingSearchSchema = z.object({
  modelId: z.coerce.number().int().positive().optional().catch(undefined),
})

export const Route = createFileRoute('/_authenticated/official-pricing/')({
  beforeLoad: () => {
    const { auth } = useAuthStore.getState()
    if (!auth.user || auth.user.role !== ROLE.SUPER_ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  validateSearch: officialPricingSearchSchema,
  component: OfficialPricingRoute,
})

function OfficialPricingRoute() {
  const search = Route.useSearch()
  return (
    <OfficialPricing
      key={search.modelId ?? 'official-pricing'}
      initialModelId={search.modelId}
    />
  )
}
