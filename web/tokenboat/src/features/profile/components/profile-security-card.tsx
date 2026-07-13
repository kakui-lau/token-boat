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
import { Shield, Key, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { TitledCard } from '@/components/ui/titled-card'
import { useDialogs } from '@/hooks/use-dialog'

import type { UserProfile } from '../types'
import { AccessTokenDialog } from './dialogs/access-token-dialog'
import { ChangePasswordDialog } from './dialogs/change-password-dialog'
import { DeleteAccountDialog } from './dialogs/delete-account-dialog'

// ============================================================================
// Profile Security Card Component
// ============================================================================

interface ProfileSecurityCardProps {
  profile: UserProfile | null
  loading: boolean
}

type DialogKey = 'password' | 'token' | 'delete'

export function ProfileSecurityCard({
  profile,
  loading,
}: ProfileSecurityCardProps) {
  const { t } = useTranslation()
  const dialogs = useDialogs<DialogKey>()

  if (loading) {
    return (
      <Card data-card-hover='false' className='gap-0 overflow-hidden py-0'>
        <CardHeader className='border-b p-3 !pb-3 sm:p-5 sm:!pb-5'>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='mt-2 h-4 w-48' />
        </CardHeader>
        <CardContent className='space-y-3 p-3 sm:p-5'>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className='h-16 w-full' />
          ))}
        </CardContent>
      </Card>
    )
  }

  if (!profile) return null

  const securityActions = [
    {
      icon: Shield,
      title: t('Change Password'),
      description: t('Update your password to keep your account secure'),
      action: () => dialogs.open('password'),
      variant: 'default' as const,
    },
    {
      icon: Key,
      title: t('Access Token'),
      description: t('Generate and manage your API access token'),
      action: () => dialogs.open('token'),
      variant: 'default' as const,
    },
    {
      icon: Trash2,
      title: t('Delete Account'),
      description: t('Permanently delete your account and all data'),
      action: () => dialogs.open('delete'),
      variant: 'destructive' as const,
    },
  ]

  return (
    <>
      <TitledCard
        title={t('Security')}
        description={t('Manage your security settings and account access')}
        icon={<Shield className='h-4 w-4' />}
        disableHoverEffect
        className='token-boat-pro-card'
        headerClassName='bg-background/45'
        iconClassName='bg-primary/7 text-primary'
      >
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-1'>
          {securityActions.map((item) => (
            <button
              key={item.title}
              type='button'
              onClick={item.action}
              className={`token-boat-glass-panel group hover:bg-primary/[0.025] relative min-h-22 overflow-hidden rounded-xl border p-3 text-left transition-all hover:-translate-y-0.5 md:min-h-30 ${
                item.variant === 'destructive'
                  ? 'border-destructive/25 hover:bg-destructive/[0.025]'
                  : 'hover:border-primary/25'
              }`}
            >
              <span
                className={`absolute inset-x-0 top-0 h-0.5 opacity-0 transition-opacity group-hover:opacity-100 ${
                  item.variant === 'destructive'
                    ? 'bg-destructive'
                    : 'bg-primary'
                }`}
              />
              <div
                className={`mb-2.5 flex size-9 items-center justify-center rounded-lg ${
                  item.variant === 'destructive'
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-primary/7 text-primary'
                }`}
              >
                <item.icon className='size-4' />
              </div>
              <div className='min-w-0'>
                <p className='text-sm font-medium'>{item.title}</p>
                <p className='text-muted-foreground mt-1 line-clamp-2 text-xs'>
                  {item.description}
                </p>
              </div>
            </button>
          ))}
        </div>
      </TitledCard>

      {/* Dialogs */}
      <ChangePasswordDialog
        open={dialogs.isOpen('password')}
        onOpenChange={(open) =>
          open ? dialogs.open('password') : dialogs.close('password')
        }
        username={profile.username}
      />

      <AccessTokenDialog
        open={dialogs.isOpen('token')}
        onOpenChange={(open) =>
          open ? dialogs.open('token') : dialogs.close('token')
        }
      />

      <DeleteAccountDialog
        open={dialogs.isOpen('delete')}
        onOpenChange={(open) =>
          open ? dialogs.open('delete') : dialogs.close('delete')
        }
        username={profile.username}
      />
    </>
  )
}
