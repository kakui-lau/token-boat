/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { createFileRoute, redirect } from '@tanstack/react-router'

import { ChannelMonthlyUsagePage } from '@/features/channel-monthly-usage'
import { ROLE } from '@/lib/roles'
import { useAuthStore } from '@/stores/auth-store'

export const Route = createFileRoute('/_authenticated/channel-monthly-usage/')({
  beforeLoad: () => {
    const user = useAuthStore.getState().auth.user
    if (!user || user.role < ROLE.ADMIN) {
      throw redirect({ to: '/403' })
    }
  },
  component: ChannelMonthlyUsagePage,
})
