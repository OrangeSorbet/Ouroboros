// Runs every phase in order. Each phase consumes only the previous phase's
// output, so a failing phase stops the pipeline there: later results stay
// undefined and the UI shows those phases as blocked.
import type { PhaseId, PhaseResult } from "./trace.ts";
import type { Token } from "./tokens.ts";
import { lex } from "./lexer.ts";
import type { DfaStep } from "./lexer.ts";
import { parse } from "./parser.ts";
import type { PdaStep, ParseOutput } from "./parser.ts";
import { analyze } from "./semantic.ts";
import type { SemStep } from "./semantic.ts";
import type { SemanticInfo } from "./semanticTypes.ts";
import { generate } from "./irgen.ts";
import type { IrGenStep } from "./irgen.ts";
import { optimize } from "./optimize.ts";
import type { OptStep, OptOutput } from "./optimize.ts";
import type { IrProgram } from "./irTypes.ts";
import { assemble } from "./bytecode.ts";
import type { AsmStep, BytecodeProgram } from "./bytecode.ts";
import { run } from "./vm.ts";
import type { VmStep, VmOutput } from "./vm.ts";

export const IMPLEMENTED_PHASES: PhaseId[] = ["lex", "parse", "semantic", "ir", "opt", "bytecode", "vm"];

export interface PipelineResult {
  lex: PhaseResult<DfaStep, Token[]>;
  parse?: PhaseResult<PdaStep, ParseOutput>;
  semantic?: PhaseResult<SemStep, SemanticInfo>;
  ir?: PhaseResult<IrGenStep, IrProgram>;
  opt?: PhaseResult<OptStep, OptOutput>;
  bytecode?: PhaseResult<AsmStep, BytecodeProgram>;
  vm?: PhaseResult<VmStep, VmOutput>;
  errorPhase?: PhaseId; // first phase that returned ok=false
}

export function compile(source: string): PipelineResult {
  const result: PipelineResult = { lex: lex(source) };
  if (!result.lex.ok || !result.lex.output) return { ...result, errorPhase: "lex" };

  result.parse = parse(result.lex.output);
  if (!result.parse.ok || !result.parse.output) return { ...result, errorPhase: "parse" };

  result.semantic = analyze(result.parse.output.ast);
  if (!result.semantic.ok || !result.semantic.output) return { ...result, errorPhase: "semantic" };

  result.ir = generate(result.parse.output.ast, result.semantic.output);
  if (!result.ir.ok || !result.ir.output) return { ...result, errorPhase: "ir" };

  result.opt = optimize(result.ir.output);
  if (!result.opt.ok || !result.opt.output) return { ...result, errorPhase: "opt" };

  result.bytecode = assemble(result.opt.output.program);
  if (!result.bytecode.ok || !result.bytecode.output) return { ...result, errorPhase: "bytecode" };

  result.vm = run(result.bytecode.output);
  if (!result.vm.ok) return { ...result, errorPhase: "vm" };
  return result;
}
