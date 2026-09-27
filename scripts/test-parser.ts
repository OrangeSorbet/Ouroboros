import { lex } from "../src/compiler/lexer";
import { parse } from "../src/compiler/parser";
import { pathToFileURL } from "url";

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const sample = `let x = 5;\nif (x >= 5) { print x; }\n`;
  const { tokens } = lex(sample);
  const { program, trace } = parse(tokens);

  console.log("--- AST ---");
  console.log(JSON.stringify(program, null, 2));

  console.log("--- PDA TRACE ---");
  for (const step of trace) {
    console.log(`${step.action.toUpperCase().padEnd(4)} ${step.symbol.padEnd(14)} stack=[${step.stackAfter.join(", ")}]  @token '${step.tokenLexeme}'`);
  }
}
