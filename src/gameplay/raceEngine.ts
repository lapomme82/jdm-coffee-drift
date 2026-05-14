import { getCar } from "../data/cars";
import { getTrack } from "../data/tracks";
import type { CarSpec, ItemType, LeaderboardEntry, PlayerConfig, Point, RaceResult, RaceSetup, RaceSnapshot, TrackSpec } from "../types";
import { buildTrackRuntime, curvatureAt, getZoneIntensity, isInDriftZone, lookupPath, type TrackRuntime } from "./path";
import { Rng } from "./rng";

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
  shieldTime: number;
  disruptedTime: number;
  smokeTime: number;
  spinTime: number;
  itemCooldown: number;
  wasDrifting: boolean;
  highlightScore: number;
  lastRank: number;
}

export interface RaceEngineEvent {
  type: "drift" | "item" | "hit" | "overtake" | "finish";
  carId: string;
  targetId?: string;
  item?: ItemType;
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

const ITEM_NAMES: Record<ItemType, string> = {
  banana: "바나나",
  rocket: "로켓",
  turbo: "터보",
  shield: "실드",
  smoke: "연막",
  lineDisrupt: "라인 교란"
};

const HIGHLIGHTS = [
  "마지막 코너까지 커피값을 피해 달렸습니다.",
  "헤어핀에서 타이어 연기가 아주 진하게 피었습니다.",
  "중계 카메라가 자주 잡을 만큼 존재감이 컸습니다.",
  "아이템 타이밍이 팀 채팅에서 오래 회자될 만했습니다.",
  "깔끔한 주행보다 드라마를 택한 레이스였습니다."
];

export class RaceEngine {
  readonly track: TrackSpec;
  readonly runtime: TrackRuntime;
  readonly cars: CarRuntime[];
  readonly maxProgress: number;
  readonly timeLimit = 132;
  readonly eventLog: string[] = [];

  elapsed = 0;
  complete = false;
  events: RaceEngineEvent[] = [];

  private rng: Rng;
  private hazards: RaceHazard[] = [];
  private hazardCounter = 0;

  constructor(setup: RaceSetup) {
    this.track = getTrack(setup.trackId);
    this.runtime = buildTrackRuntime(this.track);
    this.maxProgress = this.runtime.totalLength * this.track.laps;
    this.rng = new Rng(setup.seed ^ this.track.seed);

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
        speed: 82 + this.rng.range(0, 26),
        position: lookup.point,
        angle: lookup.angle,
        visualAngle: lookup.angle,
        rank: index + 1,
        sp: this.rng.range(10, 28),
        isDrifting: false,
        driftIntensity: 0,
        driftSeconds: 0,
        itemUses: 0,
        maxSpeed: 0,
        finished: false,
        turboTime: 0,
        shieldTime: 0,
        disruptedTime: 0,
        smokeTime: 0,
        spinTime: 0,
        itemCooldown: 1.1 + index * 0.14,
        wasDrifting: false,
        highlightScore: 0,
        lastRank: index + 1
      };
    });

    this.eventLog.push(`오늘의 랜덤 코스: ${this.track.name}`);
    this.updateRanks(false);
  }

  update(deltaSeconds: number): void {
    if (this.complete) return;

    const dt = Math.min(0.05, deltaSeconds);
    this.elapsed += dt;
    this.events = [];

    this.hazards.forEach((hazard) => {
      hazard.ttl -= dt;
    });
    this.hazards = this.hazards.filter((hazard) => hazard.ttl > 0 && !hazard.consumed);

    this.updateRanks(false);
    for (const car of this.cars) {
      this.updateCar(car, dt);
    }
    this.updateRanks(true);

    if (this.elapsed >= this.timeLimit) {
      this.forceComplete();
    } else if (this.cars.every((car) => car.finished)) {
      this.complete = true;
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
      leaderboard: this.getLeaderboard()
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
    return this.hazards;
  }

  private updateCar(car: CarRuntime, dt: number): void {
    if (car.finished) {
      car.speed = Math.max(0, car.speed - 300 * dt);
      return;
    }

    car.previousProgress = car.progress;
    car.turboTime = Math.max(0, car.turboTime - dt);
    car.shieldTime = Math.max(0, car.shieldTime - dt);
    car.disruptedTime = Math.max(0, car.disruptedTime - dt);
    car.smokeTime = Math.max(0, car.smokeTime - dt);
    car.spinTime = Math.max(0, car.spinTime - dt);
    car.itemCooldown = Math.max(0, car.itemCooldown - dt);

    const curve = curvatureAt(this.runtime, car.progress);
    const zoneIntensity = getZoneIntensity(this.runtime, car.progress);
    const tightCorner = isInDriftZone(this.runtime, car.progress) || curve.amount > 0.43;
    const packPosition = this.cars.length <= 1 ? 0 : (car.rank - 1) / (this.cars.length - 1);
    const topSpeed = 226 + car.car.topSpeed * 10.8 + car.car.accel * 2.4 - car.car.weight * 1.25;
    const cornerPenalty = curve.amount * (0.48 - car.car.grip * 0.03);
    const driftAbility = car.car.drift / 10;
    const cleanCornerSpeed = topSpeed * Math.max(0.5, 1 - cornerPenalty);
    const driftCornerSpeed = topSpeed * (0.58 + driftAbility * 0.18 + car.car.grip * 0.012);
    const targetBase = tightCorner ? Math.min(cleanCornerSpeed, driftCornerSpeed) : cleanCornerSpeed;
    const trafficJitter = Math.sin(this.elapsed * (0.92 + car.car.accel * 0.04) + car.id.length * 1.7) * 14;

    let targetSpeed = (targetBase + trafficJitter) * (0.985 + packPosition * 0.08);
    if (car.turboTime > 0) targetSpeed *= 1.38;
    if (car.disruptedTime > 0) targetSpeed *= 0.7;
    if (car.smokeTime > 0) targetSpeed *= 0.8;
    if (car.spinTime > 0) targetSpeed *= 0.48;

    const acceleration = 92 + car.car.accel * 21 - car.car.weight * 2.4;
    const braking = 148 + car.car.grip * 14;
    if (car.speed < targetSpeed) car.speed = Math.min(targetSpeed, car.speed + acceleration * dt);
    else car.speed = Math.max(targetSpeed, car.speed - braking * dt);

    const randomSlip = (this.rng.next() - 0.5) * (12 - car.car.grip) * 2.2;
    car.speed = Math.max(55, car.speed + randomSlip * dt);
    car.maxSpeed = Math.max(car.maxSpeed, car.speed);

    const rawDrift = Math.min(1, curve.amount * 1.2 + zoneIntensity * 0.45 + (1 - car.car.grip / 10) * 0.14);
    car.isDrifting = tightCorner && car.speed > topSpeed * 0.34 && rawDrift > 0.42;
    car.driftIntensity = car.isDrifting ? Math.min(1, rawDrift * (0.72 + driftAbility * 0.52)) : 0;

    if (car.isDrifting) {
      car.driftSeconds += dt;
      car.sp += dt * (11 + car.car.spGain * 2.6 + car.car.drift * 1.25) * (0.8 + car.driftIntensity + packPosition * 0.22);
      car.highlightScore += dt * 0.7;
      if (!car.wasDrifting && this.rng.chance(0.72)) {
        this.pushEvent({
          type: "drift",
          carId: car.id,
          message: `${car.name} 헤어핀 드리프트! SP가 빠르게 차오릅니다.`,
          intensity: 0.7 + car.driftIntensity
        });
      }
    } else {
      car.sp += dt * (2.2 + packPosition * 3.4);
    }
    car.wasDrifting = car.isDrifting;

    this.applyHazards(car);

    const rankPush = 0.965 + packPosition * 0.17;
    car.progress += car.speed * rankPush * dt;

    const laneMergeRate = this.elapsed < 7 ? 0.75 : 0.38;
    car.laneOffset += (car.targetLaneOffset - car.laneOffset) * Math.min(1, dt * laneMergeRate);
    const laneNoise = Math.sin(this.elapsed * 2.4 + car.rank * 0.9) * (car.isDrifting ? 11 : 3);
    const lookup = lookupPath(this.runtime, car.progress, car.laneOffset + laneNoise);
    car.position = lookup.point;
    car.angle = lookup.angle;
    const slipAngle = car.isDrifting ? curve.sign * (0.28 + car.driftIntensity * 0.55) : 0;
    const instability = car.spinTime > 0 ? Math.sin(this.elapsed * 27) * 0.65 : 0;
    car.visualAngle = lookup.angle + slipAngle + instability;

    if (car.sp >= 100 && car.itemCooldown <= 0) {
      this.useItem(car);
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

  private applyHazards(car: CarRuntime): void {
    for (const hazard of this.hazards) {
      if (hazard.ownerId === car.id || hazard.consumed || car.shieldTime > 0) continue;

      const crossed = car.previousProgress <= hazard.progress && car.progress >= hazard.progress;
      const inSmoke = hazard.type === "smoke" && car.progress > hazard.progress && car.progress < hazard.endProgress;
      if (hazard.type === "banana" && crossed) {
        hazard.consumed = true;
        car.spinTime = 1.1;
        car.speed *= 0.62;
        car.highlightScore += 1.3;
        this.pushEvent({
          type: "hit",
          carId: car.id,
          targetId: hazard.ownerId,
          item: "banana",
          message: `${car.name} 바나나에 미끄러졌습니다!`,
          intensity: 1
        });
      } else if (inSmoke) {
        car.smokeTime = Math.max(car.smokeTime, 1.0);
      }
    }
  }

  private useItem(car: CarRuntime): void {
    const item = this.chooseItem(car);
    car.sp = 0;
    car.itemUses += 1;
    const packPosition = this.cars.length <= 1 ? 0 : (car.rank - 1) / (this.cars.length - 1);
    car.itemCooldown = Math.max(3.1, 4.8 + this.rng.range(0, 1.8) - packPosition * 1.35);
    car.highlightScore += 1.7;

    if (item === "turbo") {
      car.turboTime = 4.8;
      this.pushItemEvent(car, item, `${car.name} 터보 발동! 직선 구간을 시원하게 뚫고 나갑니다.`);
      return;
    }

    if (item === "shield") {
      car.shieldTime = 5.2;
      this.pushItemEvent(car, item, `${car.name} 실드 전개. 다음 방해를 받아낼 준비가 됐습니다.`);
      return;
    }

    if (item === "banana") {
      this.hazards.push({
        id: `hazard-${this.hazardCounter++}`,
        type: "banana",
        ownerId: car.id,
        progress: car.progress - 12,
        endProgress: car.progress + 18,
        ttl: 22,
        consumed: false
      });
      this.pushItemEvent(car, item, `${car.name} 바나나 설치. 뒤차 라인이 위험해집니다.`);
      return;
    }

    if (item === "smoke") {
      this.hazards.push({
        id: `hazard-${this.hazardCounter++}`,
        type: "smoke",
        ownerId: car.id,
        progress: car.progress - 28,
        endProgress: car.progress + 280,
        ttl: 6.2,
        consumed: false
      });
      this.pushItemEvent(car, item, `${car.name} 연막 살포. 추격 차량의 시야가 흔들립니다.`);
      return;
    }

    const target = this.findTargetAhead(car) ?? this.findLeaderExcept(car);
    if (!target) {
      car.turboTime = 3.6;
      this.pushItemEvent(car, "turbo", `${car.name} 빈 도로에서 터보로 승부합니다.`);
      return;
    }

    if (target.shieldTime > 0) {
      target.shieldTime = 0;
      this.pushItemEvent(car, item, `${car.name} ${ITEM_NAMES[item]} 사용, 하지만 ${target.name}의 실드가 막았습니다.`, target.id);
      return;
    }

    if (item === "rocket") {
      target.disruptedTime = Math.max(target.disruptedTime, 2.25);
      target.speed *= 0.66;
      this.pushItemEvent(car, item, `${car.name} 로켓 명중! ${target.name} 속도가 크게 죽었습니다.`, target.id);
      return;
    }

    target.disruptedTime = Math.max(target.disruptedTime, 3.2);
    target.speed *= 0.8;
    this.pushItemEvent(car, item, `${car.name} 라인 교란! ${target.name}의 코너 진입이 흔들립니다.`, target.id);
  }

  private chooseItem(car: CarRuntime): ItemType {
    const pool = [...car.car.specialBias];
    if (car.rank === this.cars.length) pool.push("rocket", "turbo", "lineDisrupt", "turbo");
    if (car.rank === 1) pool.push("banana", "smoke", "shield");
    if (car.isDrifting) pool.push("turbo", "lineDisrupt");
    return this.rng.pick(pool);
  }

  private findTargetAhead(car: CarRuntime): CarRuntime | undefined {
    return [...this.cars]
      .filter((candidate) => candidate.id !== car.id && !candidate.finished && candidate.progress > car.progress)
      .sort((a, b) => a.progress - b.progress)[0];
  }

  private findLeaderExcept(car: CarRuntime): CarRuntime | undefined {
    return [...this.cars]
      .filter((candidate) => candidate.id !== car.id && !candidate.finished)
      .sort((a, b) => b.progress - a.progress)[0];
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

  private pushItemEvent(car: CarRuntime, item: ItemType, message: string, targetId?: string): void {
    this.pushEvent({
      type: "item",
      carId: car.id,
      targetId,
      item,
      message,
      intensity: item === "rocket" || item === "lineDisrupt" ? 1 : 0.85
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
