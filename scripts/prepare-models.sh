#!/usr/bin/env bash
set -euo pipefail
# Run from repository root after `pnpm install`. Turns the raw 3D scans in assets/models
# (500k–1M triangles, 4K PNG textures) into web-sized GLBs with meshopt-compressed geometry.
# Props keep a small WebP texture; the error bound, not the ratio, is usually what stops their simplification.
# The ships' UVs are too shattered to simplify at all, so their texture is baked into vertex colours first.
# Fetches @gltf-transform/cli through npx.
out="${1:-packages/client/public/models}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir -p "$out"

unpack() {
  unzip -q -o "assets/models/$1" -d "$work/$2"
  echo "$work/$2/pbr/mesh_textured_pbr.glb"
}

optimize() {
  local zip="$1" name="$2" ratio="$3" error="$4" size="$5"
  npx -y @gltf-transform/cli@4.5.1 optimize "$(unpack "$zip" "$name")" "$out/$name.glb" \
    --compress meshopt --texture-compress webp --texture-size "$size" \
    --simplify-ratio "$ratio" --simplify-error "$error"
}

bake() {
  local zip="$1" name="$2" ratio="$3" error="$4"
  node scripts/bake-vertex-colors.mjs "$(unpack "$zip" "$name")" "$out/$name.glb" "$ratio" "$error"
}

bake 船开帆.zip ship-sails 0.025 0.01
bake 船未开帆.zip ship-furled 0.025 0.01
# The table fills half the screen in first person, so it keeps a larger texture.
optimize desk.zip desk 0.08 0.003 2048
optimize 蜡烛.zip candle 0.012 0.006 512
optimize 触手.zip tentacle 0.02 0.006 1024
optimize 触手少.zip tentacle-small 0.015 0.006 512
optimize 方向盘_glb.zip helm 0.012 0.006 512
optimize 大副徽章.zip mate-badge 0.012 0.006 512
optimize 放大镜_glb.zip magnifier 0.012 0.006 512
optimize 手枪.zip pistol 0.012 0.006 512
optimize 刀.zip knife 0.012 0.006 512
optimize 歇班.zip off-duty 0.012 0.006 512
