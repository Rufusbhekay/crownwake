import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { createCrownwakeServer } from "../tools/serve.mjs";

async function withLocalServer(run, root = resolve(fileURLToPath(new URL("..", import.meta.url)))) {
  const server = createCrownwakeServer({ root });
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const baseUrl = "http://127.0.0.1:" + address.port;
  try {
    await run({ baseUrl });
  } finally {
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

test("local server serves Crownwake static assets", async () => {
  await withLocalServer(async ({ baseUrl }) => {
    const index = await fetch(baseUrl + "/index.html");
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Crownwake/);

    const game = await fetch(baseUrl + "/game.js");
    assert.equal(game.status, 200);
    assert.match(await game.text(), /function loop/);
  });
});

test("local server rejects traversal and unknown files", async () => {
  await withLocalServer(async ({ baseUrl }) => {
    const missing = await fetch(baseUrl + "/does-not-exist");
    assert.equal(missing.status, 404);

    const traversal = await fetch(baseUrl + "/..%2Fpackage.json");
    assert.equal(traversal.status, 403);
  });
});

test("local server saves generated GLB models in Models", async () => {
  const root = await mkdtemp(join(tmpdir(), "crownwake-generated-model-"));
  try {
    await withLocalServer(async ({ baseUrl }) => {
      const glb = Buffer.alloc(12);
      glb.writeUInt32LE(0x46546c67, 0);
      glb.writeUInt32LE(2, 4);
      glb.writeUInt32LE(12, 8);
      const response = await fetch(baseUrl + "/api/models", {
        method: "POST",
        headers: { "X-Crownwake-Model-Name": "Town Hall Copy" },
        body: glb
      });
      assert.equal(response.status, 201);
      const saved = await response.json();
      assert.equal(saved.path, "Models/Town-Hall-Copy.glb");
      assert.deepEqual(await readFile(resolve(root, saved.path)), glb);
    }, root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
