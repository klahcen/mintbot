import type { State } from '../model.js';
import { decimal } from './types.js';
/** Fresh net executable marks only; entry cost is never presented as a current liquidation quote. */
export function paperValuation(state: State, now = Date.now()) {
  const positionsDetail = state.positions.filter(p => p.market).map(p => {
    const mark = state.marketReviews?.find(r => r.id === `mark:${p.id}`);
    const evidence = mark?.evidence;
    const fresh = mark && !mark.reasons.length && now >= p.priceAt && now - p.priceAt <= 1500 &&
      now >= mark.at && now - mark.at <= 1500 && typeof evidence?.unrealizedPnlLamports === 'string';
    return { mint: p.mint, protocol: p.market!.venue, quantityAtoms: p.market!.atoms,
      markStatus: fresh ? 'verified' as const : mark ? 'stale' as const : 'unknown' as const,
      ...(mark ? {markAt: p.priceAt} : {}),
      ...(fresh ? {pnlSol: decimal(BigInt(evidence.unrealizedPnlLamports as string), 9)} : {}) };
  });
  const complete = positionsDetail.every(p => p.markStatus === 'verified');
  const pnl = state.positions.filter(p => p.market).reduce((sum, p) => {
    const mark = state.marketReviews?.find(r => r.id === `mark:${p.id}`);
    return sum + BigInt((mark?.evidence?.unrealizedPnlLamports as string | undefined) ?? '0');
  }, 0n);
  return {positions: positionsDetail.length, trades: state.trades.filter(t => t.market).length,
    realizedPnlSol: decimal(BigInt(state.marketLedger?.realizedPnlLamports ?? '0'), 9),
    ...(complete ? {unrealizedPnlSol: decimal(pnl, 9)} : {}), positionsDetail};
}
