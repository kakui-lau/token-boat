import { createFileRoute, redirect } from '@tanstack/react-router'

import { CircuitAnalysisPage } from '@/features/circuit-analysis'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/circuit-analysis/')({
  beforeLoad: () => {
    const user = useAuthStore.getState().auth.user
    if (!user || user.role !== ROLE.SUPER_ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: CircuitAnalysisPage,
})
