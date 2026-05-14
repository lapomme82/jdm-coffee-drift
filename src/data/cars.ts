import type { CarSpec, VehicleGimmick, VehicleGimmickId } from "../types";
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

export const vehicleGimmicks: Record<VehicleGimmickId, VehicleGimmick> = {
  balancedDraft: {
    id: "balancedDraft",
    name: "슬립 드래프트",
    description: "앞차 뒤에 붙으면 공기 흐름을 타고 SP와 속도를 조금씩 회복합니다."
  },
  evSurge: {
    id: "evSurge",
    name: "전기 서지",
    description: "직선이나 추격 상황에서 순간 토크를 폭발시켜 짧은 터보를 얻습니다."
  },
  apexLine: {
    id: "apexLine",
    name: "에이펙스 라인",
    description: "헤어핀 드리프트가 안정적이면 코너 탈출 속도와 SP 보상이 커집니다."
  },
  bodyBlock: {
    id: "bodyBlock",
    name: "바디 블록",
    description: "뒤차가 너무 가까우면 차폭으로 라인을 막아 추격 리듬을 끊습니다."
  },
  offroadGuard: {
    id: "offroadGuard",
    name: "오프로드 가드",
    description: "거친 코너에서 흔들림이 적고 뒤차를 압박하는 방어 기믹을 가집니다."
  },
  luxuryShield: {
    id: "luxuryShield",
    name: "프리미엄 실드",
    description: "하위권으로 밀리면 자동 실드와 안정 주행 보정으로 다시 붙습니다."
  },
  straightBurst: {
    id: "straightBurst",
    name: "직선 사냥",
    description: "직선 구간에서 터보를 터뜨려 선두권을 벌리지만 코너에서는 이득이 줄어듭니다."
  },
  hyperOverheat: {
    id: "hyperOverheat",
    name: "오버히트 부스트",
    description: "강력한 직선 부스트 후 과열로 코너 안정성이 흔들리는 고위험 기믹입니다."
  },
  alleyShortcut: {
    id: "alleyShortcut",
    name: "샛길 돌파",
    description: "뒤처진 상태로 헤어핀에 들어가면 좁은 샛길을 타고 진행도를 크게 당깁니다."
  },
  farmShortcut: {
    id: "farmShortcut",
    name: "논두렁 루트",
    description: "느리지만 하위권 헤어핀에서 농로 지름길을 타고 한 번에 따라붙습니다."
  },
  courierDash: {
    id: "courierDash",
    name: "배달 골목질주",
    description: "하위권에서 골목 라인을 타고 짧은 지름길과 터보를 동시에 얻습니다."
  }
};

export const cars: CarSpec[] = [
  {
    id: "chevrolet-trax",
    name: "세보레 트뤡스",
    role: "밸런스 소형 SUV / 초반 견제",
    description: "무난한 가속과 안정적인 코너링으로 어디서든 중간 이상을 해내는 기본기형 엔트리입니다.",
    sprite: chevroletTraxSprite,
    bodyType: "crossover",
    raceSpriteWidth: 92,
    colors: { primary: 0xe8dfcf, secondary: 0x111820, trim: 0x8f8576 },
    topSpeed: 7,
    accel: 7,
    grip: 7,
    drift: 6,
    spGain: 7,
    weight: 6,
    specialBias: ["turbo", "shield", "lineDisrupt"],
    gimmick: vehicleGimmicks.balancedDraft
  },
  {
    id: "tesla-cybertruck",
    name: "태슬라 사이비트럭",
    role: "각진 전기 트럭 / 몸싸움 돌파",
    description: "묵직한 차체와 빠른 전기 토크로 직선에서 길을 열지만, 좁은 코너에서는 과감한 제동이 필요합니다.",
    sprite: teslaCybertruckSprite,
    bodyType: "truck",
    raceSpriteWidth: 96,
    colors: { primary: 0xaeb8c6, secondary: 0x111827, trim: 0x8ecae6 },
    topSpeed: 7.8,
    accel: 8,
    grip: 5,
    drift: 4,
    spGain: 6,
    weight: 9,
    specialBias: ["rocket", "shield", "lineDisrupt"],
    gimmick: vehicleGimmicks.bodyBlock
  },
  {
    id: "tesla-model-yg",
    name: "태슬라 모델YG",
    role: "전기 크로스오버 / 런치 스타터",
    description: "초반 가속이 강하고 회복이 빨라, 출발 직후와 재가속 구간에서 앞차를 바짝 압박합니다.",
    sprite: teslaModelYgSprite,
    bodyType: "crossover",
    raceSpriteWidth: 94,
    colors: { primary: 0xcfd6df, secondary: 0x151c27, trim: 0x7dd3fc },
    topSpeed: 7.6,
    accel: 9,
    grip: 7,
    drift: 5,
    spGain: 7,
    weight: 6,
    specialBias: ["turbo", "rocket", "shield"],
    gimmick: vehicleGimmicks.evSurge
  },
  {
    id: "vmw-3e0i",
    name: "VMW 3e0i",
    role: "스포츠 세단 / 깔끔한 라인",
    description: "검은 차체처럼 차분하게 라인을 파고드는 세단입니다. 그립과 드리프트가 모두 안정적입니다.",
    sprite: vmw3e0iSprite,
    bodyType: "sedan",
    raceSpriteWidth: 92,
    colors: { primary: 0x151515, secondary: 0x2f3945, trim: 0x3b82f6 },
    topSpeed: 7.4,
    accel: 7,
    grip: 8,
    drift: 7,
    spGain: 6,
    weight: 5,
    specialBias: ["turbo", "lineDisrupt", "smoke"],
    gimmick: vehicleGimmicks.apexLine
  },
  {
    id: "bench-bargainsale",
    name: "벤치 바겐세일",
    role: "박스형 럭셔리 SUV / 방어 탱커",
    description: "큰 덩치와 높은 중량으로 방해를 버티는 타입입니다. 속도보다 버티고 밀어붙이는 힘이 좋습니다.",
    sprite: benchBargainsaleSprite,
    bodyType: "suv",
    raceSpriteWidth: 94,
    colors: { primary: 0x12395f, secondary: 0x07111c, trim: 0xd8dee9 },
    topSpeed: 6.8,
    accel: 6,
    grip: 7,
    drift: 4,
    spGain: 7,
    weight: 9,
    specialBias: ["shield", "smoke", "banana"],
    gimmick: vehicleGimmicks.bodyBlock
  },
  {
    id: "range-rover-defense",
    name: "레인지로버 디펜스",
    role: "오프로더 / 험로 그립",
    description: "거친 코스에서 흔들림이 적은 방어형 SUV입니다. 코너 진입이 안정적이고 실수가 적습니다.",
    sprite: rangeRoverDefenseSprite,
    bodyType: "suv",
    raceSpriteWidth: 94,
    colors: { primary: 0xb59f6b, secondary: 0x0f1720, trim: 0x7ee081 },
    topSpeed: 6.9,
    accel: 6,
    grip: 9,
    drift: 5,
    spGain: 7,
    weight: 8,
    specialBias: ["shield", "smoke", "lineDisrupt"],
    gimmick: vehicleGimmicks.offroadGuard
  },
  {
    id: "genesimpson-zv80",
    name: "제네심슨 ZV80",
    role: "프리미엄 SUV / 묵직한 추월",
    description: "넓은 차체와 안정적인 접지로 추월 타이밍을 길게 가져가는 SUV입니다.",
    sprite: genesimpsonZv80Sprite,
    bodyType: "suv",
    raceSpriteWidth: 94,
    colors: { primary: 0xf5f7fa, secondary: 0x111820, trim: 0xc9a86a },
    topSpeed: 7.2,
    accel: 7,
    grip: 8,
    drift: 5,
    spGain: 8,
    weight: 8,
    specialBias: ["turbo", "shield", "lineDisrupt"],
    gimmick: vehicleGimmicks.luxuryShield
  },
  {
    id: "link-nautilus",
    name: "링크 노틸러스",
    role: "크루저 SUV / 코너 안정",
    description: "차분한 가속과 높은 그립으로 길게 도는 코너에서 페이스를 잃지 않는 안정형 차량입니다.",
    sprite: linkNautilusSprite,
    bodyType: "crossover",
    raceSpriteWidth: 94,
    colors: { primary: 0xdce4ee, secondary: 0x111820, trim: 0xa7b2c3 },
    topSpeed: 7.1,
    accel: 6,
    grip: 8,
    drift: 6,
    spGain: 7,
    weight: 7,
    specialBias: ["shield", "turbo", "banana"],
    gimmick: vehicleGimmicks.balancedDraft
  },
  {
    id: "porsche-119",
    name: "포르쉐 119",
    role: "스포츠 쿠페 / 고속 돌격",
    description: "낮은 차체와 높은 최고속으로 직선에서 빠르게 차이를 벌리는 고속 어태커입니다.",
    sprite: porsche119Sprite,
    bodyType: "sports",
    raceSpriteWidth: 92,
    colors: { primary: 0xcbd5e1, secondary: 0x111820, trim: 0xc0842e },
    topSpeed: 9,
    accel: 8,
    grip: 7,
    drift: 6,
    spGain: 5,
    weight: 5,
    specialBias: ["rocket", "turbo", "lineDisrupt"],
    gimmick: vehicleGimmicks.straightBurst
  },
  {
    id: "ouya-r8",
    name: "어우야 알8",
    role: "트랙 머신 / 최고속 추월",
    description: "강한 다운포스와 높은 최고속을 가진 레이스형 쿠페입니다. 아이템 한 번이면 선두권까지 파고듭니다.",
    sprite: ouyaR8Sprite,
    bodyType: "sports",
    raceSpriteWidth: 94,
    colors: { primary: 0xe8eef2, secondary: 0x0a0d12, trim: 0xf97316 },
    topSpeed: 9.2,
    accel: 8,
    grip: 8,
    drift: 5,
    spGain: 5,
    weight: 5,
    specialBias: ["rocket", "turbo", "smoke"],
    gimmick: vehicleGimmicks.straightBurst
  },
  {
    id: "ferrari-f-plus",
    name: "훼라리 F+",
    role: "하이퍼카 / 스퍼트 폭발",
    description: "가볍고 빠른 빨간 하이퍼카입니다. 그립은 예민하지만, 터보 구간의 폭발력이 가장 강합니다.",
    sprite: ferrariFPlusSprite,
    bodyType: "hypercar",
    raceSpriteWidth: 94,
    colors: { primary: 0xf51d1d, secondary: 0x101014, trim: 0xffd166 },
    topSpeed: 9.4,
    accel: 9,
    grip: 6,
    drift: 6,
    spGain: 5,
    weight: 4,
    specialBias: ["turbo", "rocket", "lineDisrupt"],
    gimmick: vehicleGimmicks.hyperOverheat
  },
  {
    id: "lee-changju-rickshaw",
    name: "이창주 인력거",
    role: "초경량 인력거 / 코너 재주꾼",
    description: "최고속은 낮지만 방향 전환이 민첩하고 SP가 빨리 차오릅니다. 혼전에서 뜻밖의 변수를 만듭니다.",
    sprite: leeChangjuRickshawSprite,
    bodyType: "rickshaw",
    raceSpriteWidth: 74,
    colors: { primary: 0xb91c1c, secondary: 0x111111, trim: 0xf5d48b },
    topSpeed: 4.6,
    accel: 7,
    grip: 8,
    drift: 9,
    spGain: 10,
    weight: 2,
    specialBias: ["banana", "smoke", "lineDisrupt"],
    gimmick: vehicleGimmicks.alleyShortcut
  },
  {
    id: "country-maibahu",
    name: "컨트리 마이바후",
    role: "시골 트랙터 / 방해 전문",
    description: "느리지만 끈질긴 트랙터입니다. 무게와 방해 아이템으로 뒤쪽 그룹을 크게 흔듭니다.",
    sprite: countryMaibahuSprite,
    bodyType: "tractor",
    raceSpriteWidth: 86,
    colors: { primary: 0xc2410c, secondary: 0x3b2417, trim: 0xfacc15 },
    topSpeed: 4.8,
    accel: 5,
    grip: 6,
    drift: 4,
    spGain: 9,
    weight: 10,
    specialBias: ["banana", "smoke", "shield"],
    gimmick: vehicleGimmicks.farmShortcut
  },
  {
    id: "baemin",
    name: "배달의민족",
    role: "전동 킥보드 / SP 회전",
    description: "차폭이 작고 민첩해 코너를 잘 빠져나갑니다. SP 회전율로 아이템 싸움에 강합니다.",
    sprite: baeminSprite,
    bodyType: "scooter",
    raceSpriteWidth: 54,
    colors: { primary: 0x111111, secondary: 0xf8fafc, trim: 0xf59e0b },
    topSpeed: 5.8,
    accel: 9,
    grip: 7,
    drift: 8,
    spGain: 10,
    weight: 1,
    specialBias: ["turbo", "banana", "smoke"],
    gimmick: vehicleGimmicks.courierDash
  }
];

export function getCar(carId: string): CarSpec {
  return cars.find((car) => car.id === carId) ?? cars[0];
}
