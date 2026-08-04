import { createFileRoute, redirect } from '@tanstack/react-router'

import { CircuitAnalysisPage } from '@/features/circuit-analysis'
import {
  ADMIN_PERMISSION_ACTIONS,
  ADMIN_PERMISSION_RESOURCES,
  hasPermission,
} from '@/lib/admin-permissions'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/circuit-analysis/')({
  beforeLoad: () => {
    const user = useAuthStore.getState().auth.user
    if (
      !hasPermission(
        user,
        ADMIN_PERMISSION_RESOURCES.PRICING_GOVERNANCE,
        ADMIN_PERMISSION_ACTIONS.READ
      )
    ) {
      throw redirect({ to: '/403' })
    }
  },
  component: CircuitAnalysisPage,
})
