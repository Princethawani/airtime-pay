let _counter = 0;

export function generateRef(prefix = "ref"): string {
  _counter += 1;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix.toUpperCase()}-${rand}-${_counter}`;
}

export function generateTxId(): string {
  return generateRef("TX");
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function resetCounter(): void {
  _counter = 0;
}