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
import { useTranslation } from 'react-i18next'

import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type {
  LowestPriceComponent,
  ModelPriceOverview as ModelPriceOverviewItem,
} from '../types'

type ModelPriceOverviewProps = {
  items: ModelPriceOverviewItem[]
  isLoading: boolean
}

function LowestPrice({ value }: { value?: LowestPriceComponent }) {
  if (!value) {
    return <span className='text-muted-foreground'>—</span>
  }
  return (
    <div>
      <p className='font-mono'>
        {value.unit_price} {value.currency}
      </p>
      <p className='text-muted-foreground text-xs'>{value.channel_name}</p>
    </div>
  )
}

export function ModelPriceOverview(props: ModelPriceOverviewProps) {
  const { t } = useTranslation()
  return (
    <section className='space-y-3'>
      <div>
        <h2 className='font-medium'>{t('Best Available Prices')}</h2>
        <p className='text-muted-foreground text-sm'>
          {t(
            'Lowest active retail price for each component across available channels.'
          )}
        </p>
      </div>
      <div className='overflow-hidden rounded-lg border'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Model')}</TableHead>
              <TableHead>{t('Currency')}</TableHead>
              <TableHead>{t('Channels')}</TableHead>
              <TableHead>{t('Min Input')}</TableHead>
              <TableHead>{t('Min Output')}</TableHead>
              <TableHead>{t('Min Cache Read')}</TableHead>
              <TableHead>{t('Min Cache Write')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {props.isLoading
              ? Array.from({ length: 3 }, (_, index) => (
                  <TableRow key={`price-overview-skeleton-${index}`}>
                    <TableCell colSpan={7}>
                      <Skeleton className='h-10 w-full' />
                    </TableCell>
                  </TableRow>
                ))
              : null}
            {!props.isLoading
              ? props.items.map((item) => (
                  <TableRow key={`${item.model_id}-${item.currency}`}>
                    <TableCell className='font-medium'>
                      {item.model_name}
                    </TableCell>
                    <TableCell>{item.currency}</TableCell>
                    <TableCell>{item.active_channel_count}</TableCell>
                    <TableCell>
                      <LowestPrice value={item.input} />
                    </TableCell>
                    <TableCell>
                      <LowestPrice value={item.output} />
                    </TableCell>
                    <TableCell>
                      <LowestPrice value={item.cache_read} />
                    </TableCell>
                    <TableCell>
                      <LowestPrice value={item.cache_write} />
                    </TableCell>
                  </TableRow>
                ))
              : null}
            {!props.isLoading && props.items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className='text-muted-foreground h-20 text-center'
                >
                  {t('No active retail prices found')}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
