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
import { Link } from '@tanstack/react-router'
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  CreditCard,
  LifeBuoy,
  MessageCircleMore,
  ShieldCheck,
  Wrench,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

const supportTopics = [
  {
    icon: Wrench,
    title: 'Technical Support',
    description: 'Support technical description',
  },
  {
    icon: CreditCard,
    title: 'Billing',
    description: 'Support billing description',
  },
  {
    icon: ShieldCheck,
    title: 'Security',
    description: 'Support security description',
  },
  {
    icon: BriefcaseBusiness,
    title: 'Business Cooperation',
    description: 'Support business description',
  },
]

export function CommunityInteraction() {
  const { t } = useTranslation()

  return (
    <PublicLayout showMainContainer={false}>
      <div className='token-boat-home relative overflow-hidden pt-24 pb-16'>
        <div aria-hidden className='token-boat-aurora opacity-45' />
        <div aria-hidden className='token-boat-beam opacity-40' />
        <div className='relative container mx-auto flex max-w-6xl flex-col gap-10 px-4'>
          <header className='mx-auto flex max-w-3xl flex-col items-center gap-5 text-center'>
            <Badge variant='secondary' className='rounded-full'>
              <LifeBuoy aria-hidden='true' />
              {t('Support Center')}
            </Badge>
            <div className='flex flex-col gap-4'>
              <h1 className='text-4xl font-semibold tracking-tight sm:text-5xl'>
                {t('Get help with TokenBoat')}
              </h1>
              <p className='text-muted-foreground text-base leading-7 sm:text-lg'>
                {t('Support page introduction')}
              </p>
            </div>
          </header>

          <div className='grid gap-4 md:grid-cols-2'>
            {supportTopics.map((topic) => {
              const Icon = topic.icon
              return (
                <Card
                  key={topic.title}
                  className='border-primary/10 bg-background/80 backdrop-blur-xl'
                >
                  <CardHeader>
                    <div className='bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl'>
                      <Icon className='size-5' aria-hidden='true' />
                    </div>
                    <CardTitle>{t(topic.title)}</CardTitle>
                    <CardDescription className='leading-6'>
                      {t(topic.description)}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>

          <Card className='border-primary/10 bg-background/85 backdrop-blur-xl'>
            <CardHeader>
              <CardTitle>{t('Before contacting support')}</CardTitle>
              <CardDescription>
                {t('Support preparation description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className='text-muted-foreground grid gap-3 text-sm leading-6 sm:grid-cols-2'>
                <li>{t('Support preparation account')}</li>
                <li>{t('Support preparation request')}</li>
                <li>{t('Support preparation billing')}</li>
                <li>{t('Support preparation secrets')}</li>
              </ul>
            </CardContent>
            <CardFooter className='flex flex-wrap gap-3'>
              <Button render={<Link to='/dashboard' />}>
                {t('Open console')}
                <ArrowRight data-icon='inline-end' />
              </Button>
              <Button
                variant='outline'
                render={
                  <a
                    href='https://tokenboat.com/zh/docs/support/community-interaction'
                    target='_blank'
                    rel='noopener noreferrer'
                  />
                }
              >
                <MessageCircleMore data-icon='inline-start' />
                {t('Community channels')}
              </Button>
              <Button variant='outline' render={<Link to='/getting-started' />}>
                <BookOpen data-icon='inline-start' />
                {t('footer.columns.docs.title')}
              </Button>
              <Button variant='ghost' render={<Link to='/refund' />}>
                {t('Refund Policy')}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </PublicLayout>
  )
}
