// Self-check for Phase 1: node scripts/check-lex.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lex } from "../src/compiler/lexer.ts";

const sample = (name: string) => readFileSync(new URL(`../src/samples/${name}`, import.meta.url), "utf8");
const kinds = (src: string) => lex(src).output!.map((t) => t.kind);

const demo = lex(sample("demo.snek"));
assert.ok(demo.ok, demo.error?.message);
const toks = demo.output!;
const line = (l: number) => toks.filter((t) => t.line === l).map((t) => t.kind);
assert.deepEqual(line(2), ["FN", "IDENT", "LPAREN", "IDENT", "RPAREN", "LBRACE"]);
assert.deepEqual(line(11), ["IF", "LPAREN", "IDENT", "GT", "NUMBER", "AND", "NOT", "FALSE", "RPAREN", "LBRACE"]);
assert.equal(toks.at(-1)!.kind, "EOF");

const bad = lex(sample("err-lex.snek"));
assert.equal(bad.ok, false);
assert.match(bad.error!.message, /invalid decimal literal/);
assert.equal(bad.trace.at(-1)!.kind, "error");

assert.match(lex("/* x").error!.message, /unterminated comment/);
assert.equal(lex("a & b").ok, false);
assert.match(lex("\"abc").error!.message, /unterminated string/);
assert.match(lex("@").error!.message, /unexpected character/);
assert.deepEqual(kinds("!x"), ["NOT", "IDENT", "EOF"]);
assert.deepEqual(kinds("x<=y"), ["IDENT", "LTE", "IDENT", "EOF"]);
assert.deepEqual(kinds("a/b /* c */ # d\n||&&!= ,[]"), ["IDENT", "SLASH", "IDENT", "OR", "AND", "NEQ", "COMMA", "LBRACKET", "RBRACKET", "EOF"]);

const str = lex(String.raw`"a\n\"b\\"`).output![0];
assert.equal(str.kind, "STRING");
assert.equal(str.value, "a\n\"b\\");

// Longest match: the char ending a token is refused (no-move), not consumed.
const xp = lex("x+").trace;
assert.deepEqual(xp.map((s) => s.kind), ["move", "no-move", "keyword-check", "accept-emit", "move", "accept-emit", "eof"]);
assert.equal(xp[1].offset, 1);

for (const r of [demo, bad, lex("/* x"), lex("a & b")]) {
  for (const s of r.trace) {
    for (const [cell, text] of Object.entries(s.explain)) {
      assert.ok(text.trim().length > 0, `empty ${cell} on ${s.kind}`);
      assert.ok(text.length <= 180, `${cell} too long (${text.length}): ${text}`);
    }
    assert.ok(s.span, `no span on ${s.kind}`);
  }
  assert.ok(r.chapters.length > 0 && r.chapters.at(-1)!.end === r.trace.length - 1);
}
console.log(`check-lex ok: demo ${toks.length} tokens, ${demo.trace.length} steps, ${demo.chapters.length} chapters`);
