import { useId } from 'react';

export function Sparkline({
  data,
  color = '#38bdf8',
  width = 92,
  height = 30,
  fill = false,
  strokeWidth = 1.6,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  strokeWidth?: number;
}) {
  const id = useId().replace(/:/g, '');
  if (!data || data.length < 2) {
    return (
      <svg width={width} height={height} className="sparkline" aria-hidden="true">
        <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" strokeOpacity="0.16" />
      </svg>
    );
  }
  const slice = data.slice(-64);
  const min = Math.min(...slice);
  const max = Math.max(...slice);
  const range = max - min || 1;
  const pad = 2;
  const points = slice.map((value, index) => {
    const x = (index / (slice.length - 1)) * (width - pad * 2) + pad;
    const y = height - pad - ((value - min) / range) * (height - pad * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const line = points.join(' ');
  const area = `M${pad},${height - pad} L${line.replaceAll(' ', ' L')} L${width - pad},${height - pad} Z`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="sparkline" aria-hidden="true">
      {fill && (
        <>
          <defs>
            <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity="0.28" />
              <stop offset="1" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#spark-${id})`} />
        </>
      )}
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
