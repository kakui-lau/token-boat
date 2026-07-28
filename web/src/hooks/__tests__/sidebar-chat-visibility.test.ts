// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { ROLE } from '@/lib/roles'

import { useSidebarView } from '../use-sidebar-view'

let currentUserRole: number = ROLE.USER
let sidebarModulesAdmin: string | undefined

vi.mock('@tanstack/react-router', () => ({
  useLocation: ({
    select,
  }: {
    select: (location: { pathname: string }) => unknown
  }) => select({ pathname: '/dashboard/overview' }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/hooks/use-status', () => ({
  useStatus: () => ({
    status: sidebarModulesAdmin
      ? { SidebarModulesAdmin: sidebarModulesAdmin }
      : undefined,
  }),
}))

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (
    selector?: (state: {
      auth: {
        user: {
          role: number
          permissions: Record<string, boolean>
          sidebar_modules: string
        }
      }
    }) => unknown
  ) => {
    const state = {
      auth: {
        user: {
          role: currentUserRole,
          permissions: {},
          sidebar_modules: '',
        },
      },
    }

    return selector ? selector(state) : state
  },
}))

describe('sidebar chat preset visibility', () => {
  beforeEach(() => {
    currentUserRole = ROLE.USER
    sidebarModulesAdmin = undefined
  })

  test('hides configured chat clients from non-admin users', () => {
    const { result } = renderHook(() => useSidebarView())

    const chatGroup = result.current.navGroups.find(
      (group) => group.id === 'chat'
    )

    expect(chatGroup?.items).toHaveLength(1)
    expect(chatGroup?.items[0]).toMatchObject({
      title: 'Playground',
      url: '/playground',
    })
  })

  test('shows configured chat clients to admin users', () => {
    currentUserRole = ROLE.ADMIN

    const { result } = renderHook(() => useSidebarView())
    const chatGroup = result.current.navGroups.find(
      (group) => group.id === 'chat'
    )

    expect(chatGroup?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: 'Chat',
          type: 'chat-presets',
        }),
      ])
    )
  })

  test('keeps root-only pricing entries visible when channel navigation is disabled', () => {
    currentUserRole = ROLE.SUPER_ADMIN
    sidebarModulesAdmin = JSON.stringify({
      admin: {
        enabled: true,
        channel: false,
      },
    })

    const { result } = renderHook(() => useSidebarView())
    const adminGroup = result.current.navGroups.find(
      (group) => group.id === 'admin'
    )

    expect(adminGroup?.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: '/official-pricing' }),
        expect.objectContaining({ url: '/pricing-admin' }),
      ])
    )
  })

  test('hides root-only pricing entries from ordinary admins', () => {
    currentUserRole = ROLE.ADMIN

    const { result } = renderHook(() => useSidebarView())
    const adminGroup = result.current.navGroups.find(
      (group) => group.id === 'admin'
    )

    expect(adminGroup?.items).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: '/official-pricing' }),
        expect.objectContaining({ url: '/pricing-admin' }),
      ])
    )
  })
})
