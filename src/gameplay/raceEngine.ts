import { getCar } from "../data/cars";
import { getTrack } from "../data/tracks";
import type {
  CarSpec,
  ItemType,
  LeaderboardEntry,
  PlayerConfig,
  Point,
  RaceLapStatus,
  RaceResult,
  RaceSetup,
  RaceSnapshot,
  TrackSpec
} from "../types";
import { buildTrackRuntime, curvatureAt, getZoneIntensity, isInDriftZone, lookupPath, type TrackRuntime } from "./path";
import { hashSeed, Rng } from "./rng";

export interface CarRuntime {
  id: string;
  name: string;
  car: CarSpec;
  laneOffset: number;
  targetLaneOffset: number;
  progress: number;
  previousProgress: number;
  speed: number;
  position: Point;
  angle: number;
  visualAngle: number;
  rank: number;
  sp: number;
  isDrifting: boolean;
  driftIntensity: number;
  driftSeconds: number;
  itemUses: number;
  maxSpeed: number;
  finished: boolean;
  finishTime?: number;
  turboTime: number;
  turboCooldown: number;
  penaltyTime: number;
  trafficStopTime: number;
  shortcutCooldown: number;
  shortcutTime: number;
  shortcutOffset: number;
  shortcutDrive?: ShortcutDriveState;
  pendingViolations: TrafficViolationLedger;
  wasDrifting: boolean;
  highlightScore: number;
  lastRank: number;
}

export interface RaceEngineEvent {
  type: "drift" | "item" | "overtake" | "finish" | "traffic" | "shortcut";
  carId: string;
  targetId?: string;
  item?: ItemType;
  label?: string;
  message: string;
  intensity: number;
}

export interface RaceHazard {
  id: string;
  type: "banana" | "smoke";
  ownerId: string;
  progress: number;
  endProgress: number;
  ttl: number;
  consumed: boolean;
}

export interface RoadRuleZone {
  id: string;
  start: number;
  end: number;
}

export interface TrafficLightRuntime {
  id: string;
  progress: number;
  greenDuration: number;
  redDuration: number;
  phaseOffset: number;
}

export interface ShortcutRuntime {
  id: string;
  start: number;
  end: number;
  bonusProgress: number;
  offsetSign: 1 | -1;
  label: string;
  route: Point[];
  routeLength: number;
}

export interface ShortcutDriveState {
  shortcutId: string;
  elapsed: number;
  duration: number;
  startProgress: number;
  endProgress: number;
  route: Point[];
  routeLength: number;
  displaySpeed: number;
}

export interface PoliceTrapRuntime {
  id: string;
  progress: number;
  range: number;
  watches: "signal" | "noPassing" | "both";
}

export interface TrafficViolationLedger {
  signal: number;
  noPassing: number;
}

export interface TrackTrafficPlan {
  noPassingZones: RoadRuleZone[];
  trafficLights: TrafficLightRuntime[];
  shortcuts: ShortcutRuntime[];
  policeTraps: PoliceTrapRuntime[];
}

const ITEM_NAMES: Record<ItemType, string> = {
  turbo: "터보"
};

const HIGHLIGHTS = [
  "마지막 코너까지 커피값을 피해 달렸습니다.",
  "헤어핀에서 타이어 연기가 아주 진하게 피었습니다.",
  "신호와 추월금지 구간에서 판단력이 빛났습니다.",
  "터보 타이밍이 팀 채팅에서 오래 회자될 만했습니다.",
  "깔끔한 주행보다 드라마를 택한 레이스였습니다."
];

const RED_LIGHT_STOP_DISTANCE = 170;
const NO_PASSING_FOLLOW_DISTANCE = 150;
const SP_GAIN_MULTIPLIER = 0.2;
const SIGNAL_POLICE_PENALTY_SECONDS = 3.2;
const NO_PASSING_POLICE_PENALTY_SECONDS = 4.8;

export class RaceEngine {
  readonly track: TrackSpec;
  readonly runtime: TrackRuntime;
  readonly cars: CarRuntime[];
  readonly maxProgress: number;
  readonly timeLimit = 120;
  readonly hardTimeLimit = 165;
  readonly eventLog: string[] = [];

  elapsed = 0;
  complete = false;
  events: RaceEngineEvent[] = [];

  private readonly seed: number;
  private readonly trafficPlan: TrackTrafficPlan;
  private readonly trafficEventKeys = new Set<string>();
  private rng: Rng;

  constructor(setup: RaceSetup) {
    this.track = setup.customTrack ?? getTrack(setup.trackId);
    this.runtime = buildTrackRuntime(this.track);
    this.maxProgress = this.runtime.totalLength * this.track.laps;
    this.seed = setup.seed ^ this.track.seed;
    this.rng = new Rng(this.seed);
    this.trafficPlan = buildTrafficPlan(this.track, this.runtime);

    const lanePattern = buildRaceLanePattern(this.track.roadWidth);
    this.cars = setup.players.map((player, index) => {
      const car = getCar(player.carId);
      const targetLaneOffset = lanePattern[index % lanePattern.length];
      const startLaneOffset = getStartGridLaneOffset(index, this.track.roadWidth);
      const startProgress = getStartGridProgress(index);
      const lookup = lookupPath(this.runtime, startProgress, startLaneOffset);
      return {
        id: player.id,
        name: player.name,
        car,
        laneOffset: startLaneOffset,
        targetLaneOffset,
        progress: startProgress,
        previousProgress: startProgress,
        speed: 78 + this.rng.range(0, 22),
        position: lookup.point,
        angle: lookup.angle,
        visualAngle: lookup.angle,
        rank: index + 1,
        sp: this.rng.range(3, 9),
        isDrifting: false,
        driftIntensity: 0,
        driftSeconds: 0,
        itemUses: 0,
        maxSpeed: 0,
        finished: false,
        turboTime: 0,
        turboCooldown: 2.4 + index * 0.12,
        penaltyTime: 0,
        trafficStopTime: 0,
        shortcutCooldown: 2.6 + index * 0.2,
        shortcutTime: 0,
        shortcutOffset: 0,
        shortcutDrive: undefined,
        pendingViolations: { signal: 0, noPassing: 0 },
        wasDrifting: false,
        highlightScore: 0,
        lastRank: index + 1
      };
    });

    this.eventLog.push(`오늘의 랜덤 코스: ${this.track.name}`);
    this.eventLog.push("SP는 터보 전용. 추월금지·신호·경찰 단속이 적용됩니다.");
    this.updateRanks(false);
  }

  update(deltaSeconds: number): void {
    if (this.complete) return;

    const dt = Math.min(0.05, deltaSeconds);
    this.elapsed += dt;
    this.events = [];

    this.updateRanks(false);
    for (const car of this.cars) {
      this.updateCar(car, dt);
    }
    this.updateRanks(true);

    if (this.cars.every((car) => car.finished)) {
      this.complete = true;
    } else if (this.elapsed >= this.hardTimeLimit) {
      this.forceComplete();
    }
  }

  getResults(): RaceResult[] {
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 999) - (b.finishTime ?? 999);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });

    return sorted.map((car, index) => ({
      id: car.id,
      name: car.name,
      carName: car.car.name,
      rank: index + 1,
      finishTime: car.finishTime ?? this.elapsed + (sorted.length - index) * 0.3,
      driftSeconds: car.driftSeconds,
      itemUses: car.itemUses,
      maxSpeed: car.maxSpeed,
      highlight: HIGHLIGHTS[Math.min(HIGHLIGHTS.length - 1, Math.floor(car.highlightScore) % HIGHLIGHTS.length)],
      coffeeBuyer: index === sorted.length - 1
    }));
  }

  getSnapshot(): RaceSnapshot {
    return {
      trackName: this.track.name,
      trackDescription: this.track.description,
      elapsed: this.elapsed,
      timeLimit: this.timeLimit,
      eventLog: this.eventLog.slice(-4).reverse(),
      leaderboard: this.getLeaderboard(),
      lap: this.getLeaderLapStatus()
    };
  }

  getLeaderboard(): LeaderboardEntry[] {
    return [...this.cars]
      .sort((a, b) => a.rank - b.rank)
      .map((car) => ({
        id: car.id,
        name: car.name,
        carName: car.car.name,
        rank: car.rank,
        progressPercent: Math.max(0, Math.min(100, (car.progress / this.maxProgress) * 100)),
        sp: Math.min(100, car.sp),
        speed: car.speed,
        isDrifting: car.isDrifting,
        itemUses: car.itemUses,
        finished: car.finished,
        finishTime: car.finishTime
      }));
  }

  getHazards(): readonly RaceHazard[] {
    return [];
  }

  getTrafficPlan(): TrackTrafficPlan {
    return this.trafficPlan;
  }

  getRoadRule(distanceAlongPath: number): "normal" | "noPassing" {
    return this.getNoPassingZone(distanceAlongPath) ? "noPassing" : "normal";
  }

  isTrafficLightRed(light: TrafficLightRuntime): boolean {
    const cycle = light.greenDuration + light.redDuration;
    const time = normalizeDistance(this.elapsed + light.phaseOffset, cycle);
    return time >= light.greenDuration;
  }

  private getLeaderLapStatus(): RaceLapStatus {
    const leader = [...this.cars].sort((a, b) => a.rank - b.rank)[0];
    const lapLength = Math.max(1, this.runtime.totalLength);
    const total = Math.max(1, this.track.laps);
    const progress = leader?.finished
      ? this.maxProgress
      : Math.max(0, Math.min(this.maxProgress, leader?.progress ?? 0));
    const current = progress >= this.maxProgress
      ? total
      : Math.min(total, Math.floor(progress / lapLength) + 1);

    return {
      current,
      total,
      leaderName: leader?.name ?? ""
    };
  }

  private updateCar(car: CarRuntime, dt: number): void {
    if (car.finished) {
      car.speed = Math.max(0, car.speed - 300 * dt);
      return;
    }

    car.previousProgress = car.progress;
    car.turboTime = Math.max(0, car.turboTime - dt);
    car.turboCooldown = Math.max(0, car.turboCooldown - dt);
    car.penaltyTime = Math.max(0, car.penaltyTime - dt);
    car.trafficStopTime = Math.max(0, car.trafficStopTime - dt);
    car.shortcutCooldown = Math.max(0, car.shortcutCooldown - dt);
    car.shortcutTime = Math.max(0, car.shortcutTime - dt);

    if (car.shortcutDrive) {
      this.updateShortcutDrive(car, dt);
      return;
    }

    if (car.penaltyTime > 0) {
      this.updateStoppedCar(car, dt);
      return;
    }

    const curve = curvatureAt(this.runtime, car.progress);
    const zoneIntensity = getZoneIntensity(this.runtime, car.progress);
    const tightCorner = isInDriftZone(this.runtime, car.progress) || curve.amount > 0.43;
    const packPosition = this.cars.length <= 1 ? 0 : (car.rank - 1) / (this.cars.length - 1);
    const topSpeed = this.getCarTopSpeed(car);
    const cornerPenalty = curve.amount * (0.5 - car.car.grip * 0.032);
    const driftAbility = car.car.drift / 10;
    const cleanCornerSpeed = topSpeed * Math.max(0.5, 1 - cornerPenalty);
    const driftCornerSpeed = topSpeed * (0.55 + driftAbility * 0.2 + car.car.grip * 0.012);
    const targetBase = tightCorner ? Math.min(cleanCornerSpeed, driftCornerSpeed) : cleanCornerSpeed;
    const trafficJitter = Math.sin(this.elapsed * (0.92 + car.car.accel * 0.04) + car.id.length * 1.7) * 13;

    let targetSpeed = (targetBase + trafficJitter) * (0.99 + packPosition * 0.035);
    targetSpeed *= this.getPackSpeedFactor(car);
    targetSpeed *= this.applyTrafficLights(car, packPosition);
    targetSpeed *= this.applyNoPassingRules(car, packPosition);
    if (car.turboTime > 0) targetSpeed *= 1.28 + packPosition * 0.18;
    if (car.trafficStopTime > 0) targetSpeed *= 0.12;

    const acceleration = 98 + car.car.accel * 17 - car.car.weight * 1.4;
    const braking = 150 + car.car.grip * 15;
    if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + acceleration * dt);
    else car.speed = Math.max(targetSpeed, car.speed - braking * dt);

    const randomSlip = (this.rng.next() - 0.5) * (12 - car.car.grip) * 2;
    const minimumRollingSpeed = car.trafficStopTime > 0 ? 0 : 48;
    car.speed = Math.max(minimumRollingSpeed, car.speed + randomSlip * dt);
    car.maxSpeed = Math.max(car.maxSpeed, car.speed);

    const rawDrift = Math.min(1, curve.amount * 1.2 + zoneIntensity * 0.45 + (1 - car.car.grip / 10) * 0.14);
    car.isDrifting = car.trafficStopTime <= 0 && tightCorner && car.speed > topSpeed * 0.34 && rawDrift > 0.42;
    car.driftIntensity = car.isDrifting ? Math.min(1, rawDrift * (0.72 + driftAbility * 0.52)) : 0;

    if (car.isDrifting) {
      car.driftSeconds += dt;
      car.sp += dt * (11 + car.car.spGain * 2.6 + car.car.drift * 1.25) * (0.8 + car.driftIntensity + packPosition * 0.1) * SP_GAIN_MULTIPLIER;
      car.highlightScore += dt * 0.7;
      if (!car.wasDrifting && this.rng.chance(0.62)) {
        this.pushEvent({
          type: "drift",
          carId: car.id,
          message: `${car.name} 헤어핀 드리프트! SP가 천천히 차오릅니다.`,
          intensity: 0.7 + car.driftIntensity
        });
      }
    } else {
      car.sp += dt * (2.4 + packPosition * 2.5) * SP_GAIN_MULTIPLIER;
    }
    car.wasDrifting = car.isDrifting;

    const rankPush = 0.99 + packPosition * 0.09;
    const racePace = this.cars.length <= 2 ? 1.4 : 1.34;
    car.progress += car.speed * rankPush * racePace * dt;
    this.tryActivateShortcut(car, packPosition);
    this.enforceNoPassingProgress(car);
    this.applyPendingPolicePenalty(car);

    const laneMergeRate = this.elapsed < 7 ? 0.75 : 0.38;
    car.laneOffset += (car.targetLaneOffset - car.laneOffset) * Math.min(1, dt * laneMergeRate);
    const laneNoise = Math.sin(this.elapsed * 2.4 + car.rank * 0.9) * (car.isDrifting ? 11 : 3);
    const lookup = lookupPath(this.runtime, car.progress, car.laneOffset + laneNoise);
    car.position = lookup.point;
    car.angle = lookup.angle;
    const slipAngle = car.isDrifting ? curve.sign * (0.28 + car.driftIntensity * 0.55) : 0;
    car.visualAngle = lookup.angle + slipAngle;

    if (car.sp >= 100 && car.turboCooldown <= 0) {
      this.useTurbo(car);
    }

    this.finishCarIfNeeded(car);
  }

  private updateStoppedCar(car: CarRuntime, dt: number): void {
    car.isDrifting = false;
    car.driftIntensity = 0;
    car.speed = Math.max(0, car.speed - (260 + car.car.grip * 12) * dt);
    const lookup = lookupPath(this.runtime, car.progress, car.laneOffset);
    car.position = lookup.point;
    car.angle = lookup.angle;
    car.visualAngle = lookup.angle;
  }

  private updateShortcutDrive(car: CarRuntime, dt: number): void {
    const drive = car.shortcutDrive;
    if (!drive) return;

    car.previousProgress = car.progress;
    drive.elapsed += dt;
    const t = Math.min(1, drive.elapsed / Math.max(0.1, drive.duration));
    const eased = easeInOut(t);
    const routeLookup = lookupShortcutRoute(drive.route, eased);

    car.progress = drive.startProgress + (drive.endProgress - drive.startProgress) * eased;
    car.position = routeLookup.point;
    car.angle = routeLookup.angle;
    car.visualAngle = routeLookup.angle + Math.sin(t * Math.PI) * 0.12;
    car.speed = drive.displaySpeed;
    car.maxSpeed = Math.max(car.maxSpeed, car.speed);
    car.isDrifting = false;
    car.driftIntensity = 0;
    car.shortcutTime = Math.max(0, drive.duration - drive.elapsed);

    if (t >= 1) {
      car.shortcutDrive = undefined;
      car.shortcutTime = 0;
      car.shortcutOffset = 0;
      const exit = lookupPath(this.runtime, car.progress, car.laneOffset);
      car.position = exit.point;
      car.angle = exit.angle;
      car.visualAngle = exit.angle;
      this.finishCarIfNeeded(car);
    }
  }

  private finishCarIfNeeded(car: CarRuntime): void {
    if (car.progress < this.maxProgress || car.finished) return;
    car.finished = true;
    car.finishTime = this.elapsed;
    this.pushEvent({
      type: "finish",
      carId: car.id,
      message: `${car.name} 결승선 통과!`,
      intensity: 1
    });
  }

  private getCarTopSpeed(car: CarRuntime): number {
    return 238 + car.car.topSpeed * 7.4 + car.car.accel * 2.3 - car.car.weight * 0.95 + getUtilityStability(car) * 8.5;
  }

  private applyTrafficLights(car: CarRuntime, packPosition: number): number {
    if (car.car.ruleClass === "microExempt") return 1.02;

    const light = this.findTrafficLightAhead(car.progress, RED_LIGHT_STOP_DISTANCE);
    if (!light || !this.isTrafficLightRed(light)) return 1;

    const lap = Math.max(0, Math.floor(Math.max(0, car.progress) / this.runtime.totalLength));
    if (this.shouldRunRedLight(car, light, lap, packPosition)) {
      this.recordSignalViolation(car, light, lap);
      return 1.03;
    }

    const distance = distanceAheadOnLap(car.progress, light.progress, this.runtime.totalLength);
    const utilityStability = getUtilityStability(car);
    car.trafficStopTime = Math.max(car.trafficStopTime, 0.25);
    if (distance < 34) return 0.02 + utilityStability * 0.03;
    if (distance < 64) return 0.18 + utilityStability * 0.08;
    return 0.46 + utilityStability * 0.09;
  }

  private applyNoPassingRules(car: CarRuntime, packPosition: number): number {
    const zone = this.getNoPassingZone(car.progress);
    if (!zone) return 1;

    const target = this.findTargetAheadFrom(car, car.progress);
    if (!target) return car.car.ruleClass === "sportsRisk" ? 0.84 : 0.88;

    const gap = target.progress - car.progress;
    if (gap <= 0 || gap > NO_PASSING_FOLLOW_DISTANCE) return 0.98;

    if (car.car.ruleClass === "sportsRisk" && this.shouldAttemptNoPassingPass(car, zone, target)) {
      this.recordNoPassingViolation(car, zone, target, packPosition);
      return 1.02;
    }

    const utilityStability = getUtilityStability(car);
    const followFactor =
      gap < 48 ? 0.68 + utilityStability * 0.1 : gap < 92 ? 0.8 + utilityStability * 0.08 : 0.9 + utilityStability * 0.04;
    car.targetLaneOffset = target.laneOffset + (car.id < target.id ? -1 : 1) * this.track.roadWidth * 0.07;
    return followFactor;
  }

  private enforceNoPassingProgress(car: CarRuntime): void {
    const zone = this.getNoPassingZone(car.previousProgress);
    if (!zone || car.car.ruleClass === "sportsRisk") return;

    const target = this.findTargetAheadFrom(car, car.previousProgress);
    if (!target) return;

    const gapBefore = target.progress - car.previousProgress;
    if (gapBefore <= 0 || gapBefore > NO_PASSING_FOLLOW_DISTANCE) return;

    const utilityStability = getUtilityStability(car);
    const minGap = Math.max(24, 34 + (car.rank % 3) * 5 - utilityStability * 9);
    if (car.progress > target.progress - minGap) {
      car.progress = Math.max(car.previousProgress, target.progress - minGap);
      car.speed = Math.min(car.speed, target.speed * (0.94 + utilityStability * 0.04));
    }
  }

  private tryActivateShortcut(car: CarRuntime, packPosition: number): void {
    if (car.car.ruleClass !== "microExempt" || car.shortcutCooldown > 0) return;

    const shortcut = this.trafficPlan.shortcuts.find((candidate) => this.crossedProgress(car.previousProgress, car.progress, candidate.start));
    if (!shortcut) return;

    const startProgress = this.getAbsoluteFeatureProgress(car.previousProgress, shortcut.start);
    const maxBonus = Math.max(0, this.maxProgress - startProgress - 12);
    const shortcutBonus = shortcut.bonusProgress * getShortcutProgressMultiplier(car, packPosition);
    const appliedBonus = Math.min(maxBonus, shortcutBonus);
    if (appliedBonus <= 0) return;

    const shortcutSpeed = (420 + car.car.accel * 22 + packPosition * 92) * (car.car.bodyType === "tractor" ? 0.94 : 1);
    const duration = Math.max(1.08, Math.min(2.15, shortcut.routeLength / shortcutSpeed));
    car.progress = startProgress;
    car.previousProgress = startProgress;
    car.speed *= car.car.bodyType === "tractor" ? 0.78 : 0.86;
    car.shortcutTime = duration;
    car.shortcutOffset = 0;
    car.shortcutCooldown = car.car.bodyType === "tractor" ? 8.2 : 10.2;
    car.shortcutDrive = {
      shortcutId: shortcut.id,
      elapsed: 0,
      duration,
      startProgress,
      endProgress: startProgress + appliedBonus,
      route: shortcut.route,
      routeLength: shortcut.routeLength,
      displaySpeed: getShortcutDisplaySpeed(car, packPosition)
    };
    car.highlightScore += 2.2;
    this.pushEvent({
      type: "shortcut",
      carId: car.id,
      label: "샛길",
      message: `${car.name} ${shortcut.label} 진입. 좁은 골목 루트로 빠집니다.`,
      intensity: 0.9
    });
  }

  private useTurbo(car: CarRuntime): void {
    car.sp = 0;
    car.itemUses += 1;
    const packPosition = this.cars.length <= 1 ? 0 : (car.rank - 1) / (this.cars.length - 1);
    car.turboTime = 4.2 + packPosition * 2.2;
    car.turboCooldown = 4.2;
    car.highlightScore += 1.5;
    this.pushEvent({
      type: "item",
      carId: car.id,
      item: "turbo",
      label: "TURBO",
      message: `${car.name} ${ITEM_NAMES.turbo} 발동! 모은 SP를 전부 태웁니다.`,
      intensity: 0.85
    });
  }

  private getPackSpeedFactor(car: CarRuntime): number {
    const target = this.findTargetAheadFrom(car, car.progress);
    if (!target) return 1;

    const gap = target.progress - car.progress;
    if (gap <= 0 || gap > 115) return 1;
    if (this.getNoPassingZone(car.progress)) return 1;
    if (gap < 34) return 0.9;
    if (gap < 68) return 0.96;
    return 1;
  }

  private shouldRunRedLight(car: CarRuntime, light: TrafficLightRuntime, lap: number, packPosition: number): boolean {
    if (car.car.ruleClass === "sportsRisk") return false;
    const probability = 0.58 + packPosition * 0.26 + Math.max(0, 6 - car.car.grip) * 0.025 - getUtilityStability(car) * 0.16;
    return seededChance(`${this.seed}:red:${car.id}:${light.id}:${lap}`, probability);
  }

  private shouldAttemptNoPassingPass(car: CarRuntime, zone: RoadRuleZone, target: CarRuntime): boolean {
    const lap = Math.max(0, Math.floor(Math.max(0, car.progress) / this.runtime.totalLength));
    const probability = 0.28 + Math.max(0, car.car.accel - 8) * 0.04 + Math.max(0, car.car.topSpeed - 9) * 0.035;
    return seededChance(`${this.seed}:nopass:${car.id}:${target.id}:${zone.id}:${lap}`, probability);
  }

  private recordSignalViolation(car: CarRuntime, light: TrafficLightRuntime, lap: number): void {
    const key = `red:${car.id}:${light.id}:${lap}`;
    if (this.trafficEventKeys.has(key)) return;
    this.trafficEventKeys.add(key);

    this.addTrafficViolation(car, "signal");
    this.pushEvent({
      type: "traffic",
      carId: car.id,
      label: "신호위반",
      message: `${car.name} 빨간불을 보고도 밀어붙였습니다. 다음 경찰 단속 대상입니다.`,
      intensity: 0.55
    });
  }

  private recordNoPassingViolation(car: CarRuntime, zone: RoadRuleZone, target: CarRuntime, packPosition: number): void {
    const lap = Math.max(0, Math.floor(Math.max(0, car.progress) / this.runtime.totalLength));
    const key = `nopass:${car.id}:${target.id}:${zone.id}:${lap}`;
    if (this.trafficEventKeys.has(key)) return;
    this.trafficEventKeys.add(key);

    this.addTrafficViolation(car, "noPassing");
    if (packPosition > 0.12) {
      car.speed *= 0.94;
      car.turboCooldown = Math.max(car.turboCooldown, 1.8);
    }
    this.pushEvent({
      type: "traffic",
      carId: car.id,
      targetId: target.id,
      label: "무리한 추월",
      message: `${car.name} 추월금지 차로에서 ${target.name} 옆을 찔렀습니다. 다음 경찰 단속 대상입니다.`,
      intensity: 0.7
    });
  }

  private addTrafficViolation(car: CarRuntime, reason: "signal" | "noPassing"): void {
    if (car.car.ruleClass === "microExempt") return;
    car.pendingViolations[reason] += 1;
  }

  private applyPendingPolicePenalty(car: CarRuntime): void {
    if (car.car.ruleClass === "microExempt") return;

    const violationCount = getViolationCount(car.pendingViolations);
    if (violationCount <= 0) return;

    const caught = this.findPoliceTrapOnRoute(car.previousProgress, car.progress);
    if (!caught) return;

    const key = `police-pending:${car.id}:${caught.trap.id}:${caught.lap}`;
    if (this.trafficEventKeys.has(key)) return;
    this.trafficEventKeys.add(key);

    const penalty =
      car.pendingViolations.signal * SIGNAL_POLICE_PENALTY_SECONDS +
      car.pendingViolations.noPassing * NO_PASSING_POLICE_PENALTY_SECONDS;
    const detail = formatViolationDetail(car.pendingViolations);

    car.pendingViolations = { signal: 0, noPassing: 0 };
    car.penaltyTime = Math.max(car.penaltyTime, penalty);
    car.trafficStopTime = 0;
    car.speed *= Math.max(0.18, 0.38 - violationCount * 0.04);
    car.highlightScore += 1.2 + violationCount * 0.35;
    this.pushEvent({
      type: "traffic",
      carId: car.id,
      label: "교통단속",
      message: `${car.name} 누적 위반 ${violationCount}회(${detail})로 교통단속! ${penalty.toFixed(1)}초 정지합니다.`,
      intensity: Math.min(1.35, 0.82 + violationCount * 0.18)
    });
  }

  private findTrafficLightAhead(progress: number, maxDistance: number): TrafficLightRuntime | undefined {
    return this.trafficPlan.trafficLights
      .map((light) => ({
        light,
        distance: distanceAheadOnLap(progress, light.progress, this.runtime.totalLength)
      }))
      .filter((entry) => entry.distance >= 0 && entry.distance <= maxDistance)
      .sort((a, b) => a.distance - b.distance)[0]?.light;
  }

  private findPoliceTrapOnRoute(previousProgress: number, nextProgress: number): { trap: PoliceTrapRuntime; lap: number; distance: number } | undefined {
    return this.trafficPlan.policeTraps
      .map((trap) => {
        const crossing = getCrossedFeatureRange(previousProgress, nextProgress, trap.progress, trap.range, this.runtime.totalLength);
        return crossing ? { trap, ...crossing } : undefined;
      })
      .filter((entry): entry is { trap: PoliceTrapRuntime; lap: number; distance: number } => Boolean(entry))
      .sort((a, b) => a.distance - b.distance)[0];
  }

  private getNoPassingZone(progress: number): RoadRuleZone | undefined {
    return this.trafficPlan.noPassingZones.find((zone) => progressInZone(progress, zone.start, zone.end, this.runtime.totalLength));
  }

  private crossedProgress(previousProgress: number, nextProgress: number, featureProgress: number): boolean {
    const lapLength = this.runtime.totalLength;
    const lap = Math.floor(Math.max(0, previousProgress) / lapLength);
    let absoluteFeature = lap * lapLength + featureProgress;
    if (absoluteFeature < previousProgress) absoluteFeature += lapLength;
    return previousProgress <= absoluteFeature && nextProgress >= absoluteFeature;
  }

  private getAbsoluteFeatureProgress(previousProgress: number, featureProgress: number): number {
    const lapLength = this.runtime.totalLength;
    const lap = Math.floor(Math.max(0, previousProgress) / lapLength);
    let absoluteFeature = lap * lapLength + featureProgress;
    if (absoluteFeature < previousProgress) absoluteFeature += lapLength;
    return absoluteFeature;
  }

  private findTargetAheadFrom(car: CarRuntime, progress: number): CarRuntime | undefined {
    return [...this.cars]
      .filter((candidate) => candidate.id !== car.id && !candidate.finished && candidate.progress > progress)
      .sort((a, b) => a.progress - b.progress)[0];
  }

  private updateRanks(emitOvertakes: boolean): void {
    const sorted = [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return (a.finishTime ?? 999) - (b.finishTime ?? 999);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });

    sorted.forEach((car, index) => {
      car.lastRank = car.rank;
      car.rank = index + 1;
      if (emitOvertakes && car.rank < car.lastRank && !car.finished) {
        this.pushEvent({
          type: "overtake",
          carId: car.id,
          message: `${car.name} 순위 상승! 현재 ${car.rank}위입니다.`,
          intensity: 0.65
        });
      }
    });
  }

  private pushEvent(event: RaceEngineEvent): void {
    this.events.push(event);
    this.eventLog.push(event.message);
    if (this.eventLog.length > 14) this.eventLog.shift();
  }

  private forceComplete(): void {
    this.updateRanks(false);
    [...this.cars]
      .sort((a, b) => a.rank - b.rank)
      .forEach((car, index) => {
        if (!car.finished) {
          car.finished = true;
          car.finishTime = this.elapsed + index * 0.35;
        }
      });
    this.complete = true;
    this.eventLog.push("방송 시간 종료. 현재 순위 기준으로 결과를 확정합니다.");
  }
}

function buildTrafficPlan(track: TrackSpec, runtime: TrackRuntime): TrackTrafficPlan {
  const lapLength = runtime.totalLength;
  const rng = new Rng(track.seed ^ 0x51a7c0de);

  if (track.trafficRules) {
    const noPassingZones = track.trafficRules.noPassingZones.map((zone, index) => ({
      id: zone.id || `custom-no-pass-${index + 1}`,
      start: getTrackPointProgress(track, runtime, zone.startPoint),
      end: getTrackPointProgress(track, runtime, zone.endPoint)
    }));
    const trafficLights = track.trafficRules.trafficLights.map((light, index) => ({
      id: light.id || `custom-signal-${index + 1}`,
      progress: getTrackPointProgress(track, runtime, light.pointIndex),
      greenDuration: Math.max(2.5, light.greenDuration),
      redDuration: Math.max(2.5, light.redDuration),
      phaseOffset: light.phaseOffset
    }));
    const shortcuts = track.trafficRules.shortcuts.map((shortcut, index) => {
      const start = getTrackPointProgress(track, runtime, shortcut.startPoint);
      const end = getTrackPointProgress(track, runtime, shortcut.endPoint);
      const bonusProgress = Math.max(160, distanceAheadOnLap(start, end, lapLength));
      const route = buildShortcutRoute(runtime, track.roadWidth, start, end, shortcut.offsetSign, rng);
      return {
        id: shortcut.id || `custom-shortcut-${index + 1}`,
        start,
        end,
        bonusProgress,
        offsetSign: shortcut.offsetSign,
        label: shortcut.label || "커스텀 샛길",
        route,
        routeLength: getPolylineLength(route)
      };
    });
    return { noPassingZones, trafficLights, shortcuts, policeTraps: buildPoliceTraps(rng, lapLength, noPassingZones, trafficLights) };
  }

  const noPassingLength = lapLength * 0.1;
  const noPassingCenters = [0.18, 0.49, 0.78].map((base, index) => normalizeDistance((base + rng.range(-0.035, 0.035)) * lapLength + index * 7, lapLength));
  const noPassingZones = noPassingCenters.map((center, index) => ({
    id: `no-pass-${index + 1}`,
    start: normalizeDistance(center - noPassingLength / 2, lapLength),
    end: normalizeDistance(center + noPassingLength / 2, lapLength)
  }));

  const trafficLightCount = 2 + rng.int(0, 1);
  const trafficLightBases = [0.24, 0.56, 0.84];
  const trafficLights = trafficLightBases.slice(0, trafficLightCount).map((base, index) => ({
    id: `signal-${index + 1}`,
    progress: normalizeDistance((base + rng.range(-0.045, 0.045)) * lapLength, lapLength),
    greenDuration: rng.range(5.8, 7.2),
    redDuration: rng.range(5.8, 7.2),
    phaseOffset: rng.range(0, 10)
  }));

  const shortcutBases = [0.34, 0.68];
  const shortcuts = shortcutBases.map((base, index) => {
    const start = normalizeDistance((base + rng.range(-0.035, 0.035)) * lapLength, lapLength);
    const bonusProgress = lapLength * rng.range(0.09, 0.112);
    const end = normalizeDistance(start + bonusProgress, lapLength);
    const route = buildShortcutRoute(runtime, track.roadWidth, start, end, index % 2 === 0 ? 1 : -1, rng);
    return {
      id: `shortcut-${index + 1}`,
      start,
      end,
      bonusProgress,
      offsetSign: (index % 2 === 0 ? 1 : -1) as 1 | -1,
      label: index % 2 === 0 ? "마을 샛길" : "농로 샛길",
      route,
      routeLength: getPolylineLength(route)
    };
  });

  return { noPassingZones, trafficLights, shortcuts, policeTraps: buildPoliceTraps(rng, lapLength, noPassingZones, trafficLights) };
}

function buildPoliceTraps(
  rng: Rng,
  lapLength: number,
  noPassingZones: RoadRuleZone[],
  trafficLights: TrafficLightRuntime[]
): PoliceTrapRuntime[] {
  const policeCount = 1 + rng.int(0, 1);
  const policeCandidates: Array<{ progress: number; watches: PoliceTrapRuntime["watches"] }> = [
    ...trafficLights.map((light) => ({ progress: light.progress, watches: "signal" as const })),
    ...noPassingZones.map((zone) => ({ progress: zone.start, watches: "noPassing" as const }))
  ];
  const candidates = policeCandidates.length > 0
    ? policeCandidates
    : [{ progress: lapLength * 0.5, watches: "both" as const }];
  const policeTraps: PoliceTrapRuntime[] = [];
  for (let index = 0; index < policeCount; index += 1) {
    const candidate = rng.pick(candidates);
    policeTraps.push({
      id: `police-${index + 1}`,
      progress: normalizeDistance(candidate.progress + rng.range(-90, 90), lapLength),
      range: rng.range(180, 260),
      watches: rng.chance(0.32) ? "both" : candidate.watches
    });
  }
  return policeTraps;
}

function getTrackPointProgress(track: TrackSpec, runtime: TrackRuntime, pointIndex: number): number {
  const point = track.points[normalizePointIndex(pointIndex, track.points.length)];
  let nearest = runtime.samples[0];
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const sample of runtime.samples) {
    const sampleDistance = pointDistance(point, sample.point);
    if (sampleDistance < nearestDistance) {
      nearestDistance = sampleDistance;
      nearest = sample;
    }
  }
  return normalizeDistance(nearest.distance, runtime.totalLength);
}

function normalizePointIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  const rounded = Math.round(index);
  const normalized = rounded % total;
  return normalized < 0 ? normalized + total : normalized;
}

function getShortcutDisplaySpeed(car: CarRuntime, packPosition: number): number {
  if (car.car.bodyType === "tractor") return 122 + packPosition * 24;
  if (car.car.bodyType === "rickshaw") return 138 + packPosition * 30;
  return 150 + packPosition * 34;
}

function getShortcutProgressMultiplier(car: CarRuntime, packPosition: number): number {
  if (car.car.bodyType === "tractor") return 1.22 + packPosition * 0.18;
  if (car.car.bodyType === "rickshaw") return 1.03 + packPosition * 0.08;
  return 1;
}

function buildShortcutRoute(
  runtime: TrackRuntime,
  roadWidth: number,
  start: number,
  end: number,
  offsetSign: 1 | -1,
  rng: Rng
): Point[] {
  const lapLength = runtime.totalLength;
  const span = distanceAheadOnLap(start, end, lapLength);
  const entry = lookupPath(runtime, start, offsetSign * roadWidth * 0.48).point;
  const exit = lookupPath(runtime, end, offsetSign * roadWidth * 0.48).point;
  const p1 = lookupPath(runtime, start + span * 0.22, offsetSign * roadWidth * rng.range(1.25, 1.55)).point;
  const p2 = lookupPath(runtime, start + span * 0.52, offsetSign * roadWidth * rng.range(1.7, 2.05)).point;
  const p3 = lookupPath(runtime, start + span * 0.8, offsetSign * roadWidth * rng.range(1.18, 1.5)).point;
  return [entry, p1, p2, p3, exit];
}

function lookupShortcutRoute(route: Point[], t: number): { point: Point; angle: number } {
  if (route.length < 2) {
    const fallback = route[0] ?? { x: 0, y: 0 };
    return { point: fallback, angle: 0 };
  }

  const totalLength = getPolylineLength(route);
  const targetDistance = Math.max(0, Math.min(totalLength, totalLength * t));
  let walked = 0;

  for (let index = 1; index < route.length; index += 1) {
    const previous = route[index - 1];
    const next = route[index];
    const segmentLength = pointDistance(previous, next);
    if (walked + segmentLength >= targetDistance || index === route.length - 1) {
      const segmentT = segmentLength <= 0 ? 0 : (targetDistance - walked) / segmentLength;
      const point = {
        x: previous.x + (next.x - previous.x) * segmentT,
        y: previous.y + (next.y - previous.y) * segmentT
      };
      return {
        point,
        angle: Math.atan2(next.y - previous.y, next.x - previous.x)
      };
    }
    walked += segmentLength;
  }

  const last = route[route.length - 1];
  const beforeLast = route[route.length - 2];
  return {
    point: last,
    angle: Math.atan2(last.y - beforeLast.y, last.x - beforeLast.x)
  };
}

function buildRaceLanePattern(roadWidth: number): number[] {
  return [
    -roadWidth * 0.31,
    roadWidth * 0.31,
    -roadWidth * 0.12,
    roadWidth * 0.12,
    -roadWidth * 0.41,
    roadWidth * 0.41,
    -roadWidth * 0.22,
    roadWidth * 0.22
  ];
}

function getStartGridLaneOffset(index: number, roadWidth: number): number {
  const side = index % 2 === 0 ? -1 : 1;
  const row = Math.floor(index / 2);
  const stagger = row % 2 === 0 ? 0.36 : 0.44;
  return side * roadWidth * stagger;
}

function getStartGridProgress(index: number): number {
  const row = Math.floor(index / 2);
  return -row * 96 - (index % 2) * 12;
}

function normalizeDistance(value: number, total: number): number {
  const normalized = value % total;
  return normalized < 0 ? normalized + total : normalized;
}

function progressInZone(progress: number, start: number, end: number, lapLength: number): boolean {
  const value = normalizeDistance(progress, lapLength);
  if (start <= end) return value >= start && value <= end;
  return value >= start || value <= end;
}

function distanceAheadOnLap(progress: number, featureProgress: number, lapLength: number): number {
  const value = normalizeDistance(progress, lapLength);
  return normalizeDistance(featureProgress - value, lapLength);
}

function seededChance(key: string, probability: number): boolean {
  return new Rng(hashSeed(key)).chance(probability);
}

function getUtilityStability(car: CarRuntime): number {
  if (car.car.bodyType === "suv") return 1;
  if (car.car.id === "link-nautilus") return 0.85;
  if (car.car.bodyType === "truck") return 0.95;
  if (car.car.bodyType === "crossover") return 0.5;
  return 0;
}

function getViolationCount(violations: TrafficViolationLedger): number {
  return violations.signal + violations.noPassing;
}

function formatViolationDetail(violations: TrafficViolationLedger): string {
  const parts: string[] = [];
  if (violations.signal > 0) parts.push(`신호위반 ${violations.signal}`);
  if (violations.noPassing > 0) parts.push(`추월금지 ${violations.noPassing}`);
  return parts.join(", ");
}

function getCrossedFeatureRange(
  previousProgress: number,
  nextProgress: number,
  featureProgress: number,
  range: number,
  lapLength: number
): { lap: number; distance: number } | undefined {
  const startLap = Math.max(0, Math.floor(Math.max(0, previousProgress - range) / lapLength) - 1);
  const endLap = Math.floor(Math.max(0, nextProgress + range) / lapLength) + 1;

  for (let lap = startLap; lap <= endLap; lap += 1) {
    const absoluteProgress = lap * lapLength + featureProgress;
    if (previousProgress <= absoluteProgress + range && nextProgress >= absoluteProgress - range) {
      return {
        lap,
        distance: Math.max(0, absoluteProgress - previousProgress)
      };
    }
  }

  return undefined;
}

function getPolylineLength(points: Point[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += pointDistance(points[index - 1], points[index]);
  }
  return length;
}

function pointDistance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
