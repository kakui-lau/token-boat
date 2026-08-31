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
  CheckCircle2,
  CircleDollarSign,
  Code2,
  KeyRound,
  Rocket,
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

const steps = [
  {
    icon: KeyRound,
    number: '01',
    title: 'Create an API key',
    description: 'Getting started key description',
  },
  {
    icon: CircleDollarSign,
    number: '02',
    title: 'Fund your balance',
    description: 'Getting started balance description',
  },
  {
    icon: Code2,
    number: '03',
    title: 'Connect your application',
    description: 'Getting started connect description',
  },
  {
    icon: CheckCircle2,
    number: '04',
    title: 'Verify and monitor',
    description: 'Getting started monitor description',
  },
]

const requestExample = `curl https://tokenboat.com/v1/chat/completions \\
  -H "Authorization: Bearer $TOKENBOAT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }'`

export function GettingStarted() {
  const { t } = useTranslation()

  return (
    <PublicLayout showMainContainer={false}>
      <div className='token-boat-home relative overflow-hidden pt-24 pb-16'>
        <div aria-hidden className='token-boat-aurora opacity-50' />
        <div aria-hidden className='token-boat-beam opacity-40' />
        <div className='relative container mx-auto flex max-w-6xl flex-col gap-12 px-4'>
          <header className='mx-auto flex max-w-4xl flex-col items-center gap-6 text-center'>
            <Badge variant='secondary' className='rounded-full'>
              <Rocket aria-hidden='true' />
              {t('Quick start guide')}
            </Badge>
            <div className='flex flex-col gap-4'>
              <h1 className='text-4xl font-semibold tracking-tight sm:text-6xl'>
                {t('Make your first API request')}
              </h1>
              <p className='text-muted-foreground mx-auto max-w-3xl text-base leading-7 sm:text-lg'>
                {t('Getting started summary')}
              </p>
            </div>
            <div className='flex flex-wrap justify-center gap-3'>
              <Button render={<Link to='/dashboard' />}>
                {t('Open console')}
                <ArrowRight data-icon='inline-end' />
              </Button>
              <Button variant='outline' render={<Link to='/pricing' />}>
                {t('View Pricing')}
              </Button>
            </div>
          </header>

          <ol className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {steps.map((step) => {
              const Icon = step.icon
              return (
                <li key={step.number}>
                  <Card className='border-primary/10 bg-background/80 h-full backdrop-blur-xl'>
                    <CardHeader>
                      <div className='flex items-center justify-between'>
                        <div className='bg-primary/10 text-primary flex size-11 items-center justify-center rounded-xl'>
                          <Icon className='size-5' aria-hidden='true' />
                        </div>
                        <span className='text-primary/60 text-sm font-semibold'>
                          {step.number}
                        </span>
                      </div>
                      <CardTitle>{t(step.title)}</CardTitle>
                      <CardDescription className='leading-6'>
                        {t(step.description)}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </li>
              )
            })}
          </ol>

          <Card className='border-primary/10 bg-background/85 overflow-hidden backdrop-blur-xl'>
            <CardHeader>
              <CardTitle>{t('OpenAI-compatible request')}</CardTitle>
              <CardDescription className='max-w-3xl leading-6'>
                {t('Getting started request description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <pre className='border-border/60 bg-foreground text-background overflow-x-auto rounded-xl border p-5 text-sm leading-6'>
                <code>{requestExample}</code>
              </pre>
              <p className='text-muted-foreground mt-4 text-sm leading-6'>
                {t('Getting started security note')}
              </p>
            </CardContent>
            <CardFooter className='flex flex-wrap gap-3'>
              <Button render={<Link to='/keys' />}>
                {t('Manage API keys')}
                <ArrowRight data-icon='inline-end' />
              </Button>
              <Button variant='outline' render={<Link to='/usage-logs' />}>
                {t('View request logs')}
              </Button>
              <Button
                variant='ghost'
                render={<Link to='/support/community-interaction' />}
              >
                {t('Get support')}
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </PublicLayout>
  )
}
