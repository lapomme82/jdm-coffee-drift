import type { CarSpec } from "../types";
import baeminSprite from "../assets/cars/baemin.png";
import benchBargainsaleSprite from "../assets/cars/bench-bargainsale.png";
import chevroletTraxSprite from "../assets/cars/chevrolet-trax.png";
import countryMaibahuSprite from "../assets/cars/country-maibahu.png";
import ferrariFPlusSprite from "../assets/cars/ferrari-f-plus.png";
import genesimpsonZv80Sprite from "../assets/cars/genesimpson-zv80.png";
import leeChangjuRickshawSprite from "../assets/cars/lee-changju-rickshaw.png";
import linkNautilusSprite from "../assets/cars/link-nautilus.png";
import ouyaR8Sprite from "../assets/cars/ouya-r8.png";
import porsche119Sprite from "../assets/cars/porsche-119.png";
import rangeRoverDefenseSprite from "../assets/cars/range-rover-defense.png";
import teslaCybertruckSprite from "../assets/cars/tesla-cybertruck.png";
import teslaModelYgSprite from "../assets/cars/tesla-model-yg.png";
import vmw3e0iSprite from "../assets/cars/vmw-3e0i.png";

export const cars: CarSpec[] = [
  {
    id: "chevrolet-trax",
    name: "세보레 트뤡스",
    role: "쉐보레 트랙스 기반 / 가벼운 도심형 크로스오버",
    description: "실차처럼 출력은 낮지만 차체가 가볍고 다루기 쉬워 안정적으로 중위권을 노리는 기본기형 차량입니다.",
    sprite: chevroletTraxSprite,
    bodyType: "crossover",
    reference: {
      model: "Chevrolet Trax 1.2T",
      powerHp: 137,
      zeroToHundredSec: 10.1,
      topSpeedKmh: 185,
      weightKg: 1390,
      source: "MotorTrend / Car and Driver"
    },
    ruleClass: "standard",
    raceSpriteWidth: 92,
    colors: { primary: 0xe8dfcf, secondary: 0x111820, trim: 0x8f8576 },
    topSpeed: 5.0,
    accel: 4.3,
    grip: 6.4,
    drift: 5.2,
    spGain: 6.6,
    weight: 5.1
  },
  {
    id: "tesla-cybertruck",
    name: "태슬라 사이비트럭",
    role: "테슬라 사이버트럭 기반 / 무거운 전기 픽업",
    description: "초반 토크는 강하지만 차체가 매우 무거워 헤어핀과 추월금지 구간에서 부담이 큰 직선형 차량입니다.",
    sprite: teslaCybertruckSprite,
    bodyType: "truck",
    reference: {
      model: "Tesla Cybertruck AWD/Cyberbeast",
      powerHp: 600,
      zeroToHundredSec: 3.9,
      topSpeedKmh: 182,
      weightKg: 2965,
      source: "Tesla / Car and Driver / MotorTrend"
    },
    ruleClass: "standard",
    raceSpriteWidth: 96,
    colors: { primary: 0xaeb8c6, secondary: 0x111827, trim: 0x8ecae6 },
    topSpeed: 5.8,
    accel: 9.2,
    grip: 4.9,
    drift: 3.2,
    spGain: 5.0,
    weight: 10.0
  },
  {
    id: "tesla-model-yg",
    name: "태슬라 모델YG",
    role: "테슬라 모델 Y 기반 / 고가속 전기 크로스오버",
    description: "가속이 뛰어나 재출발과 짧은 직선에서 강합니다. 무게 때문에 긴 드리프트 유지력은 스포츠카보다 낮습니다.",
    sprite: teslaModelYgSprite,
    bodyType: "crossover",
    reference: {
      model: "Tesla Model Y Performance",
      powerHp: 455,
      zeroToHundredSec: 3.7,
      topSpeedKmh: 250,
      weightKg: 2005,
      source: "Tesla / Car and Driver"
    },
    ruleClass: "standard",
    raceSpriteWidth: 94,
    colors: { primary: 0xcfd6df, secondary: 0x151c27, trim: 0x7dd3fc },
    topSpeed: 7.4,
    accel: 8.7,
    grip: 6.7,
    drift: 4.7,
    spGain: 5.6,
    weight: 7.1
  },
  {
    id: "vmw-3e0i",
    name: "VMW 3e0i",
    role: "BMW 320i 기반 / 균형 잡힌 후륜 세단",
    description: "압도적인 수치는 없지만 차체 밸런스와 라인 유지력이 좋아 헤어핀에서 안정적인 드리프트가 가능합니다.",
    sprite: vmw3e0iSprite,
    bodyType: "sedan",
    reference: {
      model: "BMW 320i",
      powerHp: 184,
      zeroToHundredSec: 7.4,
      topSpeedKmh: 235,
      weightKg: 1515,
      source: "BMW technical data / Automobile Catalog"
    },
    ruleClass: "standard",
    raceSpriteWidth: 92,
    colors: { primary: 0x151515, secondary: 0x2f3945, trim: 0x3b82f6 },
    topSpeed: 6.8,
    accel: 5.9,
    grip: 7.8,
    drift: 7.3,
    spGain: 7.0,
    weight: 5.5
  },
  {
    id: "bench-bargainsale",
    name: "벤치 바겐세일",
    role: "메르세데스-벤츠 G-Class 기반 / 박스형 고중량 SUV",
    description: "무게와 높은 차체 때문에 코너에서는 손해를 보지만, 막히는 구간에서 속도가 쉽게 죽지 않는 묵직한 SUV입니다.",
    sprite: benchBargainsaleSprite,
    bodyType: "suv",
    reference: {
      model: "Mercedes-Benz G 550",
      powerHp: 443,
      zeroToHundredSec: 5.3,
      topSpeedKmh: 210,
      weightKg: 2510,
      source: "Mercedes-Benz USA"
    },
    ruleClass: "standard",
    raceSpriteWidth: 94,
    colors: { primary: 0x12395f, secondary: 0x07111c, trim: 0xd8dee9 },
    topSpeed: 6.0,
    accel: 6.9,
    grip: 5.5,
    drift: 3.7,
    spGain: 5.2,
    weight: 9.4
  },
  {
    id: "range-rover-defense",
    name: "레인지로버 디펜스",
    role: "랜드로버 디펜더 기반 / 오프로더 SUV",
    description: "직선 성능은 무난하지만 거친 코너에서 안정적으로 버티는 SUV입니다. 스포츠카만큼 날카롭지는 않습니다.",
    sprite: rangeRoverDefenseSprite,
    bodyType: "suv",
    reference: {
      model: "Land Rover Defender 110 P400",
      powerHp: 395,
      zeroToHundredSec: 5.8,
      topSpeedKmh: 191,
      weightKg: 2284,
      source: "Land Rover / Edmunds"
    },
    ruleClass: "standard",
    raceSpriteWidth: 94,
    colors: { primary: 0xb59f6b, secondary: 0x0f1720, trim: 0x7ee081 },
    topSpeed: 5.9,
    accel: 6.5,
    grip: 6.8,
    drift: 4.2,
    spGain: 5.6,
    weight: 8.6
  },
  {
    id: "genesimpson-zv80",
    name: "제네심슨 ZV80",
    role: "제네시스 GV80 기반 / 고급 대형 SUV",
    description: "출력은 충분하지만 무게가 있어 재빠른 라인 변경은 어렵습니다. 긴 코너에서 차분히 속도를 쌓습니다.",
    sprite: genesimpsonZv80Sprite,
    bodyType: "suv",
    reference: {
      model: "Genesis GV80 3.5T",
      powerHp: 375,
      zeroToHundredSec: 5.7,
      topSpeedKmh: 241,
      weightKg: 2292,
      source: "Genesis / Car and Driver"
    },
    ruleClass: "standard",
    raceSpriteWidth: 94,
    colors: { primary: 0xf5f7fa, secondary: 0x111820, trim: 0xc9a86a },
    topSpeed: 6.9,
    accel: 6.8,
    grip: 6.6,
    drift: 4.4,
    spGain: 5.6,
    weight: 8.5
  },
  {
    id: "link-nautilus",
    name: "링크 노틸러스",
    role: "링컨 노틸러스 기반 / 안정형 크로스오버",
    description: "빠르진 않지만 예측 가능한 차체 반응으로 신호와 추월금지 구간에서 실수를 적게 내는 편입니다.",
    sprite: linkNautilusSprite,
    bodyType: "crossover",
    reference: {
      model: "Lincoln Nautilus 2.0T",
      powerHp: 250,
      zeroToHundredSec: 6.8,
      topSpeedKmh: 203,
      weightKg: 1973,
      source: "Lincoln / Edmunds / Car and Driver"
    },
    ruleClass: "standard",
    raceSpriteWidth: 94,
    colors: { primary: 0xdce4ee, secondary: 0x111820, trim: 0xa7b2c3 },
    topSpeed: 5.7,
    accel: 5.6,
    grip: 6.3,
    drift: 4.5,
    spGain: 6.4,
    weight: 7.4
  },
  {
    id: "porsche-119",
    name: "포르쉐 119",
    role: "포르쉐 911 기반 / 고속 스포츠카",
    description: "가볍고 빠르며 코너 한계도 높습니다. 대신 추월금지 구간에서 무리한 추월을 시도할 수 있습니다.",
    sprite: porsche119Sprite,
    bodyType: "sports",
    reference: {
      model: "Porsche 911 Carrera",
      powerHp: 388,
      zeroToHundredSec: 3.9,
      topSpeedKmh: 294,
      weightKg: 1516,
      source: "Porsche"
    },
    ruleClass: "sportsRisk",
    raceSpriteWidth: 92,
    colors: { primary: 0xcbd5e1, secondary: 0x111820, trim: 0xc0842e },
    topSpeed: 9.0,
    accel: 8.8,
    grip: 9.2,
    drift: 7.6,
    spGain: 3.0,
    weight: 5.1
  },
  {
    id: "ouya-r8",
    name: "어우야 알8",
    role: "아우디 R8 기반 / 미드십 슈퍼카",
    description: "최고속과 가속이 모두 강한 슈퍼카입니다. 추월금지 구간에서 욕심을 내면 경찰 단속 리스크가 있습니다.",
    sprite: ouyaR8Sprite,
    bodyType: "sports",
    reference: {
      model: "Audi R8 V10 Performance",
      powerHp: 562,
      zeroToHundredSec: 3.2,
      topSpeedKmh: 330,
      weightKg: 1633,
      source: "Audi / FastestLaps / AccelerationTimes"
    },
    ruleClass: "sportsRisk",
    raceSpriteWidth: 94,
    colors: { primary: 0xe8eef2, secondary: 0x0a0d12, trim: 0xf97316 },
    topSpeed: 9.8,
    accel: 9.4,
    grip: 9.0,
    drift: 6.9,
    spGain: 3.0,
    weight: 5.8
  },
  {
    id: "ferrari-f-plus",
    name: "훼라리 F+",
    role: "페라리 F12 기반 / 전륜 미드십 V12 GT",
    description: "압도적인 최고속과 가속을 가진 고성능 차량입니다. 빠른 만큼 추월금지 차로에서 사고를 치기 쉽습니다.",
    sprite: ferrariFPlusSprite,
    bodyType: "hypercar",
    reference: {
      model: "Ferrari F12berlinetta",
      powerHp: 730,
      zeroToHundredSec: 3.1,
      topSpeedKmh: 340,
      weightKg: 1630,
      source: "Ferrari"
    },
    ruleClass: "sportsRisk",
    raceSpriteWidth: 94,
    colors: { primary: 0xf51d1d, secondary: 0x101014, trim: 0xffd166 },
    topSpeed: 10.0,
    accel: 9.6,
    grip: 8.4,
    drift: 7.5,
    spGain: 3.0,
    weight: 5.6
  },
  {
    id: "lee-changju-rickshaw",
    name: "이창주 인력거",
    role: "인력거 기반 / 초저속 샛길 특화",
    description: "직선은 느리지만 신호등과 경찰 단속을 받지 않고, 지정된 샛길을 탈 수 있어 뒤처져도 다시 붙을 수 있습니다.",
    sprite: leeChangjuRickshawSprite,
    bodyType: "rickshaw",
    reference: {
      model: "Pedicab / rickshaw",
      powerHp: 1,
      zeroToHundredSec: 99,
      topSpeedKmh: 25,
      weightKg: 120,
      source: "Typical pedicab estimates"
    },
    ruleClass: "microExempt",
    raceSpriteWidth: 74,
    colors: { primary: 0xb91c1c, secondary: 0x111111, trim: 0xf5d48b },
    topSpeed: 2.8,
    accel: 2.5,
    grip: 8.8,
    drift: 8.7,
    spGain: 4.2,
    weight: 1.8
  },
  {
    id: "country-maibahu",
    name: "컨트리 마이바후",
    role: "경운기 기반 / 농로 샛길 특화",
    description: "가장 느린 편이지만 경찰 단속 제외와 샛길 이용으로 레이스 흐름을 흔드는 커피 내기용 변수 차량입니다.",
    sprite: countryMaibahuSprite,
    bodyType: "tractor",
    reference: {
      model: "Power tiller / cultivator",
      powerHp: 10,
      zeroToHundredSec: 99,
      topSpeedKmh: 18,
      weightKg: 450,
      source: "Typical agricultural power tiller estimates"
    },
    ruleClass: "microExempt",
    raceSpriteWidth: 86,
    colors: { primary: 0xc2410c, secondary: 0x3b2417, trim: 0xfacc15 },
    topSpeed: 3.1,
    accel: 3.0,
    grip: 5.8,
    drift: 3.4,
    spGain: 5.4,
    weight: 4.4
  },
  {
    id: "baemin",
    name: "배달의민족",
    role: "전동 킥보드 기반 / 신호 무시 샛길 주행",
    description: "최고속은 낮지만 가볍고 민첩합니다. 신호등과 단속을 무시하고 좁은 샛길로 순위를 흔듭니다.",
    sprite: baeminSprite,
    bodyType: "scooter",
    reference: {
      model: "Electric kick scooter",
      powerHp: 1,
      zeroToHundredSec: 99,
      topSpeedKmh: 25,
      weightKg: 25,
      source: "Typical commuter e-scooter estimates"
    },
    ruleClass: "microExempt",
    raceSpriteWidth: 54,
    colors: { primary: 0x111111, secondary: 0xf8fafc, trim: 0xf59e0b },
    topSpeed: 3.2,
    accel: 5.3,
    grip: 7.4,
    drift: 6.4,
    spGain: 4.4,
    weight: 1.0
  }
];

export function getCar(carId: string): CarSpec {
  return cars.find((car) => car.id === carId) ?? cars[0];
}
