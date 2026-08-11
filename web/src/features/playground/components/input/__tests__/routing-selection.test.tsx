// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { PlaygroundInputControls } from '../playground-input-controls'

vi.mock('@/components/model-group-selector', () => ({
  ModelGroupSelector: () => <div>model-group-selector</div>,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const baseProps = {
  channels: [{ label: 'Official · #14', value: 14 }],
  channelValue: null,
  disabled: false,
  groups: [{ label: 'default', value: 'default', ratio: 1 }],
  groupValue: 'default',
  isAdmin: true,
  isGenerating: false,
  isModelLoading: false,
  models: [{ label: 'gpt-4o', value: 'gpt-4o' }],
  modelValue: 'gpt-4o',
  onChannelChange: vi.fn(),
  onGroupChange: vi.fn(),
  onModelChange: vi.fn(),
  onStop: vi.fn(),
  text: '',
  tools: null,
}

afterEach(cleanup)

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })
})

describe('Playground routing selection', () => {
  it('shows automatic routing as the admin default', () => {
    render(<PlaygroundInputControls {...baseProps} />)

    expect(
      screen.getAllByRole('combobox', { name: 'Routing channel' })[0]
        .textContent
    ).toContain('Automatic routing')
  })

  it('does not expose channel selection to a common user', () => {
    render(<PlaygroundInputControls {...baseProps} isAdmin={false} />)

    expect(
      screen.queryByRole('combobox', { name: 'Routing channel' })
    ).toBeNull()
  })
})
