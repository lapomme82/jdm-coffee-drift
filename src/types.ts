export type ItemType = "turbo";

export interface Point {
  x: number;
  y: number;
}

export type VehicleBodyType =
  | "sedan"
  | "suv"
  | "crossover"
  | "coupe"
  | "hatchback"
  | "sports"
  | "truck"
  | "hypercar"
  | "rickshaw"
  | "tractor"
  | "scooter";

export type VehicleRuleClass = "standard" | "sportsRisk" | "microExempt";

export interface ReferencePerformance {
  model: string;
  powerHp: number;
  zeroToHundredSec: number;
  topSpeedKmh: number;
  weightKg: number;
  source: string;
}

export interface CarSpec {
  id: string;
  name: string;
  role: string;
  description: string;
  sprite: string;
  bodyType: VehicleBodyType;
  reference: ReferencePerformance;
  ruleClass: VehicleRuleClass;
  raceSpriteWidth: number;
  colors: {
    primary: number;
    secondary: number;
    trim: number;
  };
  topSpeed: number;
  accel: number;
  grip: number;
  drift: number;
  spGain: number;
  weight: number;
}

export interface PlayerConfig {
  id: string;
  name: string;
  carId: string;
}

export interface TrackTheme {
  sky: number;
  ground: number;
  foliage: number;
  road: number;
  roadEdge: number;
  line: number;
  accent: number;
}

export interface TrackSpec {
  id: string;
  name: string;
  category: "mountain" | "coast" | "country" | "city";
  description: string;
  seed: number;
  roadWidth: number;
  laps: number;
  world: {
    width: number;
    height: number;
  };
  theme: TrackTheme;
  points: Point[];
  driftCorners: number[];
  cameraAnchors: Point[];
}

export interface RaceSetup {
  players: PlayerConfig[];
  trackId: string;
  seed: number;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  carName: string;
  rank: number;
  progressPercent: number;
  sp: number;
  speed: number;
  isDrifting: boolean;
  itemUses: number;
  finished: boolean;
  finishTime?: number;
}

export interface RaceViewportCar {
  id: string;
  x: number;
  y: number;
  radius: number;
  finished: boolean;
}

export interface RaceResult {
  id: string;
  name: string;
  carName: string;
  rank: number;
  finishTime: number;
  driftSeconds: number;
  itemUses: number;
  maxSpeed: number;
  highlight: string;
  coffeeBuyer: boolean;
}

export interface RaceLapStatus {
  current: number;
  total: number;
  leaderName: string;
}

export interface RaceSnapshot {
  trackName: string;
  trackDescription: string;
  elapsed: number;
  timeLimit: number;
  eventLog: string[];
  leaderboard: LeaderboardEntry[];
  lap: RaceLapStatus;
  viewportCars?: RaceViewportCar[];
}
