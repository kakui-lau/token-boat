import { useTranslation } from 'react-i18next'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrencyFromUSD } from '@/lib/currency'
import { formatNumber } from '@/lib/format'

import { getPaymentMethodName } from '../../wallet/lib/billing'
import type { FinanceProviderSummary } from '../types'

type PaymentChannelTableProps = {
  providers: FinanceProviderSummary[]
}

export function PaymentChannelTable(props: PaymentChannelTableProps) {
  const { t } = useTranslation()

  return (
    <Card>
      <CardHeader>
        <CardTitle className='text-base'>{t('Payment channels')}</CardTitle>
        <CardDescription>
          {t(
            'Completed order value by provider; wallet balance is an internal settlement channel.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {props.providers.length === 0 ? (
          <div className='text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm'>
            {t('No payment activity in the selected period.')}
          </div>
        ) : (
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Payment Provider')}</TableHead>
                  <TableHead>{t('Settlement type')}</TableHead>
                  <TableHead className='text-right'>{t('Orders')}</TableHead>
                  <TableHead className='text-right'>{t('Completed')}</TableHead>
                  <TableHead className='text-right'>
                    {t('Payment volume')}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {props.providers.map((provider) => (
                  <TableRow key={provider.provider}>
                    <TableCell className='font-medium'>
                      {getPaymentMethodName(provider.provider, t)}
                    </TableCell>
                    <TableCell>
                      {provider.internal
                        ? t('Internal balance')
                        : t('External payment')}
                    </TableCell>
                    <TableCell className='text-right font-mono tabular-nums'>
                      {formatNumber(provider.order_count)}
                    </TableCell>
                    <TableCell className='text-right font-mono tabular-nums'>
                      {formatNumber(provider.success_count)}
                    </TableCell>
                    <TableCell className='text-right font-mono font-medium tabular-nums'>
                      {formatCurrencyFromUSD(provider.success_amount, {
                        digitsLarge: 2,
                        digitsSmall: 2,
                        abbreviate: false,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
