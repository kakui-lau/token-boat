// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'

import { ROLE } from '@/lib/roles'

import { useSidebarView } from '../use-sidebar-view'

let currentUserRole: number = ROLE.USER

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
  useStatus: () => ({ status: undefined }),
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
})
