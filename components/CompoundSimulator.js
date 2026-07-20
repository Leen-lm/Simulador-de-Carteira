'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
const PerformanceChart = dynamic(() => import('./PerformanceChart'), { ssr: false });
import EvolutionTab from './EvolutionTab';
import GoalCalculator from './GoalCalculator';

const currency = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});

// Cores melhoradas para contraste WCAG AA (ajustado amarelo para laranja mais escuro)
const FALLBACK_PALETTE = [
  '#1f2937', '#f59e0b', '#6b7280', '#9ca3af', '#d1d5db',
  '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#14b8a6',
  '#f97316', '#0ea5e9', '#a855f7', '#84cc16', '#ec4899',
];
const ASSET_COLORS = {
  'Caixa (Fundo DI)': '#1f2937',
  'CRI': '#f59e0b',
  'FIIs': '#6b7280',
  'Criptomoeda': '#ef4444',
  'Ações': '#3b82f6',
  'ETFs': '#10b981',
};
const FAMILY_BASE_COLOR = {
  caixa: '#1f2937',
  cri: '#f59e0b',
  fii: '#6b7280',
  etf: '#10b981',
  acoes: '#3b82f6',
  cripto: '#ef4444',
  previdencia: '#8b5cf6',
};
function detectAssetFamily(nome) {
  const n = (nome || '').toLowerCase();
  if (n.includes('caixa') || n.includes(' di') || n.includes('liquidez')) return 'caixa';
  if (n.includes('cri')) return 'cri';
  if (n.includes('fii')) return 'fii';
  if (n.includes('etf')) return 'etf';
  if (n.includes('ação') || n.includes('acoes') || n.includes('ações')) return 'acoes';
  if (n.includes('cripto') || n.includes('bitcoin') || n.includes('btc')) return 'cripto';
  if (n.includes('previdência') || n.includes('previdencia')) return 'previdencia';
  return null;
}
function hexToHsl(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}
function hslToHex(h, s, l) {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n) => lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x) => Math.round(255 * x).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}
// Variação de luminosidade da cor-base para o N-ésimo ativo de uma mesma família,
// mantendo o matiz (identidade visual da categoria) e alternando claro/escuro.
function shadeForOccurrence(baseHex, occurrenceIndex) {
  if (occurrenceIndex === 0) return baseHex;
  const [h, s, l] = hexToHsl(baseHex);
  const step = 10;
  const direction = occurrenceIndex % 2 === 0 ? 1 : -1;
  const magnitude = Math.ceil(occurrenceIndex / 2) * step;
  const newL = Math.min(85, Math.max(15, l + direction * magnitude));
  return hslToHex(h, Math.min(90, s), newL);
}
// Mapa { id do ativo -> cor }, sem repetir cor entre ativos diferentes:
// 1) nome exato conhecido, 2) família detectada (variando o tom por ocorrência),
// 3) paleta ampliada como último recurso, ciclando só entre os "sem categoria".
function buildAssetColorMap(entries) {
  const familyCounts = {};
  let fallbackCount = 0;
  const map = {};

  entries.forEach((entry) => {
    if (ASSET_COLORS[entry.nomeDoAtivo]) {
      map[entry.id] = ASSET_COLORS[entry.nomeDoAtivo];
      return;
    }

    const family = detectAssetFamily(entry.nomeDoAtivo);
    if (family && FAMILY_BASE_COLOR[family]) {
      const occurrence = familyCounts[family] || 0;
      familyCounts[family] = occurrence + 1;
      map[entry.id] = shadeForOccurrence(FAMILY_BASE_COLOR[family], occurrence);
      return;
    }

    map[entry.id] = FALLBACK_PALETTE[fallbackCount % FALLBACK_PALETTE.length];
    fallbackCount += 1;
  });

  return map;
}

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

  // Runtime accessibility check: warn in dev console if any asset color has poor contrast vs white (WCAG AA threshold ~4.5)
  useEffect(() => {
    const hexToRgb = (hex) => {
      const h = hex.replace('#', '');
      if (h.length === 3) {
        return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)];
      }
      if (h.length !== 6) return null;
      return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
    };
    const lum = (r, g, b) => {
      const a = [r, g, b].map((v) => {
        v = v / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
    };
    const contrastRatio = (rgb1, rgb2) => {
      const L1 = lum(rgb1[0], rgb1[1], rgb1[2]);
      const L2 = lum(rgb2[0], rgb2[1], rgb2[2]);
      return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    };

    FALLBACK_PALETTE.forEach((c) => {
      const rgb = hexToRgb(c);
      if (!rgb) return;
      const cr = contrastRatio([255, 255, 255], rgb);
      if (cr < 4.5) {
        // Non-blocking: warn developer so colors can be adjusted later
        // This doesn't change behavior in production but is helpful during development
        // For yellow-ish slices consider darker stroke/legend color to improve readability.
        // eslint-disable-next-line no-console
        console.warn(`Low contrast for asset color ${c} vs white: contrast=${cr.toFixed(2)}. Consider choosing a darker color for accessibility.`);
      }
    });
  }, []);

  // Helpers for parsing/formatting
  function handleCurrencyInput(rawValue, setter) {
    // Remove non-digits only — ensures no negative values
    let digits = String(rawValue).replace(/\D/g, '');
    if (digits === '') {
      setter('');
      return;
    }
    const num = Number(digits);
    setter(formatCurrencyValue(num));
  }

  function handleAssetCurrencyInput(id, rawValue) {
    // Remove non-digits, ensuring no negative values slip through
    let digits = String(rawValue).replace(/\D/g, '');
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
  const numericAssetValues = useMemo(() => assets.map((a) => ({ ...a, numericValor: Math.max(0, parseCurrencyString(a.valor)), numericTaxa: Number(a.taxaAnual) || 0 })), [assets]);
  const principalSum = useMemo(() => numericAssetValues.reduce((sum, a) => sum + a.numericValor, 0), [numericAssetValues]);
  const allocationData = useMemo(() => numericAssetValues.map((a) => ({ id: a.id, nomeDoAtivo: a.nomeDoAtivo, valor: a.numericValor, percent: principalSum ? (a.numericValor / principalSum) * 100 : 0 })), [numericAssetValues, principalSum]);
  const assetColorMap = useMemo(() => buildAssetColorMap(allocationData), [allocationData]);

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
  // Use inertiaManual to respect a user-set 0% (0 is falsy), so treat manual edits explicitly.
  const inertiaReal = useMemo(() => {
    const nominal = Number(inertiaManual ? inertiaRate : weightedRate) / 100; // in decimal
    const inflation = Number(inflationRate) / 100; // in decimal
    const realDecimal = (1 + nominal) / (1 + inflation) - 1;
    return Number((realDecimal * 100).toFixed(2));
  }, [inertiaRate, weightedRate, inflationRate, inertiaManual]);

  // Portfolio analysis: risk, liquidity, strengths and attention points derived from composition + inertiaReal
  // Business thresholds (ajustáveis conforme estratégia):
  // - >15% em CRI/FII → strength (eficiência tributária)
  // - >=4 ativos com >=5% cada → strength (boa diversificação)
  // - >50% em caixa/di/renda fixa → attention (risco de retorno real baixo)
  // - inertiaReal < 0 → attention (patrimônio perde poder de compra)
  // - 1 ativo >70% (com >1 ativo total) → attention (concentração de risco)
  // - 0% em caixa → attention (ausência de reserva de liquidez)
  // - Se arrays vazios → mensagens neutras padrão
  const portfolioAnalysis = useMemo(() => {
    const strengths = [];
    const attentionPoints = [];
    const total = principalSum || 0;

    if (total === 0) {
      strengths.push('Sem patrimônio declarado — insira valores para uma análise mais precisa.');
      attentionPoints.push('Sem patrimônio declarado — análise não disponível.');
      return { riskProfile: 'Indefinido', liquidityProfile: 'Indefinido', strengths, attentionPoints };
    }

    const lower = (s) => (s || '').toLowerCase();

    const isentoSum = numericAssetValues.reduce((acc, a) => {
      const n = lower(a.nomeDoAtivo);
      return (n.includes('cri') || n.includes('fii')) ? acc + a.numericValor : acc;
    }, 0);
    const fracIsento = (isentoSum / total) * 100;
    if (fracIsento > 15) strengths.push(`Eficiência tributária: ${fracIsento.toFixed(1)}% do patrimônio em ativos isentos de IR (ex.: CRI/FII).`);

    const assetsOver5 = numericAssetValues.filter((a) => (a.numericValor / total) * 100 >= 5).length;
    if (assetsOver5 >= 4) strengths.push('Boa diversificação: múltiplos ativos com peso relevante (>=5%).');

    const caixaSum = numericAssetValues.reduce((acc, a) => {
      const n = lower(a.nomeDoAtivo);
      return (n.includes('caixa') || n.includes('di') || n.includes('renda fixa')) ? acc + a.numericValor : acc;
    }, 0);
    const fracCaixa = (caixaSum / total) * 100;
    if (fracCaixa > 50) attentionPoints.push(`Alerta: ${fracCaixa.toFixed(1)}% em caixa/renda fixa — risco de perda de rentabilidade real.`);

    if (Number(inertiaReal) < 0) attentionPoints.push('A taxa real da carteira é negativa — o patrimônio perde poder de compra frente à inflação.');

    const topAsset = numericAssetValues.reduce((prev, curr) => (curr.numericValor > (prev.numericValor || 0) ? curr : prev), { numericValor: 0 });
    if (numericAssetValues.length > 1 && (topAsset.numericValor / total) * 100 > 70) {
      attentionPoints.push(`Concentração: ${topAsset.nomeDoAtivo || 'Ativo'} representa ${((topAsset.numericValor / total) * 100).toFixed(1)}% do patrimônio.`);
    }

    if (fracCaixa === 0) attentionPoints.push('Ausência de caixa: sem reserva de liquidez imediata.');

    if (strengths.length === 0) strengths.push('Nenhum ponto forte destacado; considere diversificação e eficiência fiscal.');
    if (attentionPoints.length === 0) attentionPoints.push('Nenhum ponto de atenção crítico identificado.');

    const riskProfile = fracCaixa > 70 ? 'Conservador' : fracCaixa > 40 ? 'Moderado' : 'Arrojado';
    const liquidityProfile = fracCaixa > 50 ? 'Alta' : fracCaixa > 20 ? 'Média' : 'Baixa';

    return { riskProfile, liquidityProfile, strengths, attentionPoints };
  }, [numericAssetValues, principalSum, inertiaReal]);

  // expose analysis results for UI
  const { riskProfile, liquidityProfile, strengths, attentionPoints } = portfolioAnalysis;

  // years and monthly numeric
  // Allow detection of invalid rescueAge (<= currentAge) and surface an error rather than silently forcing a minimum.
  const rescueAgeNumeric = Number(rescueAge);
  const currentAgeNumeric = Number(currentAge);
  const years = rescueAgeNumeric > currentAgeNumeric ? rescueAgeNumeric - currentAgeNumeric : 0;
  const rescueAgeError = rescueAgeNumeric <= currentAgeNumeric;
  const numericMonthly = useMemo(() => Math.max(0, parseCurrencyString(monthlyContribution)), [monthlyContribution]);

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
      <header className="bg-black text-white px-10 py-4 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="ml-8 text-sm font-semibold text-white">Simulador de Carteira</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        {/* Fake navigation header (XP-inspired tabs) */}
        <div className="border-b border-gray-300 pb-2">
          <div role="tablist" className="flex flex-wrap items-center gap-8 text-sm font-medium">
            <button role="tab" aria-selected={activeTab === 'INICIO'} type="button" onClick={() => setActiveTab('INICIO')} className={activeTab === 'INICIO' ? 'inline-flex pb-2 text-gray-900 border-b-2 border-black font-semibold' : 'inline-flex pb-2 text-gray-400 hover:text-gray-700 cursor-pointer'}>
              📊 INÍCIO
            </button>
            <button role="tab" aria-selected={activeTab === 'CARTEIRA'} type="button" onClick={() => setActiveTab('CARTEIRA')} className={activeTab === 'CARTEIRA' ? 'inline-flex pb-2 text-gray-900 border-b-2 border-black font-semibold' : 'inline-flex pb-2 text-gray-400 hover:text-gray-700 cursor-pointer'}>
              💼 CARTEIRA
            </button>
            <button role="tab" aria-selected={activeTab === 'EVOLUCAO'} type="button" onClick={() => setActiveTab('EVOLUCAO')} className={activeTab === 'EVOLUCAO' ? 'inline-flex pb-2 text-gray-900 border-b-2 border-black font-semibold' : 'inline-flex pb-2 text-gray-400 hover:text-gray-700 cursor-pointer'}>
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

                          <input className="w-4/12 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" value={asset.valor} onChange={(e) => handleAssetCurrencyInput(asset.id, e.target.value)} placeholder={formatCurrencyValue(0)} inputMode="numeric" />

                          <input className="w-2/12 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-yellow-400 focus:border-transparent" type="number" value={asset.taxaAnual} onChange={(e) => updateAssetField(asset.id, 'taxaAnual', e.target.value)} step="0.1" min="-100" />

                          <button type="button" aria-label={`Remover ${asset.nomeDoAtivo || 'ativo'}`} onClick={() => removeAsset(asset.id)} className="ml-2 text-gray-400 hover:text-rose-500">✕</button>
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
                        <input type="number" value={rescueAge} onChange={(e) => { const val = Number(e.target.value); if (val > currentAgeNumeric) setRescueAge(val); }} min={currentAgeNumeric + 1} className={`w-full rounded-md border px-4 py-3 text-base text-gray-900 outline-none focus:ring-2 focus:border-transparent ${rescueAgeError ? 'border-rose-500 bg-rose-50 focus:ring-rose-400' : 'border-gray-300 bg-white focus:ring-yellow-400'}`} />
                        {rescueAgeError ? (
                          <p className="mt-1 text-xs text-rose-500">Erro: Idade de resgate deve ser maior que a idade atual ({currentAgeNumeric}).</p>
                        ) : (
                          <p className="mt-1 text-xs text-gray-500">Prazo calculado: {years} anos</p>
                        )}
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
            <GoalCalculator
              principalSum={principalSum}
              years={years}
              optimizedRate={optimizedRate}
              currentMonthlyContribution={numericMonthly}
              rescueAge={rescueAge}
            />
          </>
        )}

        {activeTab === 'CARTEIRA' && (
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full bg-transparent">
            <div className="rounded-md border border-gray-200 bg-white p-6 shadow-sm">
              <div className="relative h-[420px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={allocationData}
                      dataKey="valor"
                      nameKey="nomeDoAtivo"
                      cx="50%"
                      cy="45%"
                      innerRadius={120}
                      outerRadius={170}
                      paddingAngle={2}
                    >
                      {allocationData.map((entry) => (
                        <Cell key={`cell-${entry.id}`} fill={assetColorMap[entry.id]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => currency.format(value)} />
                  </PieChart>
                </ResponsiveContainer>

                {/* O Coração do Gráfico (Centralizado à força na mesma posição cy="45%") */}
                <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-xs font-medium text-gray-400 uppercase tracking-widest">Patrimônio</span>
                  <span className="text-2xl font-bold text-gray-900">
                    {currency.format(principalSum)}
                  </span>
                </div>
              </div>

              {/* Lista auxiliar com percentuais por ativo (nome | valor | %) */}
              <div className="mt-4 w-full">
                <table className="w-full text-sm">
                  <thead className="sr-only">
                    <tr>
                      <th>Ativo</th>
                      <th>Valor</th>
                      <th>%</th>
                    </tr>
                  </thead>
                  <tbody className="text-gray-700">
                    {allocationData.map((entry) => (
                      <tr key={entry.id} className="border-t">
                        <td className="py-2">
                          <span className="inline-flex items-center gap-2">
                            <span
                              className="inline-block h-3 w-3 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: assetColorMap[entry.id] }}
                            />
                            {entry.nomeDoAtivo}
                          </span>
                        </td>
                        <td className="py-2 text-right">{currency.format(entry.valor)}</td>
                        <td className="py-2 text-right">{entry.percent ? `${entry.percent.toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>

            <div className="grid grid-cols-1 gap-4 w-full">
              <div className="rounded-md bg-gray-50 p-5 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500">Perfil de Risco</p>
                <p className="mt-2 text-lg font-bold text-gray-900">{riskProfile}</p>
              </div>
              <div className="rounded-md bg-gray-50 p-5 shadow-sm border border-gray-200">
                <p className="text-sm text-gray-500">Liquidez</p>
                <p className="mt-2 text-lg font-bold text-gray-900">{liquidityProfile}</p>
              </div>
              <div className="rounded-md bg-gray-50 p-5 shadow-sm border border-gray-200">
                <p className="text-sm font-semibold text-green-700">Pontos Fortes</p>
                <ul className="mt-2 space-y-1 text-gray-700 list-disc list-inside">
                  {strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md bg-gray-50 p-5 shadow-sm border border-gray-200">
                <p className="text-sm font-semibold text-amber-600">Pontos de Atenção</p>
                <ul className="mt-2 space-y-1 text-gray-700 list-disc list-inside">
                  {attentionPoints.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'EVOLUCAO' && (
          <EvolutionTab
            principalSum={principalSum}
            numericMonthly={numericMonthly}
            years={years}
            optimizedRate={optimizedRate}
          />
        )}
      </div>
      <footer className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <p className="text-xs text-gray-400 text-center">Esta simulação tem caráter educacional e não constitui recomendação de investimento. Rentabilidade passada não garante resultados futuros.</p>
      </footer>
    </main>
  );
}