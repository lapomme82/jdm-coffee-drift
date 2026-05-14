const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, ".tmp-balance");
const races = readNumberArg("--races", 1000);
const seed = readNumberArg("--seed", 20260513);
const dt = 0.05;
const maxSteps = 3200;

compileRuntime();
require.extensions[".png"] = (module, filename) => {
  module.exports = filename;
};

const { RaceEngine } = require(path.join(outDir, "gameplay", "raceEngine.js"));
const { cars } = require(path.join(outDir, "data", "cars.js"));
const { tracks } = require(path.join(outDir, "data", "tracks.js"));

const rng = mulberry32(seed);
let midRaceSpreadSum = 0;
let finishSpreadSum = 0;
let raceDurationSum = 0;
const stats = new Map(
  cars.map((car) => [
    car.id,
    {
      id: car.id,
      name: car.name,
      races: 0,
      rankSum: 0,
      wins: 0,
      top3: 0,
      bottom3: 0,
      lasts: 0,
      finishTimeSum: 0,
      driftSum: 0,
      itemSum: 0,
      maxSpeedSum: 0,
      trackWins: new Map()
    }
  ])
);

for (let raceIndex = 0; raceIndex < races; raceIndex += 1) {
  const raceSeed = nextInt(rng, 1, 2_000_000_000);
  const track = tracks[nextInt(rng, 0, tracks.length - 1)];
  const shuffled = shuffle(cars, rng);
  const players = shuffled.map((car, index) => ({
    id: car.id,
    name: `Bot ${index + 1}`,
    carId: car.id
  }));

  const engine = new RaceEngine({ players, trackId: track.id, seed: raceSeed });
  let steps = 0;
  let midRaceSpread;
  while (!engine.complete && steps < maxSteps) {
    engine.update(dt);
    if (midRaceSpread === undefined && engine.elapsed >= 60) {
      midRaceSpread = getProgressSpread(engine);
    }
    steps += 1;
  }

  const results = engine.getResults();
  const finishTimes = results.map((result) => result.finishTime);
  midRaceSpreadSum += midRaceSpread ?? getProgressSpread(engine);
  finishSpreadSum += Math.max(...finishTimes) - Math.min(...finishTimes);
  raceDurationSum += Math.max(...finishTimes);
  for (const result of results) {
    const carStat = stats.get(result.id);
    carStat.races += 1;
    carStat.rankSum += result.rank;
    carStat.finishTimeSum += result.finishTime;
    carStat.driftSum += result.driftSeconds;
    carStat.itemSum += result.itemUses;
    carStat.maxSpeedSum += result.maxSpeed;
    if (result.rank === 1) {
      carStat.wins += 1;
      carStat.trackWins.set(track.id, (carStat.trackWins.get(track.id) ?? 0) + 1);
    }
    if (result.rank <= 3) carStat.top3 += 1;
    if (result.rank >= cars.length - 2) carStat.bottom3 += 1;
    if (result.coffeeBuyer) carStat.lasts += 1;
  }
}

const expectedRate = 100 / cars.length;
const rows = [...stats.values()]
  .map((stat) => {
    const raceCount = stat.races || 1;
    return {
      car: stat.name,
      avgRank: stat.rankSum / raceCount,
      winRate: (stat.wins / raceCount) * 100,
      top3Rate: (stat.top3 / raceCount) * 100,
      lastRate: (stat.lasts / raceCount) * 100,
      bottom3Rate: (stat.bottom3 / raceCount) * 100,
      avgFinish: stat.finishTimeSum / raceCount,
      avgDrift: stat.driftSum / raceCount,
      avgItems: stat.itemSum / raceCount,
      avgMaxSpeed: stat.maxSpeedSum / raceCount
    };
  })
  .sort((a, b) => a.avgRank - b.avgRank);

const biggestSkews = rows.map((row) => ({
  car: row.car,
  winSkew: row.winRate - expectedRate,
  lastSkew: row.lastRate - expectedRate,
  rankSkew: row.avgRank - 4.5
}));

const summary = {
  races,
  seed,
  cars: cars.length,
  tracks: tracks.length,
  expectedWinRate: round(expectedRate),
  expectedLastRate: round(expectedRate),
  strongest: rows[0].car,
  weakest: rows[rows.length - 1].car,
  maxWinSkew: round(Math.max(...biggestSkews.map((row) => Math.abs(row.winSkew)))),
  maxLastSkew: round(Math.max(...biggestSkews.map((row) => Math.abs(row.lastSkew)))),
  avgMidRaceProgressSpread: round(midRaceSpreadSum / races),
  avgFinishTimeSpread: round(finishSpreadSum / races),
  avgRaceDuration: round(raceDurationSum / races),
  rows: rows.map((row) => ({
    car: row.car,
    avgRank: round(row.avgRank),
    winRate: round(row.winRate),
    top3Rate: round(row.top3Rate),
    lastRate: round(row.lastRate),
    bottom3Rate: round(row.bottom3Rate),
    avgFinish: round(row.avgFinish),
    avgDrift: round(row.avgDrift),
    avgItems: round(row.avgItems),
    avgMaxSpeedKmh: Math.round(row.avgMaxSpeed * 0.72)
  }))
};

console.log(JSON.stringify(summary, null, 2));

function compileRuntime() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  const tsc = path.join(root, "node_modules", "typescript", "lib", "tsc.js");
  execFileSync(process.execPath, [
    tsc,
    "--target",
    "ES2022",
    "--module",
    "CommonJS",
    "--moduleResolution",
    "Node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--strict",
    "--rootDir",
    "src",
    "--outDir",
    outDir,
    "src/vite-env.d.ts",
    "src/gameplay/raceEngine.ts",
    "src/gameplay/path.ts",
    "src/gameplay/rng.ts",
    "src/data/cars.ts",
    "src/data/tracks.ts",
    "src/types.ts"
  ], { cwd: root, stdio: "pipe" });

  fs.writeFileSync(path.join(outDir, "package.json"), JSON.stringify({ type: "commonjs" }));
  const sourceAssetDir = path.join(root, "src", "assets", "cars");
  const targetAssetDir = path.join(outDir, "assets", "cars");
  fs.mkdirSync(targetAssetDir, { recursive: true });
  for (const asset of fs.readdirSync(sourceAssetDir)) {
    if (asset.endsWith(".png")) {
      fs.writeFileSync(path.join(targetAssetDir, asset), "");
    }
  }
}

function readNumberArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  const parsed = Number(process.argv[index + 1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function shuffle(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = nextInt(random, 0, index);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function nextInt(random, min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}

function getProgressSpread(engine) {
  const progresses = engine.cars.map((car) => Math.max(0, Math.min(engine.maxProgress, car.progress)));
  return ((Math.max(...progresses) - Math.min(...progresses)) / engine.maxProgress) * 100;
}

function mulberry32(seedValue) {
  let state = seedValue >>> 0;
  return function random() {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
