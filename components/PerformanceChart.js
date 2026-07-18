'use client';

import React from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export default function PerformanceChart({ data }) {
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  return (    <ResponsiveContainer>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="#e5e7eb" strokeDasharray="0" strokeOpacity={0.3} />
        <XAxis dataKey="year" stroke="#6b7280" />
        <YAxis tickFormatter={(v) => currency.format(v)} stroke="#6b7280" />
        <Tooltip formatter={(value) => currency.format(value)} labelFormatter={(label) => `Ano ${label}`} />
        <Line type="monotone" dataKey="Inercia" stroke="#1f2937" strokeWidth={2.5} dot={false} />
        <Line type="monotone" dataKey="Otimizada" stroke="#16a34a" strokeWidth={2.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
