/** Display the server's per-request snapshot, never recompute historical cost. */
export function pricingSnapshot(basis: string) {
  const band = basis.match(/^estimate:[^:]+:(peak|off_peak):CNY\/1M(?:;|$)/)?.[1];
  const start = basis.match(/(?:^|;)request_start=([^;]+)/)?.[1];
  const rates = basis.match(/(?:^|;)rates=([^;]+)/)?.[1];
  return band ? { label: band === 'peak' ? '峰时费率' : '谷时费率', start, rates } : null;
}
