/**
 * MATLAB 검증 창고 그래프 모델 및 경로 계산 모듈
 * 
 * 정점(Vertices) [단위: m]:
 *   S: (0, 0) - 출발점 및 경로 분기점
 *   T: (12, 0) - 목적지
 *   U: (0, 1) - 우회로 제1 모서리
 *   V: (12, 1) - 우회로 제2 모서리
 * 
 * 통로(Edges):
 *   S - T: 12 m
 *   S - U: 1 m
 *   U - V: 12 m
 *   V - T: 1 m
 */

export const WAREHOUSE_GRAPH = {
  vertices: {
    S: { x: 0, y: 0, label: '출발점 (S)', desc: '분기점' },
    T: { x: 12, y: 0, label: '목적지 (T)', desc: '도착점' },
    U: { x: 0, y: 1, label: '우회 모서리 1 (U)', desc: '90° 회전' },
    V: { x: 12, y: 1, label: '우회 모서리 2 (V)', desc: '90° 회전' },
  },
  edges: [
    { from: 'S', to: 'T', distance: 12, type: 'direct' },
    { from: 'S', to: 'U', distance: 1, type: 'detour' },
    { from: 'U', to: 'V', distance: 12, type: 'detour' },
    { from: 'V', to: 'T', distance: 1, type: 'detour' },
  ],
  parameters: {
    linearSpeed: 1.0,        // 직진 주행 속도 (m/s)
    turn90Duration: 0.5,     // 90도 회전 시간 (초)
    breakEvenDelay: 3.0,     // 전환점 임계값 (초)
    tolerance: 0.0001,       // 부동소수점 오차 허용치
  }
};

/**
 * 두 경로(A: 직진, B: 우회)의 거리, 회전 시간, 대기 시간 및 총 소요 시간을 계산합니다.
 * @param {number} delaySec - 직진 경로(A)의 재확인 예상 대기 시간 (초, d >= 0)
 * @returns {Object} 경로별 세부 계산 결과 및 선택 판정
 */
export function calculateRoutes(delaySec = 0) {
  const d = Math.max(0, Number(delaySec) || 0);
  const { linearSpeed, turn90Duration, breakEvenDelay, tolerance } = WAREHOUSE_GRAPH.parameters;

  // 1. 경로 A (직진: S -> T)
  const distA = 12.0; // 12 m
  const driveTimeA = distA / linearSpeed; // 12.0 초
  const turnCountA = 0;
  const turnTimeA = turnCountA * turn90Duration; // 0.0 초
  const waitTimeA = d; // 재확인 예상 대기 d
  const totalTimeA = driveTimeA + turnTimeA + waitTimeA; // 12 + d 초

  // 2. 경로 B (우회: S -> U -> V -> T)
  // S->U (1m) + U->V (12m) + V->T (1m) = 14m
  const distB = 1.0 + 12.0 + 1.0; // 14.0 m
  const driveTimeB = distB / linearSpeed; // 14.0 초
  // U에서 90도 1회, V에서 90도 1회 = 총 2회 (출발 시 첫 통로 정렬 및 도착 후 정렬 제외)
  const turnCountB = 2;
  const turnTimeB = turnCountB * turn90Duration; // 1.0 초
  const waitTimeB = 0.0; // 우회로는 특징점 추적이 양호하다고 가정
  const totalTimeB = driveTimeB + turnTimeB + waitTimeB; // 15.0 초

  // 3. 판정 (Decision logic)
  // d < 3: A, d = 3: 동률(Tie), d > 3: B
  const diff = totalTimeA - totalTimeB;
  let optimalRoute = 'A';
  let isTie = false;
  let statusMessage = '';

  if (Math.abs(d - breakEvenDelay) < tolerance) {
    // 동률 상태 (d = 3초)
    optimalRoute = 'TIE';
    isTie = true;
    statusMessage = '소요 시간 동률 (15.0초) — 두 경로 모두 최적해';
  } else if (d < breakEvenDelay) {
    optimalRoute = 'A';
    isTie = false;
    statusMessage = `직진 경로 A 최적 (${(breakEvenDelay - d).toFixed(1)}초 더 빠름)`;
  } else {
    optimalRoute = 'B';
    isTie = false;
    statusMessage = `우회 경로 B 최적 (${(d - breakEvenDelay).toFixed(1)}초 더 빠름)`;
  }

  return {
    delaySec: d,
    breakEvenDelay,
    optimalRoute,
    isTie,
    statusMessage,
    routeA: {
      id: 'A',
      name: '직진 경로 (S → T)',
      path: ['S', 'T'],
      distance: distA,
      driveTime: driveTimeA,
      turnCount: turnCountA,
      turnTime: turnTimeA,
      waitTime: waitTimeA,
      totalTime: totalTimeA,
      color: '#00d2ff', // 테크 블루
    },
    routeB: {
      id: 'B',
      name: '우회 경로 (S → U → V → T)',
      path: ['S', 'U', 'V', 'T'],
      distance: distB,
      driveTime: driveTimeB,
      turnCount: turnCountB,
      turnTime: turnTimeB,
      waitTime: waitTimeB,
      totalTime: totalTimeB,
      color: '#ff9800', // 앰버 오렌지
    }
  };
}
