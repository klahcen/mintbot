/** Run the retained pinned upstream BN helpers independently of Mintbot's bigint implementation. */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import { quoteDlmm } from "../src/market/dlmm-quote.js";
const require = createRequire(import.meta.url),
  BN = require("bn.js");
const constants = {
  BASIS_POINT_MAX: 10000,
  SCALE_OFFSET: 64,
  FEE_PRECISION: new BN(1000000000),
  MAX_FEE_RATE: new BN(100000000),
  U64_MAX: new BN("18446744073709551615"),
  LIMIT_ORDER_FEE_SHARE: new BN(5000),
};
const modules: Record<string, any> = {
  "../constants": constants,
  "@coral-xyz/anchor": { BN },
  "bn.js": BN,
};
function compile(source: string) {
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  vm.runInNewContext(
    code,
    {
      exports,
      require: (name: string) => {
        if (!(name in modules))
          throw Error("Reference import not allowed: " + name);
        return modules[name];
      },
    },
    { timeout: 1000 },
  );
  return exports as any;
}
const math = ts.createSourceFile(
  "math.ts",
  await readFile("docs/phase4/sources/meteora-math.ts", "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
modules["./math"] = compile(
  "import {BN} from '@coral-xyz/anchor';\n" +
    math.statements
      .filter(
        (n) =>
          ts.isEnumDeclaration(n) ||
          (ts.isFunctionDeclaration(n) &&
            ["mulShr", "shlDiv", "mulDiv"].includes(n.name!.text)),
      )
      .map((n) => n.getText(math))
      .join("\n"),
);
modules["./fee"] = compile(
  await readFile("docs/phase4/sources/meteora-fee.ts", "utf8"),
);
const bin = compile(
  await readFile("docs/phase4/sources/meteora-bin.ts", "utf8"),
);
const parameters = {
  base_factor: 10000,
  filter_period: 30,
  decay_period: 600,
  reduction_factor: 5000,
  variable_fee_control: 40000,
  max_volatility_accumulator: 350000,
  base_fee_power_factor: 0,
  collect_fee_mode: 0,
  protocol_share: 1000,
};
const model = {
  activeId: 0,
  binStep: 10,
  parameters,
  volatility: {
    index_reference: 0,
    volatility_reference: 0,
    volatility_accumulator: 260000,
    last_update_timestamp: "1000",
  },
  timestamp: "2000",
  bins: Array.from({ length: 5 }, (_, i) => ({
    id: i - 2,
    x: "1000",
    y: "1000",
    price: ((1n << 64n) * BigInt(i + 1)).toString(),
  })),
};
const rows = [];
for (const mode of [0, 1])
  for (const side of ["buy", "sell"] as const)
    for (const input of [1n, 100n, 500n, 1500n]) {
      const copy = structuredClone(model);
      copy.parameters.collect_fee_mode = mode;
      let left = new BN(input.toString()),
        out = new BN(0),
        fee = new BN(0);
      const swapForY = side === "sell";
      const onInput = mode === 0 || !swapForY;
      for (let id = 0; !left.isZero(); id += swapForY ? -1 : 1) {
        const b = copy.bins.find((b) => b.id === id);
        if (!b) break;
        const params = {
          baseFactor: 10000,
          baseFeePowerFactor: 0,
          variableFeeControl: 40000,
          maxVolatilityAccumulator: 350000,
          protocolShare: 1000,
        };
        const variable = {
          volatilityAccumulator: Math.min(Math.abs(id) * 10000, 350000),
        };
        const account = {
          amountX: new BN(b.x),
          amountY: new BN(b.y),
          price: new BN(b.price),
          openOrderAmount: new BN(0),
          processedOrderRemainingAmount: new BN(0),
          limitOrderAskSide: 0,
        };
        const q = bin.swapExactInQuoteAtBin(
          account,
          10,
          params,
          variable,
          left,
          swapForY,
          false,
          onInput,
        );
        if (q.amountIn.isZero()) break;
        left = left.sub(q.amountIn);
        out = out.add(q.amountOut);
        fee = fee.add(q.fee).add(q.protocolFee);
      }
      let actual: any;
      try {
        actual = quoteDlmm(copy, side, input);
      } catch (e) {
        if (left.isZero() && !out.isZero()) throw e;
        rows.push({
          mode,
          side,
          input: input.toString(),
          result: "rejected-unfilled-or-zero-output",
        });
        continue;
      }
      if (
        !left.isZero() ||
        actual.output.toString() !== out.toString() ||
        actual.fee.toString() !== fee.toString()
      )
        throw Error(
          `Upstream DLMM mismatch ${mode}/${side}/${input}: ${JSON.stringify({ actual: { out: actual.output.toString(), fee: actual.fee.toString() }, expected: { out: out.toString(), fee: fee.toString(), left: left.toString() } })}`,
        );
      rows.push({
        mode,
        side,
        input: input.toString(),
        output: out.toString(),
        fee: fee.toString(),
        onInput,
      });
    }
await writeFile(
  "docs/phase4/dlmm-reference-vectors.json",
  JSON.stringify(
    {
      source:
        "Unmodified pinned Meteora BN fee.ts/bin.ts and exact math helper declarations; synthetic unit balances, not mainnet liquidity",
      commit: "af36dd53ab180783ccecda306926189a4700953c",
      rows,
    },
    null,
    2,
  ) + "\n",
);
console.log("Verified", rows.length, "DLMM reference cases");
