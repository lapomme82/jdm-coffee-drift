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
}

export interface PoliceTrapRuntime {
  id: string;
  progress: number;
  range: number;
  watches: "signal" | "noPassing" | "both";
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
    this.track = getTrack(setup.trackId);
    this.runtime = buildTrackRuntime(this.track);
    this.maxProgress = this.runtime.totalLength * this.track.laps;
    this.seed = setup.seed ^ this.track.seed;
    this.rng = new Rng(this.seed);
    this.trafficPlan = buildTrafficPlan(this.track, this.runtime.totalLength);

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
    const racePace = this.cars.length <= 2 ? 1.12 : 1.06;
    car.progress += car.speed * rankPush * racePace * dt;
    this.tryActivateShortcut(car, packPosition);
    this.enforceNoPassingProgress(car);

    const laneMergeRate = this.elapsed < 7 ? 0.75 : 0.38;
    car.laneOffset += (car.targetLaneOffset - car.laneOffset) * Math.min(1, dt * laneMergeRate);
    const laneNoise = Math.sin(this.elapsed * 2.4 + car.rank * 0.9) * (car.isDrifting ? 11 : 3);
    const shortcutOffset = car.shortcutTime > 0 ? car.shortcutOffset : 0;
    const lookup = lookupPath(this.runtime, car.progress, car.laneOffset + laneNoise + shortcutOffset);
    car.position = lookup.point;
    car.angle = lookup.angle;
    const slipAngle = car.isDrifting ? curve.sign * (0.28 + car.driftIntensity * 0.55) : 0;
    car.visualAngle = lookup.angle + slipAngle;

    if (car.sp >= 100 && car.turboCooldown <= 0) {
      this.useTurbo(car);
    }

    if (car.progress >= this.maxProgress && !car.finished) {
      car.finished = true;
      car.finishTime = this.elapsed;
      this.pushEvent({
        type: "finish",
        carId: car.id,
        message: `${car.name} 결승선 통과!`,
        intensity: 1
      });
    }
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

  private getCarTopSpeed(car: CarRuntime): number {
    return 238 + car.car.topSpeed * 7.4 + car.car.accel * 2.3 - car.car.weight * 0.95;
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
    car.trafficStopTime = Math.max(car.trafficStopTime, 0.25);
    if (distance < 34) return 0.02;
    if (distance < 64) return 0.18;
    return 0.46;
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

    const followFactor = gap < 48 ? 0.68 : gap < 92 ? 0.8 : 0.9;
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

    const minGap = 34 + (car.rank % 3) * 5;
    if (car.progress > target.progress - minGap) {
      car.progress = Math.max(car.previousProgress, target.progress - minGap);
      car.speed = Math.min(car.speed, target.speed * 0.94);
    }
  }

  private tryActivateShortcut(car: CarRuntime, packPosition: number): void {
    if (car.car.ruleClass !== "microExempt" || car.shortcutCooldown > 0) return;

    const shortcut = this.trafficPlan.shortcuts.find((candidate) => this.crossedProgress(car.previousProgress, car.progress, candidate.start));
    if (!shortcut) return;

    const maxBonus = Math.max(0, this.maxProgress - car.progress - 12);
    const shortcutBase = car.car.bodyType === "tractor" ? 1.12 : 1;
    const catchUpBonus = shortcutBase + packPosition * 0.5;
    const appliedBonus = Math.min(maxBonus, shortcut.bonusProgress * catchUpBonus);
    if (appliedBonus <= 0) return;

    car.progress += appliedBonus;
    car.previousProgress = car.progress;
    car.speed *= car.car.bodyType === "tractor" ? 0.86 : 0.92;
    car.shortcutTime = 1.7;
    car.shortcutOffset = shortcut.offsetSign * this.track.roadWidth * 0.86;
    car.shortcutCooldown = 10.2;
    car.highlightScore += 2.2;
    this.pushEvent({
      type: "shortcut",
      carId: car.id,
      label: "샛길",
      message: `${car.name} ${shortcut.label} 진입. 일반 도로를 건너뛰었습니다.`,
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
    const probability = 0.58 + packPosition * 0.26 + Math.max(0, 6 - car.car.grip) * 0.025;
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

    const caught = this.tryPolicePenalty(car, light.progress, "signal", "신호위반");
    if (!caught) {
      this.pushEvent({
        type: "traffic",
        carId: car.id,
        label: "신호위반",
        message: `${car.name} 빨간불을 보고도 밀어붙였습니다.`,
        intensity: 0.55
      });
    }
  }

  private recordNoPassingViolation(car: CarRuntime, zone: RoadRuleZone, target: CarRuntime, packPosition: number): void {
    const lap = Math.max(0, Math.floor(Math.max(0, car.progress) / this.runtime.totalLength));
    const key = `nopass:${car.id}:${target.id}:${zone.id}:${lap}`;
    if (this.trafficEventKeys.has(key)) return;
    this.trafficEventKeys.add(key);

    const caught = this.tryPolicePenalty(car, car.progress, "noPassing", "추월금지 위반");
    if (!caught && packPosition > 0.12) {
      car.speed *= 0.94;
      car.turboCooldown = Math.max(car.turboCooldown, 1.8);
      this.pushEvent({
        type: "traffic",
        carId: car.id,
        targetId: target.id,
        label: "무리한 추월",
        message: `${car.name} 추월금지 차로에서 ${target.name} 옆을 찔렀습니다.`,
        intensity: 0.7
      });
    }
  }

  private tryPolicePenalty(car: CarRuntime, progress: number, reason: "signal" | "noPassing", label: string): boolean {
    if (car.car.ruleClass === "microExempt") return false;

    const trap = this.findPoliceTrapNear(progress, reason);
    if (!trap) return false;

    const lap = Math.max(0, Math.floor(Math.max(0, car.progress) / this.runtime.totalLength));
    const key = `police:${car.id}:${trap.id}:${reason}:${lap}`;
    if (this.trafficEventKeys.has(key)) return false;
    this.trafficEventKeys.add(key);

    const caughtProbability = reason === "signal" ? 0.5 : 0.78;
    if (!seededChance(`${this.seed}:${key}`, caughtProbability)) return false;

    const penalty = reason === "signal" ? 3.2 : 4.8;
    car.penaltyTime = Math.max(car.penaltyTime, penalty);
    car.trafficStopTime = 0;
    car.speed *= 0.34;
    car.highlightScore += 1.1;
    this.pushEvent({
      type: "traffic",
      carId: car.id,
      label: "교통단속",
      message: `${car.name} ${label}으로 교통단속! ${penalty.toFixed(1)}초 정지합니다.`,
      intensity: 1
    });
    return true;
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

  private findPoliceTrapNear(progress: number, reason: "signal" | "noPassing"): PoliceTrapRuntime | undefined {
    return this.trafficPlan.policeTraps.find((trap) => {
      if (trap.watches !== "both" && trap.watches !== reason) return false;
      return circularDistance(progress, trap.progress, this.runtime.totalLength) <= trap.range;
    });
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

function buildTrafficPlan(track: TrackSpec, lapLength: number): TrackTrafficPlan {
  const rng = new Rng(track.seed ^ 0x51a7c0de);
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
    const bonusProgress = lapLength * rng.range(0.05, 0.066);
    return {
      id: `shortcut-${index + 1}`,
      start,
      end: normalizeDistance(start + bonusProgress, lapLength),
      bonusProgress,
      offsetSign: (index % 2 === 0 ? 1 : -1) as 1 | -1,
      label: index % 2 === 0 ? "마을 샛길" : "농로 샛길"
    };
  });

  const policeCount = 1 + rng.int(0, 1);
  const policeCandidates = [
    ...trafficLights.map((light) => ({ progress: light.progress, watches: "signal" as const })),
    ...noPassingZones.map((zone) => ({ progress: zone.start, watches: "noPassing" as const }))
  ];
  const policeTraps: PoliceTrapRuntime[] = [];
  for (let index = 0; index < policeCount; index += 1) {
    const candidate = rng.pick(policeCandidates);
    policeTraps.push({
      id: `police-${index + 1}`,
      progress: normalizeDistance(candidate.progress + rng.range(-90, 90), lapLength),
      range: rng.range(180, 260),
      watches: rng.chance(0.32) ? "both" : candidate.watches
    });
  }

  return { noPassingZones, trafficLights, shortcuts, policeTraps };
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

function circularDistance(a: number, b: number, lapLength: number): number {
  const delta = Math.abs(normalizeDistance(a, lapLength) - normalizeDistance(b, lapLength));
  return Math.min(delta, lapLength - delta);
}

function seededChance(key: string, probability: number): boolean {
  return new Rng(hashSeed(key)).chance(probability);
}
