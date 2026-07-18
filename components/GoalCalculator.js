'use client';

import { useMemo, useState } from 'react';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

function parseCurrencyString(value) {
  if (!value) return 0;
  const digits = String(value).replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}

function formatCurrencyValue(number) {
  if (number === null || number === undefined) return '';
  return currency.format(Math.round(Number(number) || 0));
}

export default function GoalCalculator({ principalSum, years, optimizedRate, currentMonthlyContribution, rescueAge }) {
  const [goalInput, setGoalInput] = useState('');

  function handleGoalInput(rawValue) {
    const digits = String(rawValue).replace(/\D/g, '');
    setGoalInput(digits === '' ? '' : formatCurrencyValue(Number(digits)));
  }

  const goalValue = parseCurrencyString(goalInput);
  const hasValidTimeframe = years > 0;
  const hasGoal = goalValue > 0;

  // Aporte mensal necessário = inversão da fórmula de valor futuro de uma série de aportes
  // (mesma recorrência usada em simulatePortfolio: saldo cresce e SÓ DEPOIS soma o aporte do mês).
  // FV = P*(1+r)^n + C * [((1+r)^n - 1) / r]  →  C = (FV - P*(1+r)^n) / [((1+r)^n - 1) / r]
  const analysis = useMemo(() => {
    if (!hasValidTimeframe || !hasGoal) return null;

    const n = years * 12;
    const r = Number(optimizedRate) / 100 / 12;
    const principal = Number(principalSum) || 0;
    const growthFactor = Math.pow(1 + r, n);
    const futureValueOfPrincipal = principal * growthFactor;

    let rawRequired;
    if (r === 0) {
      rawRequired = (goalValue - principal) / n;
    } else {
      const annuityFactor = (growthFactor - 1) / r;
      rawRequired = (goalValue - futureValueOfPrincipal) / annuityFactor;
    }

    const alreadyAchievable = rawRequired <= 0;
    const requiredMonthly = Math.max(0, rawRequired);
    const current = Number(currentMonthlyContribution) || 0;
    const gap = requiredMonthly - current;

    return { requiredMonthly, alreadyAchievable, gap };
  }, [hasValidTimeframe, hasGoal, years, optimizedRate, principalSum, goalValue, currentMonthlyContribution]);

  return (
    <section className="rounded-md border-2 border-[#ffc709] bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Calculadora reversa</p>
      <h3 className="mt-2 text-2xl font-bold text-gray-900">Qual é a sua meta de patrimônio?</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
        {hasValidTimeframe
          ? `Informe o valor que você quer ter até os ${rescueAge} anos (${years} anos de prazo) e veja quanto precisa aportar por mês na Carteira Otimizada (${Number(optimizedRate).toFixed(2)}% a.a. real).`
          : 'Ajuste a Idade de Resgate na seção de Parâmetros (ela precisa ser maior que a Idade Atual) para habilitar esta calculadora.'}
      </p>

      <div className="mt-4 max-w-xs">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-gray-900">Patrimônio-alvo (R$)</span>
          <input
            type="text"
            value={goalInput}
            onChange={(e) => handleGoalInput(e.target.value)}
            placeholder={formatCurrencyValue(1000000)}
            disabled={!hasValidTimeframe}
            className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-400"
          />
        </label>
      </div>

      {analysis && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm text-gray-600">Aporte mensal necessário</p>
            <p className="mt-2 text-2xl font-bold text-gray-900">{currency.format(analysis.requiredMonthly)}</p>
          </div>

          {analysis.alreadyAchievable ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-gray-600">Comparado ao aporte atual</p>
              <p className="mt-2 text-lg font-bold text-emerald-700">
                Meta já alcançável sem novos aportes, apenas com o patrimônio atual crescendo na taxa proposta.
              </p>
            </div>
          ) : analysis.gap > 0 ? (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm text-gray-600">Comparado ao aporte atual</p>
              <p className="mt-2 text-lg font-bold text-rose-600">Faltam {currency.format(analysis.gap)} por mês para atingir essa meta.</p>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm text-gray-600">Comparado ao aporte atual</p>
              <p className="mt-2 text-lg font-bold text-emerald-700">Seu aporte atual já é suficiente — folga de {currency.format(Math.abs(analysis.gap))} por mês.</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}