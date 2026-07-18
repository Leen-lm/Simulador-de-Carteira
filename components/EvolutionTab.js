'use client';

import { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

// Formato compacto para os eixos do gráfico (ex.: "R$ 250 mil") — evita poluir o eixo Y com números longos
const currencyCompact = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export default function EvolutionTab({ principalSum, numericMonthly, years, optimizedRate }) {
  // Simula o saldo mês a mês (mesma lógica de simulatePortfolio do componente pai) e registra
  // um ponto por ano. valorInvestido = capital inicial + aportes acumulados (sem juros).
  // jurosAcumulados = saldo total simulado até aquele ano - valorInvestido até aquele ano,
  // ou seja, é cumulativo (não "apenas o juro daquele ano isolado"), para que a pilha
  // (valorInvestido + jurosAcumulados) sempre bata com o patrimônio total real no eixo Y.
  const chartData = useMemo(() => {
    const data = [];
    const monthlyRate = Number(optimizedRate) / 100 / 12;
    const monthlyContribution = Number(numericMonthly) || 0;
    const principal = Number(principalSum) || 0;
    let balance = principal;

    for (let year = 1; year <= years; year += 1) {
      for (let month = 0; month < 12; month += 1) {
        balance = balance * (1 + monthlyRate) + monthlyContribution;
      }

      const valorInvestido = principal + monthlyContribution * 12 * year;
      const jurosAcumulados = Math.max(0, balance - valorInvestido);

      data.push({
        ano: year,
        valorInvestido: Math.round(valorInvestido),
        jurosAcumulados: Math.round(jurosAcumulados),
        patrimonioTotal: Math.round(balance),
      });
    }

    return data;
  }, [principalSum, numericMonthly, years, optimizedRate]);

  const hasData = chartData.length > 0;
  const last = hasData ? chartData[chartData.length - 1] : null;

  const patrimonioFinal = last ? last.patrimonioTotal : Number(principalSum) || 0;
  const totalDesembolsado = last ? last.valorInvestido : Number(principalSum) || 0;
  const jurosAcumuladosFinal = last ? last.jurosAcumulados : 0;

  if (!hasData) {
    return (
      <div className="flex items-center justify-center min-h-[400px] bg-white border border-gray-200 rounded-md shadow-sm text-gray-500 text-sm px-6 text-center">
        Defina um prazo válido (Idade de Resgate maior que Idade Atual) para visualizar a evolução patrimonial.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-gray-500">Patrimônio Final</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{currency.format(patrimonioFinal)}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-gray-500">Total Desembolsado</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{currency.format(totalDesembolsado)}</p>
        </div>
        <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs uppercase tracking-widest text-gray-500">Juros Acumulados</p>
          <p className="mt-2 text-2xl font-bold text-[#f59e0b]">{currency.format(jurosAcumuladosFinal)}</p>
        </div>
      </div>

      {/* Gráfico de área empilhada */}
      <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-gray-900 mb-4">
          Evolução patrimonial — capital investido vs. juros acumulados
        </h4>
        <div style={{ width: '100%', height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="valorInvestidoGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4b5563" stopOpacity={0.9} />
                  <stop offset="95%" stopColor="#4b5563" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="jurosGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.9} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.4} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="ano" tickFormatter={(y) => `Ano ${y}`} tick={{ fontSize: 12, fill: '#6b7280' }} />
              <YAxis tickFormatter={(v) => currencyCompact.format(v)} tick={{ fontSize: 12, fill: '#6b7280' }} width={80} />
              <Tooltip
                formatter={(value, name) => [
                  currency.format(value),
                  name === 'valorInvestido' ? 'Capital investido' : 'Juros acumulados',
                ]}
                labelFormatter={(y) => `Ano ${y}`}
              />
              <Area
                type="monotone"
                dataKey="valorInvestido"
                stackId="1"
                stroke="#4b5563"
                fill="url(#valorInvestidoGradient)"
                name="valorInvestido"
              />
              <Area
                type="monotone"
                dataKey="jurosAcumulados"
                stackId="1"
                stroke="#f59e0b"
                fill="url(#jurosGradient)"
                name="jurosAcumulados"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 flex items-center gap-6 text-xs text-gray-500">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: '#4b5563' }} />
            Capital investido (esforço do cliente)
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block h-3 w-3 rounded-sm" style={{ backgroundColor: '#f59e0b' }} />
            Juros acumulados (dinheiro trabalhando sozinho)
          </span>
        </div>
      </div>
    </div>
  );
}