// Reedbed Hollow exploration geometry and movement. Pure functions; no DOM or save access.
export const HOLLOW = Object.freeze({
  width: 1800, height: 1200, corridor: 94, speed: 245,
  paths: [
    [[120, 930], [310, 820], [470, 700], [760, 700], [1010, 560], [1320, 500], [1640, 560]],
    [[760, 700], [820, 850], [820, 1030], [1090, 1090]],
    [[1010, 560], [1120, 390], [1320, 300], [1540, 330]],
  ],
  discoveries: [
    { id: 'trail-marker', x: 505, y: 690, radius: 78, title: 'Old Trail Marker', note: 'A weathered marker points deeper into the reeds. Someone maintained these paths long before the pond became a fishing ground.' },
    { id: 'lost-satchel', x: 1320, y: 500, radius: 82, title: 'Wiggs’ Lost Satchel', note: 'A familiar bait-stained satchel rests beside the trail. Its field sketches describe a sheltered pool beyond the cattails.' },
    { id: 'hidden-pool', x: 820, y: 1030, radius: 90, title: 'Sheltered Backwater', note: 'A quiet pool sits beyond the main trail. The water is sheltered, the banks are soft, and small rings ripple beneath the reeds.' },
    { id: 'lookout', x: 1540, y: 330, radius: 85, title: 'Reedbed Lookout', note: 'From this rise, the branching waterways of North Pond become visible. The old footpath continues beyond the lookout.' },
  ],
});

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function segmentDistance(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const d = dx * dx + dy * dy;
  const t = d ? clamp(((x - a[0]) * dx + (y - a[1]) * dy) / d, 0, 1) : 0;
  return Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t));
}
export function isHollowWalkable(x, y, margin = HOLLOW.corridor) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > HOLLOW.width || y > HOLLOW.height) return false;
  return HOLLOW.paths.some((path) => path.slice(1).some((point, i) =>
    segmentDistance(x, y, path[i], point) <= margin));
}
export function moveHollowPlayer(position, direction, dt) {
  const x = Number.isFinite(position?.x) ? position.x : 120;
  const y = Number.isFinite(position?.y) ? position.y : 930;
  const dx = clamp(Number(direction?.x) || 0, -1, 1);
  const dy = clamp(Number(direction?.y) || 0, -1, 1);
  const length = Math.hypot(dx, dy) || 1;
  const step = HOLLOW.speed * clamp(Number(dt) || 0, 0, 0.08);
  const nx = x + dx / length * step, ny = y + dy / length * step;
  if (isHollowWalkable(nx, ny, HOLLOW.corridor * 0.72)) return { x: nx, y: ny, moving: !!(dx || dy) };
  // Slide along a path edge instead of allowing diagonal corner-cutting.
  if (isHollowWalkable(nx, y, HOLLOW.corridor * 0.72)) return { x: nx, y, moving: !!dx };
  if (isHollowWalkable(x, ny, HOLLOW.corridor * 0.72)) return { x, y: ny, moving: !!dy };
  return { x, y, moving: false };
}
export function nearbyHollowDiscovery(position, discoveries = HOLLOW.discoveries) {
  if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) return null;
  return discoveries.find((item) => Math.hypot(position.x - item.x, position.y - item.y) <= item.radius) || null;
}
export function sanitizeHollowSave(value) {
  const discovered = Array.isArray(value?.discovered)
    ? [...new Set(value.discovered.filter((id) => HOLLOW.discoveries.some((item) => item.id === id)))]
    : [];
  const pos = value?.position || {};
  const candidate = { x: Number(pos.x), y: Number(pos.y) };
  const position = isHollowWalkable(candidate.x, candidate.y, HOLLOW.corridor * 0.72)
    ? candidate : { x: 120, y: 930 };
  return { position, discovered };
}
