// Run an Ouroboros program through all 7 phases and print its output (or
// the phase and message of the first error).
//   node scripts/run.ts src/samples/zoo.orbs
//   node scripts/run.ts -e 'print 1 + 2;'
import { readFileSync } from "node:fs";
import { compile } from "../src/compiler/pipeline.ts";

const [flag, arg] = process.argv.slice(2);
const src = flag === "-e" ? arg : readFileSync(flag, "utf8");
const r = compile(src);
if (r.errorPhase) {
  console.log(`${r.errorPhase} error: ${(r as any)[r.errorPhase].error.message}`);
  process.exitCode = 1;
} else {
  for (const line of r.vm!.output!.output) console.log(line);
}
