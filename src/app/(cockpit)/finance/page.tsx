'use client'

import { useState } from 'react'
import { FinanceKpis } from '@/components/finance/FinanceKpis'
import { SpendChart } from '@/components/finance/SpendChart'
import { ModelIntelligence } from '@/components/finance/ModelIntelligence'
import { TransactionsPanel } from '@/components/finance/TransactionsPanel'

export default function FinancePage() {
  const [tab, setTab] = useState<'transactions' | 'budgets'>('transactions')

  return (
    <div className="h-full flex flex-col overflow-auto">
      <div className="px-4 py-3 border-b border-white/[0.06] shrink-0">
        <p className="text-text3 font-mono text-[10px] uppercase tracking-widest">Finance</p>
      </div>

      <FinanceKpis />

      <div className="p-4 flex flex-col gap-4">
        <SpendChart />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ModelIntelligence />
          <div className="bg-base-2 border border-white/[0.06] rounded-lg p-4 flex flex-col gap-2">
            <p className="text-text3 font-mono text-[10px] uppercase tracking-wider">Income vs Expense</p>
            <div className="flex-1 flex items-center justify-center py-8">
              <p className="font-mono text-[10px] text-text3">Breakdown coming soon</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4 border-b border-white/[0.06]">
            <button onClick={() => setTab('transactions')}
              className="font-mono text-[10px] pb-1.5 border-b-2 transition-colors"
              style={{ color: tab === 'transactions' ? '#3b82f6' : '#4b5563', borderColor: tab === 'transactions' ? '#3b82f6' : 'transparent' }}>
              Transactions
            </button>
            <button onClick={() => setTab('budgets')}
              className="font-mono text-[10px] pb-1.5 border-b-2 transition-colors"
              style={{ color: tab === 'budgets' ? '#3b82f6' : '#4b5563', borderColor: tab === 'budgets' ? '#3b82f6' : 'transparent' }}>
              Budgets
            </button>
          </div>
          {tab === 'transactions' ? (
            <TransactionsPanel />
          ) : (
            <div className="bg-base-2 border border-white/[0.06] rounded-lg p-4 py-12 text-center">
              <p className="font-mono text-[10px] text-text3">Budgets — coming soon</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
