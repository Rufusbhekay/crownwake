import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const game = await readFile(new URL("../game.js", import.meta.url), "utf8");

test("character defeats do not spawn debris", () => {
  const start = game.indexOf("function dealDamage(");
  const end = game.indexOf("\nfunction hit(", start);
  const dealDamage = game.slice(start, end);

  assert.doesNotMatch(dealDamage, /shatterCommander\(victim\)|shatterSoldier\(victim\)/);
});
