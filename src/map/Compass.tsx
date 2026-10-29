/**
 * N/S/E/W rose. `rotationDeg` turns the rose so that N points to true north
 * relative to what is drawn (0 = north is up).
 */
export function Compass({ rotationDeg }: { rotationDeg: number }) {
  return (
    <div className="compass" role="img" aria-label={`Компас: север е завъртян на ${Math.round(((rotationDeg % 360) + 360) % 360)}°`}>
      <svg viewBox="-50 -50 100 100">
        <g transform={`rotate(${rotationDeg})`}>
          <polygon points="0,-34 8,0 0,6 -8,0" fill="#b42318" />
          <polygon points="0,34 8,0 0,-6 -8,0" fill="#0b1620" />
          {[
            ['N', 0, -40, '#b42318'],
            ['S', 0, 46, '#0b1620'],
            ['E', 42, 6, '#0b1620'],
            ['W', -42, 6, '#0b1620'],
          ].map(([label, x, y, color]) => (
            <text key={label as string} x={x as number} y={y as number} textAnchor="middle" fontSize="15" fontWeight="900" fill={color as string}
              transform={`rotate(${-rotationDeg} ${x} ${(y as number) - 5})`}>
              {label}
            </text>
          ))}
        </g>
      </svg>
    </div>
  );
}
