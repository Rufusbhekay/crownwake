import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCrownwakeServer } from "../tools/serve.mjs";

test("project level API saves and returns the shared layout", async t => {
  const root = await mkdtemp(join(tmpdir(), "crownwake-level-"));
  const server = createCrownwakeServer({ root });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const layout = { version: 6, assets: [{ type: "tile-spawner", x: 2, z: 3 }] };
  const write = await fetch(`${baseUrl}/api/level`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(layout) });
  assert.equal(write.status, 201);
  assert.deepEqual(await write.json(), { ok: true });

  const read = await fetch(`${baseUrl}/api/level`);
  assert.equal(read.status, 200);
  assert.deepEqual(await read.json(), layout);
  assert.deepEqual(JSON.parse(await readFile(join(root, "levels", "current-level.json"), "utf8")), layout);
});
