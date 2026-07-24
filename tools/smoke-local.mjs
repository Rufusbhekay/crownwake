const baseUrl = process.env.CROWNWAKE_URL ?? "http://127.0.0.1:4173";
const checks = [
  ["/", "text/html"],
  ["/game.js", "text/javascript"],
  ["/sim-runtime-20260724e.js", "text/javascript"],
  ["/Models/CH_Servant.glb", "model/gltf-binary"],
  ["/assets/battle_music.m4a", "audio/mp4"]
];

for (const [path, expectedType] of checks) {
  const response = await fetch(`${baseUrl}${path}`);
  const actualType = response.headers.get("content-type") ?? "";
  if (!response.ok || !actualType.startsWith(expectedType)) {
    throw new Error(`${path}: expected 200 ${expectedType}, received ${response.status} ${actualType}`);
  }
  console.log(`${response.status} ${expectedType} ${path}`);
}

const gameSource = await (await fetch(`${baseUrl}/game.js`)).text();
if (!gameSource.includes('from "./sim-runtime-20260724e.js"')) {
  throw new Error("The served game does not import the current immutable simulation runtime");
}

console.log(`Crownwake localhost smoke test passed at ${baseUrl}/`);
