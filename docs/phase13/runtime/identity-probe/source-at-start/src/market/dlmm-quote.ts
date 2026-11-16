import { ceilDiv } from "./types.js";
/** Pinned Meteora helpers fee.ts/bin.ts and DLMM.updateReference/updateVolatilityAccumulator.
 * Three recorded bin arrays maximum; no partial fills or limit-order inventory. */
export function quoteDlmm(model: any, side: "buy" | "sell", input: bigint) {
  const p = model.parameters,
    v = model.volatility;
  const elapsed = BigInt(model.timestamp) - BigInt(v.last_update_timestamp);
  if (elapsed < 0n) throw Error("DLMM clock precedes volatility state");
  let indexReference = v.index_reference,
    reference = BigInt(v.volatility_reference);
  if (elapsed >= BigInt(p.filter_period)) {
    indexReference = model.activeId;
    reference =
      elapsed < BigInt(p.decay_period)
        ? (BigInt(v.volatility_accumulator) * BigInt(p.reduction_factor)) /
          10000n
        : 0n;
  }
  const swapForY = side === "sell";
  const onInput = p.collect_fee_mode === 0 || !swapForY;
  let left = input,
    output = 0n,
    totalFee = 0n,
    startPrice = 0n;
  const bins = new Map<number, any>(model.bins.map((b: any) => [b.id, b]));
  for (
    let id = model.activeId, visited = 0;
    left > 0n && visited < 210;
    id += swapForY ? -1 : 1, visited++
  ) {
    const b = bins.get(id);
    if (!b) throw Error("DLMM route exceeds verified bin arrays");
    const available = BigInt(swapForY ? b.y : b.x);
    if (available === 0n) continue;
    const price = BigInt(b.price);
    if (price <= 0n) throw Error("Invalid DLMM bin price");
    if (!startPrice) startPrice = price;
    const volatility =
      reference + BigInt(Math.abs(indexReference - id)) * 10000n;
    const accumulator =
      volatility > BigInt(p.max_volatility_accumulator)
        ? BigInt(p.max_volatility_accumulator)
        : volatility;
    const base =
      BigInt(p.base_factor) *
      BigInt(model.binStep) *
      10n *
      10n ** BigInt(p.base_fee_power_factor);
    const variable = ceilDiv(
      BigInt(p.variable_fee_control) *
        (accumulator * BigInt(model.binStep)) ** 2n,
      100000000000n,
    );
    const rate = base + variable > 100000000n ? 100000000n : base + variable;
    const net = onInput ? left - ceilDiv(left * rate, 1000000000n) : left;
    const needed = swapForY
      ? ceilDiv(available * (1n << 64n), price)
      : ceilDiv(available * price, 1n << 64n);
    const used = net >= needed ? needed : net;
    const grossOut =
      net >= needed
        ? available
        : swapForY
          ? (used * price) / (1n << 64n)
          : (used * (1n << 64n)) / price;
    const included = onInput
      ? ceilDiv(used * 1000000000n, 1000000000n - rate)
      : used;
    // Upstream retains the original included amount when no input is left at this bin.
    const consumed = net > needed ? included : left;
    const fee = onInput
      ? consumed - used
      : ceilDiv(grossOut * rate, 1000000000n);
    if (consumed <= 0n || consumed > left || fee < 0n)
      throw Error("Invalid DLMM integer fill");
    output += onInput ? grossOut : grossOut - fee;
    totalFee += fee;
    left -= consumed;
  }
  if (left !== 0n || output <= 0n || startPrice === 0n)
    throw Error("Unavailable complete DLMM sell/buy route");
  const spot = swapForY
    ? (input * startPrice) / (1n << 64n)
    : (input * (1n << 64n)) / startPrice;
  return { output, fee: totalFee, onInput, spot };
}
