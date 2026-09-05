import { readFile, writeFile } from "node:fs/promises";

const [, , sourcePath, outputPath, requestedFenceName] = process.argv;
if (!sourcePath || !outputPath) {
  throw new Error("Usage: node tools/extract-forest-fence.mjs <source.glb> <output.glb> [FenceRight|FenceRight.015|FenceLeft|FenceRight.003]");
}

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const FENCE_NAMES = new Set(["FenceRight", "FenceRight.015", "FenceLeft", "FenceRight.003"]);
if (requestedFenceName && !FENCE_NAMES.has(requestedFenceName)) {
  throw new Error(`Unknown fence name: ${requestedFenceName}`);
}
const selectedFenceNames = requestedFenceName ? new Set([requestedFenceName]) : FENCE_NAMES;

function align4(value) { return (value + 3) & ~3; }
function clone(value) { return structuredClone(value); }
function removeUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
function textureIndices(material) {
  return [
    material.pbrMetallicRoughness?.baseColorTexture?.index,
    material.pbrMetallicRoughness?.metallicRoughnessTexture?.index,
    material.normalTexture?.index,
    material.occlusionTexture?.index,
    material.emissiveTexture?.index
  ].filter(Number.isInteger);
}

const source = await readFile(sourcePath);
if (source.readUInt32LE(0) !== GLB_MAGIC || source.readUInt32LE(4) !== 2) {
  throw new Error("Expected a glTF 2.0 binary (.glb) source file.");
}

const jsonLength = source.readUInt32LE(12);
if (source.readUInt32LE(16) !== JSON_CHUNK) throw new Error("The first GLB chunk must be JSON.");
const document = JSON.parse(source.subarray(20, 20 + jsonLength).toString("utf8").trim());
const binHeader = 20 + jsonLength;
if (source.readUInt32LE(binHeader + 4) !== BIN_CHUNK) throw new Error("The source GLB has no binary geometry chunk.");
const binLength = source.readUInt32LE(binHeader);
const binary = source.subarray(binHeader + 8, binHeader + 8 + binLength);

const root = document.nodes.findIndex(node => node.name === "Sketchfab_model");
const sourceGroup = document.nodes.findIndex(node => node.name === "7e3ea3961971410d9438a7b059f62e2e.fbx");
const rootNode = document.nodes.findIndex(node => node.name === "RootNode");
const parents = document.nodes
  .map((node, index) => ({ node, index }))
  .filter(({ node }) => selectedFenceNames.has(node.name));

if (root < 0 || sourceGroup < 0 || rootNode < 0 || parents.length !== selectedFenceNames.size) {
  throw new Error("Expected the requested named fence part(s) in the supplied Forest House model.");
}

const selectedNodeIndices = new Set([root, sourceGroup, rootNode]);
for (const { node, index } of parents) {
  selectedNodeIndices.add(index);
  for (const child of node.children ?? []) selectedNodeIndices.add(child);
}

const selectedMeshIndices = new Set(
  [...selectedNodeIndices]
    .map(index => document.nodes[index].mesh)
    .filter(Number.isInteger)
);
const selectedMaterialIndices = new Set();
for (const meshIndex of selectedMeshIndices) {
  for (const primitive of document.meshes[meshIndex].primitives) {
    if (Number.isInteger(primitive.material)) selectedMaterialIndices.add(primitive.material);
  }
}
const selectedTextureIndices = new Set();
for (const materialIndex of selectedMaterialIndices) {
  for (const textureIndex of textureIndices(document.materials[materialIndex])) selectedTextureIndices.add(textureIndex);
}
const selectedImageIndices = new Set([...selectedTextureIndices].map(index => document.textures[index].source).filter(Number.isInteger));
const selectedSamplerIndices = new Set([...selectedTextureIndices].map(index => document.textures[index].sampler).filter(Number.isInteger));

const selectedAccessorIndices = new Set();
for (const meshIndex of selectedMeshIndices) {
  for (const primitive of document.meshes[meshIndex].primitives) {
    if (Number.isInteger(primitive.indices)) selectedAccessorIndices.add(primitive.indices);
    for (const accessorIndex of Object.values(primitive.attributes ?? {})) selectedAccessorIndices.add(accessorIndex);
  }
}
const selectedBufferViewIndices = new Set();
for (const accessorIndex of selectedAccessorIndices) {
  const bufferViewIndex = document.accessors[accessorIndex].bufferView;
  if (Number.isInteger(bufferViewIndex)) selectedBufferViewIndices.add(bufferViewIndex);
}
for (const imageIndex of selectedImageIndices) {
  const bufferViewIndex = document.images[imageIndex].bufferView;
  if (Number.isInteger(bufferViewIndex)) selectedBufferViewIndices.add(bufferViewIndex);
}

const bufferViewMap = new Map();
const binaryParts = [];
let binaryOffset = 0;
for (const oldIndex of [...selectedBufferViewIndices].sort((a, b) => a - b)) {
  const sourceView = document.bufferViews[oldIndex];
  const padding = align4(binaryOffset) - binaryOffset;
  if (padding) binaryParts.push(Buffer.alloc(padding));
  binaryOffset += padding;
  const bytes = binary.subarray(sourceView.byteOffset ?? 0, (sourceView.byteOffset ?? 0) + sourceView.byteLength);
  bufferViewMap.set(oldIndex, { index: bufferViewMap.size, offset: binaryOffset });
  binaryParts.push(bytes);
  binaryOffset += bytes.length;
}

const accessorMap = new Map();
const accessors = [...selectedAccessorIndices].sort((a, b) => a - b).map(oldIndex => {
  const accessor = clone(document.accessors[oldIndex]);
  accessor.bufferView = bufferViewMap.get(accessor.bufferView).index;
  accessorMap.set(oldIndex, accessorMap.size);
  return accessor;
});
const materialMap = new Map();
const materials = [...selectedMaterialIndices].sort((a, b) => a - b).map(oldIndex => {
  materialMap.set(oldIndex, materialMap.size);
  return clone(document.materials[oldIndex]);
});
const textureMap = new Map();
const textures = [...selectedTextureIndices].sort((a, b) => a - b).map(oldIndex => {
  textureMap.set(oldIndex, textureMap.size);
  return clone(document.textures[oldIndex]);
});
const imageMap = new Map();
const images = [...selectedImageIndices].sort((a, b) => a - b).map(oldIndex => {
  const image = clone(document.images[oldIndex]);
  image.bufferView = bufferViewMap.get(image.bufferView).index;
  imageMap.set(oldIndex, imageMap.size);
  return image;
});
const samplerMap = new Map();
const samplers = [...selectedSamplerIndices].sort((a, b) => a - b).map(oldIndex => {
  samplerMap.set(oldIndex, samplerMap.size);
  return clone(document.samplers[oldIndex]);
});

for (const material of materials) {
  const remapTexture = slot => { if (slot) slot.index = textureMap.get(slot.index); };
  remapTexture(material.pbrMetallicRoughness?.baseColorTexture);
  remapTexture(material.pbrMetallicRoughness?.metallicRoughnessTexture);
  remapTexture(material.normalTexture); remapTexture(material.occlusionTexture); remapTexture(material.emissiveTexture);
}
for (const texture of textures) {
  if (Number.isInteger(texture.source)) texture.source = imageMap.get(texture.source);
  if (Number.isInteger(texture.sampler)) texture.sampler = samplerMap.get(texture.sampler);
}

const meshMap = new Map();
const meshes = [...selectedMeshIndices].sort((a, b) => a - b).map(oldIndex => {
  const mesh = clone(document.meshes[oldIndex]);
  meshMap.set(oldIndex, meshMap.size);
  for (const primitive of mesh.primitives) {
    if (Number.isInteger(primitive.indices)) primitive.indices = accessorMap.get(primitive.indices);
    primitive.attributes = Object.fromEntries(Object.entries(primitive.attributes ?? {}).map(([semantic, accessor]) => [semantic, accessorMap.get(accessor)]));
    if (Number.isInteger(primitive.material)) primitive.material = materialMap.get(primitive.material);
  }
  return mesh;
});

const nodeMap = new Map();
const nodes = [...selectedNodeIndices].sort((a, b) => a - b).map(oldIndex => {
  nodeMap.set(oldIndex, nodeMap.size);
  return clone(document.nodes[oldIndex]);
});
for (const [oldIndex, newIndex] of nodeMap) {
  const node = nodes[newIndex];
  if (Number.isInteger(node.mesh)) node.mesh = meshMap.get(node.mesh);
  if (node.children) node.children = node.children.filter(child => nodeMap.has(child)).map(child => nodeMap.get(child));
}

const bufferViews = [...bufferViewMap.entries()].sort(([, a], [, b]) => a.index - b.index).map(([oldIndex, mapping]) => {
  const sourceView = document.bufferViews[oldIndex];
  return removeUndefined({ buffer: 0, byteOffset: mapping.offset, byteLength: sourceView.byteLength, byteStride: sourceView.byteStride, target: sourceView.target });
});
const packedBinary = Buffer.concat(binaryParts);
const paddedBinary = Buffer.concat([packedBinary, Buffer.alloc(align4(packedBinary.length) - packedBinary.length)]);

const output = {
  asset: { version: "2.0", generator: "Crownwake fence extractor" },
  extensionsUsed: document.extensionsUsed?.filter(name => name === "KHR_materials_unlit"),
  scene: 0,
  scenes: [{ name: "Forest House Fence", nodes: [nodeMap.get(root)] }],
  nodes,
  meshes,
  materials,
  textures,
  images,
  samplers,
  accessors,
  bufferViews,
  buffers: [{ byteLength: packedBinary.length }]
};
const json = Buffer.from(JSON.stringify(output));
const paddedJson = Buffer.concat([json, Buffer.from(" ".repeat(align4(json.length) - json.length))]);
const header = Buffer.alloc(12);
header.writeUInt32LE(GLB_MAGIC, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + paddedJson.length + 8 + paddedBinary.length, 8);
const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(paddedJson.length, 0); jsonHeader.writeUInt32LE(JSON_CHUNK, 4);
const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(paddedBinary.length, 0); binaryHeader.writeUInt32LE(BIN_CHUNK, 4);

await writeFile(outputPath, Buffer.concat([header, jsonHeader, paddedJson, binaryHeader, paddedBinary]));
console.log(`Extracted ${parents.length} fence segments with ${materials.length} preserved material into ${outputPath}.`);
