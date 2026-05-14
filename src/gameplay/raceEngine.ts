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
  gimmickCooldown: number;
  shortcutTime: number;
  shortcutOffset: number;
  overheatTime: number;
  wasDrifting: boolean;
  highlightScore: number;
  lastRank: number;
}

export interface RaceEngineEvent {
  type: "drift" | "item" | "hit" | "overtake" | "finish" | "gimmick";
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
  readonly timeLimit = 180;
  readonly hardTimeLimit = 210;
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
        gimmickCooldown: 3.2 + index * 0.31,
        shortcutTime: 0,
        shortcutOffset: 0,
        overheatTime: 0,
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
    car.gimmickCooldown = Math.max(0, car.gimmickCooldown - dt);
    car.shortcutTime = Math.max(0, car.shortcutTime - dt);
    car.overheatTime = Math.max(0, car.overheatTime - dt);

    const curve = curvatureAt(this.runtime, car.progress);
    const zoneIntensity = getZoneIntensity(this.runtime, car.progress);
    const tightCorner = isInDriftZone(this.runtime, car.progress) || curve.amount > 0.43;
    const packPosition = this.cars.length <= 1 ? 0 : (car.rank - 1) / (this.cars.length - 1);
    const topSpeed = 252 + car.car.topSpeed * 8.1 + car.car.accel * 2 - car.car.weight * 0.75;
    const cornerPenalty = curve.amount * (0.48 - car.car.grip * 0.03);
    const driftAbility = car.car.drift / 10;
    const cleanCornerSpeed = topSpeed * Math.max(0.5, 1 - cornerPenalty);
    const driftCornerSpeed = topSpeed * (0.58 + driftAbility * 0.18 + car.car.grip * 0.012);
    const targetBase = tightCorner ? Math.min(cleanCornerSpeed, driftCornerSpeed) : cleanCornerSpeed;
    const trafficJitter = Math.sin(this.elapsed * (0.92 + car.car.accel * 0.04) + car.id.length * 1.7) * 14;
    const gimmickSpeedMultiplier = this.updateVehicleGimmick(car, dt, curve.amount, tightCorner, packPosition, zoneIntensity, topSpeed);

    let targetSpeed = (targetBase + trafficJitter) * (0.995 + packPosition * 0.035) * gimmickSpeedMultiplier;
    targetSpeed *= this.getTrafficSpeedFactor(car);
    if (car.turboTime > 0) targetSpeed *= 1.38;
    if (car.overheatTime > 0 && (car.turboTime <= 0 || tightCorner)) targetSpeed *= 0.82;
    if (car.disruptedTime > 0) targetSpeed *= 0.7;
    if (car.smokeTime > 0) targetSpeed *= 0.8;
    if (car.spinTime > 0) targetSpeed *= 0.48;

    const acceleration = 108 + car.car.accel * 18 - car.car.weight * 1.6;
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
      car.sp += dt * (11 + car.car.spGain * 2.6 + car.car.drift * 1.25) * (0.8 + car.driftIntensity + packPosition * 0.1);
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
      car.sp += dt * (2.4 + packPosition * 2.5);
    }
    car.wasDrifting = car.isDrifting;

    this.applyHazards(car);

    const rankPush = 0.99 + packPosition * 0.045;
    const racePace = this.cars.length <= 2 ? 1.12 : 1.06;
    car.progress += car.speed * rankPush * racePace * dt;

    const laneMergeRate = this.elapsed < 7 ? 0.75 : 0.38;
    car.laneOffset += (car.targetLaneOffset - car.laneOffset) * Math.min(1, dt * laneMergeRate);
    const laneNoise = Math.sin(this.elapsed * 2.4 + car.rank * 0.9) * (car.isDrifting ? 11 : 3);
    const shortcutOffset = car.shortcutTime > 0 ? car.shortcutOffset : 0;
    const lookup = lookupPath(this.runtime, car.progress, car.laneOffset + laneNoise + shortcutOffset);
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

  private updateVehicleGimmick(
    car: CarRuntime,
    dt: number,
    curveAmount: number,
    tightCorner: boolean,
    packPosition: number,
    zoneIntensity: number,
    topSpeed: number
  ): number {
    const gimmickId = car.car.gimmick.id;
    const canTrigger = car.gimmickCooldown <= 0 && this.elapsed > 5;
    const lateRace = car.progress / this.maxProgress > 0.55;
    let speedMultiplier = 1;

    if (gimmickId === "balancedDraft") {
      const target = this.findTargetAhead(car);
      const gap = target ? target.progress - car.progress : 9999;
      if (gap > 45 && gap < 300) {
        speedMultiplier += 0.08;
        car.sp += dt * (2.8 + packPosition * 2.5);
        if (canTrigger && packPosition > 0.15) {
          car.gimmickCooldown = 12;
          this.pushGimmickEvent(car, "DRAFT", `${car.name} 슬립 드래프트로 앞차 바람을 타고 따라붙습니다.`, target?.id);
        }
      }
    }

    if (gimmickId === "evSurge" && canTrigger && (curveAmount < 0.16 || packPosition > 0.42)) {
      car.turboTime = Math.max(car.turboTime, 2.8 + packPosition * 1.2);
      car.gimmickCooldown = 16;
      car.highlightScore += 1.2;
      this.pushGimmickEvent(car, "EV SURGE", `${car.name} 전기 서지. 순간 토크로 차간 거리를 찢고 나갑니다.`);
    }

    if (gimmickId === "apexLine" && tightCorner && car.speed > topSpeed * 0.28) {
      speedMultiplier += 0.015 + zoneIntensity * 0.02;
      car.sp += dt * 1.6;
      if (canTrigger) {
        car.gimmickCooldown = 15;
        this.pushGimmickEvent(car, "APEX", `${car.name} 에이펙스 라인. 코너 탈출 속도가 살아납니다.`);
      }
    }

    if (gimmickId === "bodyBlock" && canTrigger && lateRace && packPosition > 0.62) {
      const heavyBonus = car.car.weight >= 9 ? 1.35 : 1;
      this.activateShortcut(car, (340 + packPosition * 260) * heavyBonus, 12, 0.94, "SHOULDER", `${car.name} 갓길 밀어붙이기. 무거운 차체로 혼잡한 구간을 뚫습니다.`);
      const leader = this.findLeaderExcept(car);
      if (leader) {
        leader.disruptedTime = Math.max(leader.disruptedTime, 1.5);
        leader.speed *= 0.9;
      }
      car.turboTime = Math.max(car.turboTime, 3.0);
      car.shieldTime = Math.max(car.shieldTime, 3.4);
      car.sp += 32;
    } else if (gimmickId === "bodyBlock" && canTrigger && packPosition > 0.45) {
      car.turboTime = Math.max(car.turboTime, 3.4 + packPosition * 1.5);
      car.shieldTime = Math.max(car.shieldTime, 3.2);
      car.sp += car.car.weight >= 9 ? 26 : 18;
      car.gimmickCooldown = 13;
      car.highlightScore += 1.2;
      this.pushGimmickEvent(car, "HEAVY PUSH", `${car.name} 헤비 푸시. 묵직한 차체로 다시 속도를 붙입니다.`);
    } else if (gimmickId === "bodyBlock" && canTrigger) {
      const chaser = this.findCloseBehind(car, 145);
      if (chaser) {
        car.shieldTime = Math.max(car.shieldTime, 2.6);
        chaser.disruptedTime = Math.max(chaser.disruptedTime, 1.25);
        chaser.speed *= 0.88;
        car.gimmickCooldown = 15;
        this.pushGimmickEvent(car, "BLOCK", `${car.name} 바디 블록. ${chaser.name}의 추격 라인이 막혔습니다.`, chaser.id);
      }
    }

    if (gimmickId === "offroadGuard") {
      if (tightCorner) speedMultiplier += 0.07;
      if (canTrigger && lateRace && packPosition > 0.58) {
        this.activateShortcut(car, 210 + packPosition * 180, 14, 0.9, "DIRT CUT", `${car.name} 더트 컷. 가드레일 바깥 거친 길로 순위를 당깁니다.`);
        car.turboTime = Math.max(car.turboTime, 2.0);
        car.shieldTime = Math.max(car.shieldTime, 3.0);
      } else if (canTrigger && packPosition > 0.55) {
        car.turboTime = Math.max(car.turboTime, 2.1 + packPosition);
        car.shieldTime = Math.max(car.shieldTime, 2.8);
        car.gimmickCooldown = 15;
        this.pushGimmickEvent(car, "OFFROAD", `${car.name} 오프로드 가드. 거친 길을 밟고 재가속합니다.`);
      } else if (canTrigger) {
        const chaser = this.findCloseBehind(car, 125);
        if (chaser) {
          chaser.disruptedTime = Math.max(chaser.disruptedTime, 1.0);
          car.shieldTime = Math.max(car.shieldTime, 2.2);
          car.gimmickCooldown = 14;
          this.pushGimmickEvent(car, "GUARD", `${car.name} 오프로드 가드. 거친 라인으로 뒤차를 밀어냅니다.`, chaser.id);
        }
      }
    }

    if (gimmickId === "luxuryShield" && canTrigger && packPosition > 0.5) {
      car.shieldTime = Math.max(car.shieldTime, 4.6);
      car.turboTime = Math.max(car.turboTime, 2.4 + packPosition);
      car.gimmickCooldown = 16;
      car.highlightScore += 1;
      this.pushGimmickEvent(car, "SHIELD", `${car.name} 프리미엄 실드. 하위권에서 안정적으로 재가속합니다.`);
    }

    if (gimmickId === "straightBurst" && canTrigger && curveAmount < 0.13) {
      car.turboTime = Math.max(car.turboTime, 2.2);
      car.gimmickCooldown = 24;
      car.highlightScore += 1.2;
      this.pushGimmickEvent(car, "STRAIGHT", `${car.name} 직선 사냥. 직선 구간에서 단숨에 벌립니다.`);
    }
    if (gimmickId === "straightBurst" && tightCorner) {
      speedMultiplier *= 0.97;
    }

    if (gimmickId === "hyperOverheat" && canTrigger && curveAmount < 0.12) {
      car.turboTime = Math.max(car.turboTime, 3.4);
      car.overheatTime = Math.max(car.overheatTime, 7.5);
      car.gimmickCooldown = 20;
      car.highlightScore += 1.5;
      this.pushGimmickEvent(car, "OVERHEAT", `${car.name} 오버히트 부스트. 직선은 압도적이지만 다음 코너가 부담입니다.`);
    }

    if (gimmickId === "alleyShortcut" && canTrigger && tightCorner && packPosition > 0.2) {
      this.activateShortcut(car, 310 + packPosition * 220 + zoneIntensity * 110, 17, 0.9, "SHORTCUT", `${car.name} 샛길 돌파. 헤어핀 안쪽 골목으로 레이스를 가로지릅니다.`);
    }

    if (gimmickId === "farmShortcut" && canTrigger && tightCorner && packPosition > 0.18) {
      const farmBonus = lateRace
        ? 650 + packPosition * 420 + zoneIntensity * 160
        : 450 + packPosition * 320 + zoneIntensity * 130;
      this.activateShortcut(car, farmBonus, 19, 0.86, "FARM ROAD", `${car.name} 논두렁 루트. 느리지만 농로 지름길로 단번에 따라붙습니다.`);
      car.shieldTime = Math.max(car.shieldTime, 2.4);
    }

    if (gimmickId === "courierDash" && canTrigger && packPosition > 0.22 && (tightCorner || curveAmount < 0.18)) {
      this.activateShortcut(car, 120 + packPosition * 120, 16, 0.95, "DELIVERY", `${car.name} 배달 골목질주. 좁은 라인으로 빠르게 파고듭니다.`);
      car.turboTime = Math.max(car.turboTime, 2.2);
    }

    return speedMultiplier;
  }

  private activateShortcut(car: CarRuntime, bonusProgress: number, cooldown: number, speedRetain: number, label: string, message: string): void {
    const maxBonus = Math.max(0, this.maxProgress - car.progress);
    const appliedBonus = Math.min(maxBonus, bonusProgress);
    if (appliedBonus <= 0) return;

    const direction = Math.sin(car.progress * 0.017 + car.rank) >= 0 ? 1 : -1;
    car.progress += appliedBonus;
    car.previousProgress = car.progress;
    car.speed *= speedRetain;
    car.shortcutTime = 1.6;
    car.shortcutOffset = direction * this.track.roadWidth * 0.78;
    car.gimmickCooldown = cooldown;
    car.highlightScore += 2.1;
    this.pushGimmickEvent(car, label, message);
  }

  private getTrafficSpeedFactor(car: CarRuntime): number {
    const target = this.findTargetAhead(car);
    if (!target) return 1;

    const gap = target.progress - car.progress;
    if (gap <= 0 || gap > 165) return 1;
    if (car.car.gimmick.id === "balancedDraft" && gap > 45) return 1;
    if (gap < 45) return 0.86;
    if (gap < 90) return 0.93;
    return 0.98;
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
    car.itemCooldown = Math.max(2.8, 4.6 + this.rng.range(0, 1.2) - packPosition * 1.25);
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
    if (car.rank === this.cars.length) pool.push("rocket", "turbo", "lineDisrupt", "turbo", "rocket", "turbo");
    if (car.rank > this.cars.length * 0.6) pool.push("rocket", "turbo", "lineDisrupt", "turbo");
    if (
      car.rank > this.cars.length * 0.55 &&
      (car.car.gimmick.id === "bodyBlock" || car.car.gimmick.id === "offroadGuard" || car.car.gimmick.id === "luxuryShield")
    ) {
      pool.push("rocket", "turbo", "rocket", "lineDisrupt");
    }
    if (car.rank === 1) pool.push("banana", "smoke", "shield");
    if (car.isDrifting) pool.push("turbo", "lineDisrupt");
    return this.rng.pick(pool);
  }

  private findTargetAhead(car: CarRuntime): CarRuntime | undefined {
    return [...this.cars]
      .filter((candidate) => candidate.id !== car.id && !candidate.finished && candidate.progress > car.progress)
      .sort((a, b) => a.progress - b.progress)[0];
  }

  private findCloseBehind(car: CarRuntime, distance: number): CarRuntime | undefined {
    return [...this.cars]
      .filter((candidate) => {
        if (candidate.id === car.id || candidate.finished) return false;
        const gap = car.progress - candidate.progress;
        return gap > 0 && gap < distance;
      })
      .sort((a, b) => b.progress - a.progress)[0];
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

  private pushGimmickEvent(car: CarRuntime, label: string, message: string, targetId?: string): void {
    this.pushEvent({
      type: "gimmick",
      carId: car.id,
      targetId,
      label,
      message,
      intensity: 0.9
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
