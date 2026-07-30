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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

import {
  getPricingRolloutPolicy,
  updatePricingRolloutPolicy,
} from '../api'

export function PricingRolloutControl() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [percent, setPercent] = useState('0')
  const [models, setModels] = useState('')
  const [groups, setGroups] = useState('')
  const [userIds, setUserIds] = useState('')
  const [shadowEnabled, setShadowEnabled] = useState(false)
  const policyQuery = useQuery({
    queryKey: ['pricing-admin', 'rollout-policy'],
    queryFn: getPricingRolloutPolicy,
  })
  useEffect(() => {
    const policy = policyQuery.data?.data
    if (!policy) {
      return
    }
    setPercent(String(policy.percent))
    setModels(policy.models.join(','))
    setGroups(policy.groups.join(','))
    setUserIds(policy.user_ids.join(','))
    setShadowEnabled(policy.shadow_enabled)
  }, [policyQuery.data])
  const mutation = useMutation({
    mutationFn: () =>
      updatePricingRolloutPolicy({
        percent: Number(percent),
        models: models
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        groups: groups
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        user_ids: userIds
          .split(',')
          .map((value) => Number(value.trim()))
          .filter((value) => Number.isInteger(value) && value > 0),
        shadow_enabled: shadowEnabled,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['pricing-admin', 'rollout-policy'],
      })
      toast.success(t('Pricing rollout updated'))
    },
  })
  const numericPercent = Number(percent)
  const canSave =
    policyQuery.isSuccess &&
    percent.trim() !== '' &&
    Number.isInteger(numericPercent) &&
    numericPercent >= 0 &&
    numericPercent <= 100

  return (
    <section className='border-border bg-card rounded-lg border p-4'>
      <div className='mb-4'>
        <h2 className='font-semibold'>{t('V2 Rollout Control')}</h2>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Internal users override model, group, and traffic percentage. Shadow mode compares prices without changing billing.'
          )}
        </p>
      </div>
      <div className='grid gap-4 md:grid-cols-5'>
        <Field>
          <FieldLabel htmlFor='pricing-rollout-percent'>
            {t('Traffic Percentage')}
          </FieldLabel>
          <Input
            id='pricing-rollout-percent'
            type='number'
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='pricing-rollout-models'>
            {t('Models')}
          </FieldLabel>
          <Input
            id='pricing-rollout-models'
            value={models}
            placeholder={t('Comma-separated values')}
            onChange={(event) => setModels(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='pricing-rollout-groups'>
            {t('Groups')}
          </FieldLabel>
          <Input
            id='pricing-rollout-groups'
            value={groups}
            placeholder={t('Comma-separated values')}
            onChange={(event) => setGroups(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='pricing-rollout-users'>
            {t('Internal User IDs')}
          </FieldLabel>
          <Input
            id='pricing-rollout-users'
            value={userIds}
            placeholder={t('Comma-separated values')}
            onChange={(event) => setUserIds(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor='pricing-rollout-shadow'>
            {t('Shadow comparison only')}
          </FieldLabel>
          <Switch
            id='pricing-rollout-shadow'
            checked={shadowEnabled}
            onCheckedChange={setShadowEnabled}
          />
        </Field>
      </div>
      <div className='mt-4 flex justify-end'>
        <Button
          disabled={!canSave || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {t('Save')}
        </Button>
      </div>
    </section>
  )
}
