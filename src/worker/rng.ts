/** Small numeric helpers shared by the market and strategies. */

export function gaussian(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundToTick(price: number, tick: number, direction: 'down' | 'up' | 'nearest' = 'nearest'): number {
  const scaled = price / tick;
  const units = direction === 'down' ? Math.floor(scaled + 1e-9) : direction === 'up' ? Math.ceil(scaled - 1e-9) : Math.round(scaled);
  return Number((units * tick).toFixed(6));
}

export function randomInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function uid(prefix = ''): string {
  return `${prefix}${crypto.randomUUID().slice(0, 8)}`;
}
