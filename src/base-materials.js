import * as THREE from "../vendor/three.module.js";

export const BASE_MATERIAL_PRESETS = Object.freeze([
  { id: "base-grey-stone", name: "Grey Stone", colour: [155, 160, 163], roughness: .9 },
  { id: "base-white-limestone", name: "White Limestone", colour: [234, 233, 224], roughness: .85 },
  { id: "base-sandstone", name: "Warm Sandstone", colour: [202, 180, 139], roughness: .95 },
  { id: "base-dark-slate", name: "Dark Slate", colour: [76, 86, 96], roughness: .82 }
]);

const originalMaterials = new WeakMap();
const ownedMaterials = new WeakSet();
const textures = new Map();

function stoneTexture(preset) {
  if (textures.has(preset.id)) return textures.get(preset.id);
  const size = 256, tileSize = 32, pixels = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      const tileRow = Math.floor(row / tileSize), tileColumn = Math.floor(column / tileSize);
      const variation = ((tileRow * 17 + tileColumn * 31 + tileRow * tileColumn * 7) % 13 - 6) * 1.4;
      const grain = ((row * 13 + column * 7) % 5 - 2) * .6;
      const seam = row % tileSize === 0 || column % tileSize === 0;
      const offset = (row * size + column) * 4;
      for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = THREE.MathUtils.clamp(preset.colour[channel] + variation + grain - (seam ? 24 : 0), 0, 255);
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, size, size);
  texture.name = preset.name;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  textures.set(preset.id, texture);
  return texture;
}

export function applyBaseMaterial(base, slot, colour = "#ffffff") {
  const visual = base?.getObjectByName("Base Model");
  if (!visual) return false;
  const preset = BASE_MATERIAL_PRESETS.find(entry => entry.id === slot);
  const resolvedSlot = slot === "__embedded__" || preset ? slot : "";
  visual.traverse(mesh => {
    if (!mesh.isMesh || !mesh.material) return;
    if (!originalMaterials.has(mesh)) originalMaterials.set(mesh, mesh.material);
    const original = originalMaterials.get(mesh), originals = Array.isArray(original) ? original : [original];
    const previous = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const replacements = originals.map(material => {
      const replacement = material.clone();
      if (resolvedSlot !== "__embedded__") {
        replacement.map = preset ? stoneTexture(preset) : null;
        replacement.normalMap = replacement.bumpMap = replacement.roughnessMap = replacement.metalnessMap = replacement.aoMap = replacement.emissiveMap = replacement.alphaMap = replacement.displacementMap = replacement.lightMap = null;
        replacement.vertexColors = false;
        replacement.color.set(preset ? "#ffffff" : colour);
        replacement.emissive?.set(0);
        replacement.roughness = preset?.roughness ?? .9;
        replacement.metalness = 0;
        replacement.transparent = false;
        replacement.opacity = 1;
      }
      ownedMaterials.add(replacement);
      return replacement;
    });
    mesh.material = Array.isArray(original) ? replacements : replacements[0];
    mesh.userData.editorMaterialOverride = resolvedSlot !== "__embedded__";
    for (const material of previous) if (ownedMaterials.has(material)) material.dispose();
  });
  base.userData.importedMaterialSlot = resolvedSlot;
  if (!resolvedSlot) base.userData.editorMaterialColor = `#${new THREE.Color(colour).getHexString()}`;
  return true;
}
