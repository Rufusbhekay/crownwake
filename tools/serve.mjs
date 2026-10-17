import { createServer } from "node:http";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".glb", "model/gltf-binary"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".json", "application/json; charset=utf-8"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webm", "video/webm"],
  [".webp", "image/webp"]
]);
const GENERATED_MODEL_MAX_BYTES = 50 * 1024 * 1024;
const PROJECT_LEVEL_MAX_BYTES = 5 * 1024 * 1024;
const GLB_MAGIC = 0x46546c67;

function option(argumentsList, name, fallback) {
  const index = argumentsList.indexOf(name);
  return index >= 0 && argumentsList[index + 1] ? argumentsList[index + 1] : fallback;
}

function send(response, status, body, contentType = "text/plain; charset=utf-8") {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": contentType,
    "X-Content-Type-Options": "nosniff"
  });
  response.end(body);
}

function sendJson(response, status, payload) {
  send(response, status, JSON.stringify(payload), "application/json; charset=utf-8");
}

function requestError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function readRequestBody(request, limit, tooLargeMessage = "Request body is too large.") {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > limit) throw requestError(413, tooLargeMessage);
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function generatedModelStem(value) {
  const stem = String(value ?? "")
    .replace(/\.glb$/i, "")
    .trim()
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return stem || "Crownwake-Model";
}

async function saveGeneratedModel(root, name, buffer) {
  const modelsDirectory = resolve(root, "Models");
  await mkdir(modelsDirectory, { recursive: true });
  const stem = generatedModelStem(name);
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const suffix = attempt ? `-${attempt + 1}` : "";
    const fileName = `${stem}${suffix}.glb`;
    const filePath = resolve(modelsDirectory, fileName);
    if (!filePath.startsWith(modelsDirectory + sep)) throw requestError(400, "Invalid model file name.");
    try {
      await writeFile(filePath, buffer, { flag: "wx" });
      return fileName;
    } catch (error) {
      if (error?.code === "EEXIST") continue;
      throw error;
    }
  }
  throw requestError(409, "Could not find an available model file name.");
}

async function saveGeneratedModelRequest(request, response, root) {
  const buffer = await readRequestBody(request, GENERATED_MODEL_MAX_BYTES, "GLB files must be 50 MB or smaller.");
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) throw requestError(400, "The generated model is not a valid GLB file.");
  const fileName = await saveGeneratedModel(root, request.headers["x-crownwake-model-name"], buffer);
  sendJson(response, 201, { fileName, path: `Models/${fileName}` });
}

function isProjectLevelLayout(layout) {
  return Boolean(layout) && typeof layout === "object" && Number.isInteger(layout.version) && layout.version >= 1 && Array.isArray(layout.assets);
}

function projectLevelPath(root) {
  const levelsDirectory = resolve(root, "levels");
  const filePath = resolve(levelsDirectory, "current-level.json");
  if (!filePath.startsWith(levelsDirectory + sep)) throw requestError(400, "Invalid level path.");
  return { levelsDirectory, filePath };
}

async function loadProjectLevelRequest(response, root) {
  const { filePath } = projectLevelPath(root);
  try {
    const layout = JSON.parse(await readFile(filePath, "utf8"));
    if (!isProjectLevelLayout(layout)) throw requestError(500, "Saved project level is invalid.");
    sendJson(response, 200, layout);
  } catch (error) {
    if (error?.code === "ENOENT") sendJson(response, 404, { error: "No shared project level has been published yet." });
    else throw error;
  }
}

async function saveProjectLevelRequest(request, response, root) {
  const buffer = await readRequestBody(request, PROJECT_LEVEL_MAX_BYTES, "Level snapshots must be 5 MB or smaller.");
  let layout;
  try {
    layout = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw requestError(400, "Level snapshot must be valid JSON.");
  }
  if (!isProjectLevelLayout(layout)) throw requestError(400, "Level snapshot must include a version and assets array.");
  const { levelsDirectory, filePath } = projectLevelPath(root);
  await mkdir(levelsDirectory, { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(layout, null, 2) + "\n", "utf8");
  await rename(temporaryPath, filePath);
  sendJson(response, 201, { ok: true });
}

async function serveStaticFile(request, response, url, root) {
  const relativePath = decodeURIComponent(url.pathname === "/" ? "index.html" : url.pathname.slice(1));
  let filePath = resolve(root, relativePath);
  if (filePath !== root && !filePath.startsWith(root + sep)) {
    send(response, 403, "Forbidden");
    return;
  }
  const fileStats = await stat(filePath);
  if (fileStats.isDirectory()) filePath = resolve(filePath, "index.html");
  const body = await readFile(filePath);
  const contentType = mimeTypes.get(extname(filePath).toLowerCase()) ?? "application/octet-stream";
  send(response, 200, body, contentType);
}

export function createCrownwakeServer({ root = projectRoot } = {}) {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://" + (request.headers.host ?? "127.0.0.1"));
      const routePath = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
      if (routePath === "/api/models") {
        if (request.method !== "POST") {
          sendJson(response, 405, { error: "Method not allowed." });
          return;
        }
        await saveGeneratedModelRequest(request, response, root);
        return;
      }
      if (routePath === "/api/level") {
        if (request.method === "GET") {
          await loadProjectLevelRequest(response, root);
          return;
        }
        if (request.method === "PUT") {
          await saveProjectLevelRequest(request, response, root);
          return;
        }
        sendJson(response, 405, { error: "Method not allowed." });
        return;
      }
      await serveStaticFile(request, response, url, root);
    } catch (error) {
      const status = Number.isInteger(error?.status) ? error.status : error?.code === "ENOENT" ? 404 : error instanceof URIError ? 400 : 500;
      const body = status === 404 ? "Not found" : error instanceof Error ? error.message : status === 400 ? "Bad request" : "Server error";
      if (!response.headersSent) send(response, status, body);
      else response.end();
    }
  });
}

function listenFromCommandLine() {
  const argumentsList = process.argv.slice(2);
  const host = option(argumentsList, "--host", process.env.CROWNWAKE_HOST ?? "127.0.0.1");
  const port = Number(option(argumentsList, "--port", process.env.CROWNWAKE_PORT ?? "4173"));
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Invalid port: " + port);
  const server = createCrownwakeServer();
  server.on("error", error => {
    if (error.code === "EADDRINUSE") console.error("Port " + port + " is already in use. Run npm run dev -- --port <another-port>.");
    else console.error(error);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log("Crownwake is running at http://" + host + ":" + port + "/");
    console.log("Press Ctrl+C to stop the local server.");
  });
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const launchedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (launchedPath === fileURLToPath(import.meta.url)) listenFromCommandLine();
