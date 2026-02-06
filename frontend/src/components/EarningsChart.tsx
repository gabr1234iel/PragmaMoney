"use client";

import { useMemo } from "react";

interface EarningsChartProps {
  className?: string;
}

export function EarningsChart({ className = "" }: EarningsChartProps) {
  // Generate stable mock data using a seeded pseudo-random number generator
  const data = useMemo(() => {
    const points = [];
    let seed = 42;
    for (let i = 0; i < 30; i++) {
      // Linear congruential generator for consistent pseudo-random values
      seed = (seed * 16807) % 2147483647;
      points.push({
        day: i + 1,
        amount: 10 + (seed % 140), // Range: 10-150 USDC
      });
    }
    return points;
  }, []);

  // Chart dimensions and padding
  const width = 800;
  const height = 300;
  const padding = { top: 40, right: 40, bottom: 40, left: 60 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate scales
  const maxAmount = Math.max(...data.map((d) => d.amount));
  const minAmount = Math.min(...data.map((d) => d.amount));
  const amountRange = maxAmount - minAmount;

  // Scale functions
  const xScale = (day: number) =>
    padding.left + ((day - 1) / 29) * chartWidth;
  const yScale = (amount: number) =>
    padding.top +
    chartHeight -
    ((amount - minAmount) / amountRange) * chartHeight;

  // Generate path data for the line
  const linePath = useMemo(() => {
    return data
      .map((point, i) => {
        const x = xScale(point.day);
        const y = yScale(point.amount);
        return `${i === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [data]);

  // Generate path data for the filled area
  const areaPath = useMemo(() => {
    const bottomY = padding.top + chartHeight;
    const firstX = xScale(1);
    const lastX = xScale(30);

    return `${linePath} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [linePath]);

  // Y-axis labels (5 ticks)
  const yTicks = useMemo(() => {
    const ticks = [];
    for (let i = 0; i <= 4; i++) {
      const value = minAmount + (amountRange / 4) * i;
      const y = yScale(value);
      ticks.push({ value: Math.round(value), y });
    }
    return ticks;
  }, [minAmount, amountRange]);

  // X-axis labels
  const xTicks = [
    { day: 1, label: "Day 1" },
    { day: 10, label: "Day 10" },
    { day: 20, label: "Day 20" },
    { day: 30, label: "Day 30" },
  ];

  return (
    <div className={`w-full ${className}`}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto"
        style={{ maxHeight: "300px" }}
      >
        {/* Define gradient for area fill */}
        <defs>
          <linearGradient id="areaGradient" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#E85D4E" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#E85D4E" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Title */}
        <text
          x={padding.left}
          y={20}
          className="text-sm font-serif font-semibold"
          fill="#1a1a1a"
        >
          Daily Agent Pulls (USDC)
        </text>

        {/* Subtitle */}
        <text
          x={padding.left}
          y={36}
          className="text-xs font-serif"
          fill="#666666"
          opacity="0.7"
        >
          Historical on-chain data coming soon
        </text>

        {/* Grid lines (horizontal) */}
        {yTicks.map((tick, i) => (
          <line
            key={i}
            x1={padding.left}
            y1={tick.y}
            x2={width - padding.right}
            y2={tick.y}
            stroke="#e0e0e0"
            strokeWidth="1"
            opacity="0.5"
          />
        ))}

        {/* Y-axis labels */}
        {yTicks.map((tick, i) => (
          <text
            key={i}
            x={padding.left - 12}
            y={tick.y}
            textAnchor="end"
            alignmentBaseline="middle"
            className="text-xs font-serif"
            fill="#666666"
          >
            ${tick.value}
          </text>
        ))}

        {/* X-axis labels */}
        {xTicks.map((tick, i) => (
          <text
            key={i}
            x={xScale(tick.day)}
            y={height - padding.bottom + 20}
            textAnchor="middle"
            className="text-xs font-serif"
            fill="#666666"
          >
            {tick.label}
          </text>
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#areaGradient)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#E85D4E"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points (optional subtle dots) */}
        {data.map((point, i) => (
          <circle
            key={i}
            cx={xScale(point.day)}
            cy={yScale(point.amount)}
            r="3"
            fill="#E85D4E"
            opacity="0.6"
          />
        ))}
      </svg>
    </div>
  );
}
