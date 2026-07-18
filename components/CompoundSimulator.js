'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
const PerformanceChart = dynamic(() => import('./PerformanceChart'), { ssr: false });

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

const COLORS = ['#1f2937', '#ffc709', '#6b7280', '#9ca3af', '#d1d5db'];

function parseCurrencyString(value) {
  if (!value) return 0;
  const digits = String(value).replace(/\D/g, '');
  return digits === '' ? 0 : Number(digits);
}

function formatCurrencyValue(number) {
  if (number === null || number === undefined) return '';
  return currency.format(Math.round(Number(number) || 0));
}

function simulatePortfolio(principal, monthlyContribution, years, annualRate) {
  const months = years * 12;
  const monthlyRate = annualRate / 100 / 12;
  let balance = Number(principal);

  for (let month = 0; month < months; month += 1) {
    balance = balance * (1 + monthlyRate);
    balance += Number(monthlyContribution);
  }

  const totalContributed = Number(principal) + Number(monthlyContribution) * months;
  const gain = balance - totalContributed;

  return {
    finalValue: balance,
    totalContributed,
    gain,
  };
}

export default function CompoundSimulator() {
  // Dynamic assets list state
  const [assets, setAssets] = useState(() => [
    { id: 1, nomeDoAtivo: 'Caixa (Fundo DI)', valor: formatCurrencyValue(150000), taxaAnual: '6.0' },
    { id: 2, nomeDoAtivo: 'CRI', valor: formatCurrencyValue(50000), taxaAnual: '5.0' },
    { id: 3, nomeDoAtivo: 'FIIs', valor: formatCurrencyValue(50000), taxaAnual: '4.0' },
  ]);
  const [nextId, setNextId] = useState(4);


  const [monthlyContribution, setMonthlyContribution] = useState(() => formatCurrencyValue(5000));
  const [currentAge, setCurrentAge] = useState(24);
  const [rescueAge, setRescueAge] = useState(39);
  const [optimizedRate, setOptimizedRate] = useState(7);
// inertiaRate holds the nominal (a.a.) rate derived from the weighted average or manually edited by user
  const [inertiaRate, setInertiaRate] = useState(0);
  const [inertiaManual, setInertiaManual] = useState(false);
  // New input: inflação projetada (% a.a.) — used to convert nominal -> real via Fisher
  const [inflationRate, setInflationRate] = useState(4.5);
  const [activeTab, setActiveTab] = useState('INICIO');

  // Helpers for parsing/formatting
  function handleCurrencyInput(rawValue, setter) {
    const digits = String(rawValue).replace(/\D/g, '');
    if (digits === '') {
      setter('');
      return;
    }
    const num = Number(digits);
    setter(formatCurrencyValue(num));
  }

  function handleAssetCurrencyInput(id, rawValue) {
    const digits = String(rawValue).replace(/\D/g, '');
    const formatted = digits === '' ? '' : formatCurrencyValue(Number(digits));
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, valor: formatted } : a)));
  }

  function addAsset() {
    setAssets((prev) => [...prev, { id: nextId, nomeDoAtivo: '', valor: '', taxaAnual: '0' }]);
    setNextId((n) => n + 1);
  }

  function removeAsset(id) {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }

  function updateAssetField(id, field, value) {
    setAssets((prev) => prev.map((a) => (a.id === id ? { ...a, [field]: value } : a)));
  }

  // Derived numeric values
  const numericAssetValues = useMemo(() => assets.map((a) => ({ ...a, numericValor: parseCurrencyString(a.valor), numericTaxa: Number(a.taxaAnual) || 0 })), [assets]);
  const principalSum = useMemo(() => numericAssetValues.reduce((sum, a) => sum + a.numericValor, 0), [numericAssetValues]);
  const allocationData = useMemo(() => numericAssetValues.map((a) => ({ id: a.id, nomeDoAtivo: a.nomeDoAtivo, valor: a.numericValor })), [numericAssetValues]);

  // Weighted average (computed value for inertia)
  const weightedRate = useMemo(() => {
    if (principalSum === 0) return 0;
    return numericAssetValues.reduce((acc, a) => acc + a.numericValor * a.numericTaxa, 0) / principalSum;
  }, [numericAssetValues, principalSum]);

  // Sync inertiaRate with computed weightedRate unless user manually edited it
  useEffect(() => {
    if (!inertiaManual) {
      setInertiaRate(Number(weightedRate.toFixed(2)));
    }
  }, [weightedRate, inertiaManual]);

    // Taxa Real da Inércia (Equação de Fisher): i_real = (1 + i_nominal) / (1 + i_inflacao) - 1
    // Note: divide percents by 100 for calculation, then multiply result by 100 to keep percent units
    const inertiaReal = useMemo(() => {
      const nominal = Number(inertiaRate || weightedRate) / 100; // in decimal
      const inflation = Number(inflationRate) / 100; // in decimal
      const realDecimal = (1 + nominal) / (1 + inflation) - 1;
      return Number((realDecimal * 100).toFixed(2));
    }, [inertiaRate, weightedRate, inflationRate]);

  // years and monthly numeric
  const years = Math.max(1, Number(rescueAge || 0) - Number(currentAge || 0));
  const numericMonthly = useMemo(() => parseCurrencyString(monthlyContribution), [monthlyContribution]);

  // Simulations (using Taxa Real da Inércia for 'Inércia')
    const inertiaResult = useMemo(() => simulatePortfolio(principalSum, numericMonthly, years, Number(inertiaReal)), [principalSum, numericMonthly, years, inertiaReal]);
  const optimizedResult = useMemo(() => simulatePortfolio(principalSum, numericMonthly, years, Number(optimizedRate)), [principalSum, numericMonthly, years, optimizedRate]);

  const delta = optimizedResult.finalValue - inertiaResult.finalValue;
  const isPositive = delta >= 0;

  // Build chart data year by year
  const chartData = useMemo(() => {
    const arr = [];
    for (let y = 1; y <= years; y += 1) {
        const inerc = simulatePortfolio(principalSum, numericMonthly, y, Number(inertiaReal));
      const opt = simulatePortfolio(principalSum, numericMonthly, y, Number(optimizedRate));
      arr.push({ year: y, Inercia: Math.round(inerc.finalValue), Otimizada: Math.round(opt.finalValue) });
    }
    return arr;
    }, [years, principalSum, numericMonthly, inertiaReal, optimizedRate]);

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      {/* XP Header - Preto */}
      <header className="bg-black text-white px-4 py-2 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          {/* XP Logo */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-[4px] border border-white w-6 h-6">
              <img src="/Logotipo_da_XP_Investimentos.svg.webp" alt="XP Logo" className="bg-white rounded-[3px] h-[22px] w-auto block" />
            </div>
            <span className="ml-1 text-sm font-semibold text-white">Simulador de Valor</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Fake navigation header (XP-inspired tabs) */}
        <div className="border-b border-gray-300 pb-2">
          <div className="flex flex-wrap items-center gap-8 text-sm font-medium">
            <button type="button" onClick={() => setActiveTab('INICIO')} className={activeTab === 'INICIO' ? 'inline-flex pb-2 text-gray-900 border-b-2 border-black font-semibold' : 'inline-flex pb-2 text-gray-400 hover:text-gray-700 cursor-pointer'}>
              📊 INÍCIO
            </button>
            <button type="button" onClick={() => setActiveTab('CARTEIRA')} className={activeTab === 'CARTEIRA' ? 'inline-flex pb-2 text-gray-900 border-b-2 border-black font-semibold' : 'inline-flex pb-2 text-gray-400 hover:text-gray-700 cursor-pointer'}>
              💼 CARTEIRA
            </button>
            <button type="button" onClick={() => setActiveTab('EVOLUCAO')} className={activeTab === 'EVOLUCAO' ? 'inline-flex pb-2 text-gray-900 border-b-2 border-black font-semibold' : 'inline-flex pb-2 text-gray-400 hover:text-gray-700 cursor-pointer'}>
              📈 EVOLUÇÃO
            </button>
          </div>
        </div>

        {activeTab === 'INICIO' && (
          <>
            <header className="space-y-3 pt-2">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">O custo real de deixar dinheiro na mesa.</h1>
            <p className="max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">Compare o impacto de uma carteira inercial com a estruturação da sua proposta de investimento. A narrativa é simples: cada mês de atraso custa valor em termos de capital e de tempo.</p>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">Parâmetros</p>
                <h2 className="mt-1 text-xl font-bold text-gray-900">Entrada de decisão</h2>
              </div>
              <div className="rounded-md border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-600">Modelo mensal</div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="mb-2 block text-sm font-semibold text-gray-900">Raio-X de Ativos</p>
                {/* Header labels */}
                <div className="hidden sm:flex items-center gap-3 text-gray-600 text-xs mb-2 px-2 font-medium">
                  <div className="w-4/12 min-w-[120px]">Nome do Ativo</div>
                  <div className="w-4/12">Valor (R$)</div>
                  <div className="w-2/12">Taxa (% a.a.)</div>
                  <div className="w-1/12" />
                </div>
                <div className="space-y-2">
                  {assets.map((asset) => (
                    <div key={asset.id} className="flex gap-3 items-center">
                      <input className="w-4/12 min-w-[120px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" value={asset.nomeDoAtivo} onChange={(e) => updateAssetField(asset.id, 'nomeDoAtivo', e.target.value)} placeholder="Nome do ativo" />

                      <input className="w-4/12 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" value={asset.valor} onChange={(e) => handleAssetCurrencyInput(asset.id, e.target.value)} placeholder={formatCurrencyValue(0)} />

                      <input className="w-2/12 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" type="number" value={asset.taxaAnual} onChange={(e) => updateAssetField(asset.id, 'taxaAnual', e.target.value)} step="0.1" min="-100" />

                      <button type="button" onClick={() => removeAsset(asset.id)} className="ml-2 text-gray-400 hover:text-rose-500">✕</button>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <button type="button" onClick={addAsset} className="inline-flex items-center gap-2 rounded-md bg-[#ffc709] px-4 py-2 text-sm font-bold text-black hover:bg-yellow-500">+ Adicionar Ativo</button>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-gray-900">Aporte Mensal (R$)</span>
                  <input type="text" value={monthlyContribution} onChange={(e) => handleCurrencyInput(e.target.value, setMonthlyContribution)} placeholder={formatCurrencyValue(0)} className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
                </label>

                <div>
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-gray-900">Idade Atual</span>
                    <input type="number" value={currentAge} onChange={(e) => setCurrentAge(Number(e.target.value))} min="18" className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
                  </label>

                  <label className="block mt-3">
                    <span className="mb-2 block text-sm font-semibold text-gray-900">Idade de Resgate</span>
                    <input type="number" value={rescueAge} onChange={(e) => setRescueAge(Number(e.target.value))} min={currentAge + 1} className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
                    <p className="mt-1 text-xs text-gray-500">Prazo calculado: {years} anos</p>
                  </label>

                  <label className="block mt-3">
                    <span className="mb-2 block text-sm font-semibold text-gray-900">Inflação Projetada (% a.a.)</span>
                    <input type="number" value={inflationRate} onChange={(e) => setInflationRate(Number(e.target.value))} step="0.1" className="w-full rounded-md border border-gray-300 bg-white px-4 py-3 text-base text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
                    <p className="mt-1 text-xs text-gray-500">Usada para converter taxa nominal → taxa real pela Equação de Fisher</p>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-md border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs uppercase tracking-widest font-semibold text-gray-700">Narrativa de venda</p>
            <h3 className="mt-3 text-xl font-bold text-gray-900">O cenário atual está deixando valor sobre a mesa.</h3>
            <p className="mt-3 text-sm leading-6 text-gray-600">Com a estruturação certa, o capital não apenas cresce, mas passa a trabalhar com uma velocidade muito maior no longo prazo.</p>
            <div className="mt-6 rounded-md border border-gray-200 bg-gray-50 p-4">
              <p className="text-xs uppercase tracking-widest font-semibold text-gray-600">Premissa de retorno</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">A Inércia</p>
                  <div className="mt-2 flex items-center gap-2">
                    <input type="number" value={inertiaRate} onChange={(e) => { setInertiaRate(Number(e.target.value)); setInertiaManual(true); }} step="0.01" className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
                    <span className="text-sm text-gray-700 font-medium">% a.a.</span>
                  </div>
                  <p className="mt-2 text-xs text-gray-500">Taxa ponderada: {weightedRate.toFixed(2)}% (calculada)</p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Carteira Otimizada — Taxa Real Proposta</p>
                  <div className="mt-2 flex items-center gap-2">
                    <input type="number" value={optimizedRate} onChange={(e) => setOptimizedRate(Number(e.target.value))} step="0.1" className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" />
                    <span className="text-sm text-gray-700 font-medium">% a.a.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-md border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">Card 1</p>
                <h3 className="mt-1 text-xl font-bold text-gray-900">A Inércia</h3>
              </div>
              <span className="rounded-md border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-900 bg-gray-50">{Number(inertiaReal).toFixed(2)}% real</span>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                <p className="text-sm text-gray-600">Valor final</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{currency.format(inertiaResult.finalValue)}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Total aportado</p>
                  <p className="mt-2 text-lg font-bold text-gray-900">{currency.format(inertiaResult.totalContributed)}</p>
                </div>
                <div className="rounded-md border border-gray-200 bg-gray-50 p-4">
                  <p className="text-sm text-gray-600">Ganho</p>
                  <p className="mt-2 text-lg font-bold text-gray-900">{currency.format(inertiaResult.gain)}</p>
                </div>
              </div>
            </div>
          </article>

          <article className="rounded-md border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-gray-500">Card 2</p>
                <h3 className="mt-1 text-xl font-bold text-gray-900">Carteira Otimizada</h3>
              </div>
              <span className="rounded-md border border-gray-200 px-3 py-1 text-sm font-semibold text-gray-900 bg-yellow-50">{Number(optimizedRate).toFixed(2)}% real</span>
            </div>
            <div className="mt-6 space-y-4">
              <div className="rounded-md border border-gray-200 bg-yellow-50 p-4">
                <p className="text-sm text-gray-600">Valor final</p>
                <p className="mt-2 text-2xl font-bold text-gray-900">{currency.format(optimizedResult.finalValue)}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-md border border-gray-200 bg-yellow-50 p-4">
                  <p className="text-sm text-gray-600">Total aportado</p>
                  <p className="mt-2 text-lg font-bold text-gray-900">{currency.format(optimizedResult.totalContributed)}</p>
                </div>
                <div className="rounded-md border border-gray-200 bg-yellow-50 p-4">
                  <p className="text-sm text-gray-600">Ganho</p>
                  <p className="mt-2 text-lg font-bold text-gray-900">{currency.format(optimizedResult.gain)}</p>
                </div>
              </div>
            </div>
          </article>
        </section>

        {/* Chart between cards and banner */}
        <div className="rounded-md border border-gray-200 bg-white p-4 shadow-sm">
          <h4 className="text-sm font-semibold text-gray-900 mb-4">Projeção de performance (ano a ano)</h4>
          <div style={{ width: '100%', height: 320 }}>
            <PerformanceChart data={chartData} />
          </div>
        </div>

        <section className="rounded-md border-2 border-[#ffc709] bg-white px-6 py-8 text-center shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-600">Destaque executivo</p>
          <h3 className="mt-3 text-3xl font-bold text-gray-900 sm:text-4xl">
            <span className="bg-[#ffc709] px-2 py-1 rounded">Dinheiro deixado na mesa:</span> {currency.format(Math.abs(delta))}
          </h3>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">{isPositive ? 'A estruturação proposta pode gerar um ganho adicional de capital que, no longo prazo, se transforma em uma vantagem competitiva real.' : 'Mesmo em cenários adversos, a diferença entre os modelos mostra que cada decisão de alocação impacta profundamente o resultado final.'}</p>
        </section>
          </>
        )}

        {activeTab === 'CARTEIRA' && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full bg-transparent">
            <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
              <div className="mb-4">
                <p className="text-sm font-semibold text-gray-500">Distribuição do Patrimônio</p>
              </div>
              <div className="h-[320px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={allocationData} dataKey="valor" nameKey="nomeDoAtivo" innerRadius={60} outerRadius={80} paddingAngle={2}>
                      {allocationData.map((entry, index) => (
                        <Cell key={`cell-${entry.id}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => currency.format(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 w-full">
              <div className="rounded-md bg-gray-50 p-5 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500">Perfil de Risco</p>
                <p className="mt-2 text-lg font-bold text-gray-900">Moderado / Arrojado</p>
              </div>
              <div className="rounded-md bg-gray-50 p-5 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500">Liquidez</p>
                <p className="mt-2 text-lg font-bold text-gray-900">Baixa (Ativos travados no longo prazo)</p>
              </div>
              <div className="rounded-md bg-gray-50 p-5 shadow-sm border border-gray-200">
                <p className="text-sm font-semibold text-green-700">Pontos Fortes</p>
                <p className="mt-2 text-gray-700">Busca inteligente por veículos isentos de IR (CRI e FIIs).</p>
              </div>
              <div className="rounded-md bg-gray-50 p-5 shadow-sm border border-gray-200">
                <p className="text-sm font-semibold text-amber-600">Pontos de Atenção</p>
                <p className="mt-2 text-gray-700">Excesso de capital inercial e rentabilidade real sendo corroída pela inflação do período.</p>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'EVOLUCAO' && (
          <div className="flex items-center justify-center min-h-[500px] bg-white border border-gray-200 rounded-md shadow-sm text-gray-500 text-lg">
            Módulo de Projeção de Renda e Roadmap (Em desenvolvimento)
          </div>
        )}
      </div>
    </main>
  );
}
