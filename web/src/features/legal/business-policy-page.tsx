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
import { CalendarDays, FileCheck2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { RichContent } from '@/components/rich-content'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

type BusinessPolicyPageProps = {
  titleKey: string
  summaryKey: string
  contentKey: string
}

export function BusinessPolicyPage(props: BusinessPolicyPageProps) {
  const { t } = useTranslation()

  return (
    <PublicLayout showMainContainer={false}>
      <div className='token-boat-home relative overflow-hidden pt-24 pb-16'>
        <div aria-hidden className='token-boat-aurora opacity-40' />
        <div aria-hidden className='token-boat-beam opacity-40' />
        <div className='relative container mx-auto max-w-5xl px-4'>
          <Card className='border-primary/10 bg-background/80 overflow-hidden shadow-xl backdrop-blur-xl'>
            <CardHeader className='gap-5 px-6 py-8 sm:px-10 sm:py-10'>
              <div className='flex flex-wrap items-center justify-between gap-3'>
                <Badge variant='secondary' className='rounded-full'>
                  <FileCheck2 aria-hidden='true' />
                  {t('TokenBoat Legal')}
                </Badge>
                <div className='text-muted-foreground flex items-center gap-2 text-sm'>
                  <CalendarDays className='size-4' aria-hidden='true' />
                  {t('Effective date: July 22, 2026')}
                </div>
              </div>
              <div className='flex flex-col gap-3'>
                <CardTitle className='text-3xl tracking-tight sm:text-4xl'>
                  {t(props.titleKey)}
                </CardTitle>
                <CardDescription className='max-w-3xl text-base leading-7'>
                  {t(props.summaryKey)}
                </CardDescription>
              </div>
            </CardHeader>
            <Separator />
            <CardContent className='px-6 py-8 sm:px-10 sm:py-10'>
              <RichContent
                mode='markdown'
                content={t(props.contentKey)}
                className='prose-neutral dark:prose-invert max-w-none'
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </PublicLayout>
  )
}
