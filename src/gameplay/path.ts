import type { Point, TrackSpec } from "../types";

export interface PathSample {
  point: Point;
  distance: number;
}

export interface PathLookup {
  point: Point;
  tangent: Point;
  normal: Point;
  angle: number;
  segmentIndex: number;
}

export interface TrackRuntime {
  samples: PathSample[];
  totalLength: number;
  driftZones: Array<{ start: number; end: number }>;
}

const TAU = Math.PI * 2;

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function normalizeDistance(value: number, total: number): number {
  const normalized = value % total;
  return normalized < 0 ? normalized + total : normalized;
}

export function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= TAU;
  while (wrapped < -Math.PI) wrapped += TAU;
  return wrapped;
}

export function sampleClosedSpline(points: Point[], samplesPerSegment = 28): Point[] {
  const sampled: Point[] = [];
  const count = points.length;

  for (let index = 0; index < count; index += 1) {
    const p0 = points[(index - 1 + count) % count];
    const p1 = points[index];
    const p2 = points[(index + 1) % count];
    const p3 = points[(index + 2) % count];

    for (let step = 0; step < samplesPerSegment; step += 1) {
      const t = step / samplesPerSegment;
      sampled.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t)
      });
    }
  }

  return sampled;
}

export function buildTrackRuntime(track: TrackSpec): TrackRuntime {
  const points = sampleClosedSpline(track.points);
  const samples: PathSample[] = [];
  let totalLength = 0;

  points.forEach((point, index) => {
    if (index > 0) totalLength += distance(points[index - 1], point);
    samples.push({ point, distance: totalLength });
  });

  totalLength += distance(points[points.length - 1], points[0]);

  const driftZones = track.driftCorners.map((cornerIndex) => {
    const corner = track.points[cornerIndex % track.points.length];
    let nearest = samples[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const sample of samples) {
      const sampleDistance = distance(corner, sample.point);
      if (sampleDistance < nearestDistance) {
        nearestDistance = sampleDistance;
        nearest = sample;
      }
    }

    return {
      start: normalizeDistance(nearest.distance - 185, totalLength),
      end: normalizeDistance(nearest.distance + 210, totalLength)
    };
  });

  return { samples, totalLength, driftZones };
}

export function lookupPath(runtime: TrackRuntime, distanceAlongPath: number, laneOffset = 0): PathLookup {
  const total = runtime.totalLength;
  const distanceOnLap = normalizeDistance(distanceAlongPath, total);
  const samples = runtime.samples;

  let low = 0;
  let high = samples.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high + 1) / 2);
    if (samples[middle].distance <= distanceOnLap) low = middle;
    else high = middle - 1;
  }

  const current = samples[low];
  const next = samples[(low + 1) % samples.length];
  const segmentLength = distance(current.point, next.point) || 1;
  const nextDistance = low === samples.length - 1 ? total : next.distance;
  const t = Math.min(1, Math.max(0, (distanceOnLap - current.distance) / Math.max(1, nextDistance - current.distance)));
  const x = current.point.x + (next.point.x - current.point.x) * t;
  const y = current.point.y + (next.point.y - current.point.y) * t;
  const tangent = {
    x: (next.point.x - current.point.x) / segmentLength,
    y: (next.point.y - current.point.y) / segmentLength
  };
  const normal = { x: -tangent.y, y: tangent.x };

  return {
    point: {
      x: x + normal.x * laneOffset,
      y: y + normal.y * laneOffset
    },
    tangent,
    normal,
    angle: Math.atan2(tangent.y, tangent.x),
    segmentIndex: low
  };
}

export function curvatureAt(runtime: TrackRuntime, distanceAlongPath: number): { amount: number; sign: number } {
  const near = lookupPath(runtime, distanceAlongPath + 80);
  const far = lookupPath(runtime, distanceAlongPath + 300);
  const delta = wrapAngle(far.angle - near.angle);
  return {
    amount: Math.min(1, Math.abs(delta) / 1.35),
    sign: delta >= 0 ? 1 : -1
  };
}

export function isInDriftZone(runtime: TrackRuntime, distanceAlongPath: number): boolean {
  const value = normalizeDistance(distanceAlongPath, runtime.totalLength);
  return runtime.driftZones.some((zone) => {
    if (zone.start <= zone.end) return value >= zone.start && value <= zone.end;
    return value >= zone.start || value <= zone.end;
  });
}

export function getZoneIntensity(runtime: TrackRuntime, distanceAlongPath: number): number {
  return isInDriftZone(runtime, distanceAlongPath) ? 1 : 0;
}
