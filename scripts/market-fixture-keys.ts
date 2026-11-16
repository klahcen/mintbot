import { readFile } from "node:fs/promises";
import { PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { PUMP_GLOBAL, PUMP_FEES } from "../src/market/pump.js";
import { poolSpec } from "../src/market/pools.js";
const venue = process.argv[2] ?? "pump";
if (venue !== "pump") {
  const b = JSON.parse(
    await readFile(`docs/phase3/fixtures/${venue}-accounts.json`, "utf8"),
  );
  const address = Object.keys(b.accounts)[0];
  const spec = poolSpec(venue, b, address);
  console.log(
    JSON.stringify([
      ...new Set([
        address,
        spec.base,
        spec.quote,
        spec.baseVault,
        spec.quoteVault,
        ...spec.extras,
      ]),
    ]),
  );
  process.exit(0);
}
const mint = "33gPhVj2UAqC5Es4sJTr8XT6cD9kujzDzKV2X8BDpump";
const curve = "BpUpaZAVBi4bmYyKx1F8iTMzjFbMtydvjgkMAtxnMhGg";
console.log(
  JSON.stringify([
    curve,
    mint,
    getAssociatedTokenAddressSync(
      new PublicKey(mint),
      new PublicKey(curve),
      true,
      TOKEN_2022_PROGRAM_ID,
    ).toBase58(),
    PUMP_GLOBAL,
    PUMP_FEES,
  ]),
);
