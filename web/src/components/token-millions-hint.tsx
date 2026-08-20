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
import { formatTokenMillions } from '@/lib/format'
import { cn } from '@/lib/utils'

/**
 * Renders a small muted hint converting a token count into millions (M).
 * Renders nothing when the value is below 1M.
 */
export function TokenMillionsHint(props: {
  tokens: number | null | undefined
  className?: string
}) {
  const hint = formatTokenMillions(props.tokens)
  if (!hint) return null
  return (
    <span
      className={cn(
        'text-muted-foreground ml-1.5 align-middle text-xs font-normal',
        props.className
      )}
    >
      ≈ {hint}
    </span>
  )
}
