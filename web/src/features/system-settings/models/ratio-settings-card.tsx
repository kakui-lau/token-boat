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
import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import * as z from 'zod'

import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { positiveIntegerSchema } from '../utils/numeric-field'
import { GroupRatioForm } from './group-ratio-form'
import {
  formatJsonForTextarea,
  normalizeJsonString,
  validateJsonString,
} from './utils'

type Translate = (key: string, options?: Record<string, unknown>) => string

function createJsonField(t: Translate, arrayOnly = false) {
  return z.string().superRefine((value, context) => {
    const result = validateJsonString(value, {
      predicate: arrayOnly
        ? (parsed) =>
            Array.isArray(parsed) &&
            parsed.every((item) => typeof item === 'string')
        : undefined,
      predicateMessage: arrayOnly
        ? 'Expected a JSON array of group identifiers'
        : undefined,
    })
    if (!result.valid) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: t(result.message || 'Invalid JSON'),
      })
    }
  })
}

const createGroupSchema = (t: Translate) =>
  z.object({
    GroupRatio: createJsonField(t),
    TopupGroupRatio: createJsonField(t),
    UserUsableGroups: createJsonField(t),
    GroupGroupRatio: createJsonField(t),
    AutoGroups: createJsonField(t, true),
    MaxTokenAutoGroups: positiveIntegerSchema(t('Enter a positive integer')),
    DefaultUseAutoGroup: z.boolean(),
    GroupSpecialUsableGroup: createJsonField(t),
  })

type GroupFormValues = z.infer<ReturnType<typeof createGroupSchema>>

type RatioSettingsCardProps = {
  groupDefaults: GroupFormValues
  titleKey?: string
}

export function RatioSettingsCard({
  groupDefaults,
  titleKey = 'Group Pricing',
}: RatioSettingsCardProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const schema = useMemo(() => createGroupSchema(t), [t])
  const normalizedDefaults = useRef({
    GroupRatio: normalizeJsonString(groupDefaults.GroupRatio),
    TopupGroupRatio: normalizeJsonString(groupDefaults.TopupGroupRatio),
    UserUsableGroups: normalizeJsonString(groupDefaults.UserUsableGroups),
    GroupGroupRatio: normalizeJsonString(groupDefaults.GroupGroupRatio),
    AutoGroups: normalizeJsonString(groupDefaults.AutoGroups),
    MaxTokenAutoGroups: groupDefaults.MaxTokenAutoGroups,
    DefaultUseAutoGroup: groupDefaults.DefaultUseAutoGroup,
    GroupSpecialUsableGroup: normalizeJsonString(
      groupDefaults.GroupSpecialUsableGroup
    ),
  })
  const form = useForm<GroupFormValues>({
    resolver: zodResolver(schema),
    mode: 'onChange',
    defaultValues: groupDefaults,
  })

  useEffect(() => {
    normalizedDefaults.current = {
      GroupRatio: normalizeJsonString(groupDefaults.GroupRatio),
      TopupGroupRatio: normalizeJsonString(groupDefaults.TopupGroupRatio),
      UserUsableGroups: normalizeJsonString(groupDefaults.UserUsableGroups),
      GroupGroupRatio: normalizeJsonString(groupDefaults.GroupGroupRatio),
      AutoGroups: normalizeJsonString(groupDefaults.AutoGroups),
      MaxTokenAutoGroups: groupDefaults.MaxTokenAutoGroups,
      DefaultUseAutoGroup: groupDefaults.DefaultUseAutoGroup,
      GroupSpecialUsableGroup: normalizeJsonString(
        groupDefaults.GroupSpecialUsableGroup
      ),
    }
    form.reset({
      ...groupDefaults,
      GroupRatio: formatJsonForTextarea(groupDefaults.GroupRatio),
      TopupGroupRatio: formatJsonForTextarea(groupDefaults.TopupGroupRatio),
      UserUsableGroups: formatJsonForTextarea(groupDefaults.UserUsableGroups),
      GroupGroupRatio: formatJsonForTextarea(groupDefaults.GroupGroupRatio),
      AutoGroups: formatJsonForTextarea(groupDefaults.AutoGroups),
      GroupSpecialUsableGroup: formatJsonForTextarea(
        groupDefaults.GroupSpecialUsableGroup
      ),
    })
  }, [form, groupDefaults])

  const save = useCallback(
    async (values: GroupFormValues) => {
      const normalized = {
        GroupRatio: normalizeJsonString(values.GroupRatio),
        TopupGroupRatio: normalizeJsonString(values.TopupGroupRatio),
        UserUsableGroups: normalizeJsonString(values.UserUsableGroups),
        GroupGroupRatio: normalizeJsonString(values.GroupGroupRatio),
        AutoGroups: normalizeJsonString(values.AutoGroups),
        MaxTokenAutoGroups: values.MaxTokenAutoGroups,
        DefaultUseAutoGroup: values.DefaultUseAutoGroup,
        GroupSpecialUsableGroup: normalizeJsonString(
          values.GroupSpecialUsableGroup
        ),
      }
      for (const key of Object.keys(normalized) as Array<
        keyof typeof normalized
      >) {
        if (normalized[key] === normalizedDefaults.current[key]) continue
        await updateOption.mutateAsync({
          key:
            key === 'GroupSpecialUsableGroup'
              ? 'group_ratio_setting.group_special_usable_group'
              : key,
          value: normalized[key],
        })
      }
      normalizedDefaults.current = normalized
    },
    [updateOption]
  )

  return (
    <SettingsSection title={t(titleKey)}>
      <GroupRatioForm
        form={form}
        onSave={save}
        isSaving={updateOption.isPending}
      />
    </SettingsSection>
  )
}
