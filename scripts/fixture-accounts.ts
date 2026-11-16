import { readFile } from "node:fs/promises";
import { requiredLaunchAccounts } from "../src/verified-decoders.js";
const [program, file] = process.argv.slice(2);
if (!program || !file)
  throw Error("Supply verified program name and captured transaction path");
const tx = JSON.parse(await readFile(file, "utf8")).result;
process.stdout.write(
  JSON.stringify(requiredLaunchAccounts(program, tx)) + "\n",
);
