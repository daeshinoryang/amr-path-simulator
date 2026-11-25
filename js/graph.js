/**
 * 창고 그래프 모델 및 최소시간 경로 탐색 (이산수학 가중치 그래프)
 * 
 * 정점(Vertices) [단위: m]:
 *   S: (0, 0) - 출발점 및 분기점
 *   T: (12, 0) - 목적지
 *   U: (0, 1) - 우회로 제1 모서리
 *   V: (12, 1) - 우회로 제2 모서리
 * 
 * 통로(Edges):
 *   S - T: 12 m (직진 통로, 특징점 불안정 시 재확인 대기 d 적용)
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
  // 통로 인접 리스트
  adjacency: {
    S: [
      { to: 'T', distance: 12, isDirectAisle: true },
      { to: 'U', distance: 1, isDirectAisle: false }
    ],
    T: [
      { to: 'S', distance: 12, isDirectAisle: true },
      { to: 'V', distance: 1, isDirectAisle: false }
    ],
    U: [
      { to: 'S', distance: 1, isDirectAisle: false },
      { to: 'V', distance: 12, isDirectAisle: false }
    ],
    V: [
      { to: 'U', distance: 12, isDirectAisle: false },
      { to: 'T', distance: 1, isDirectAisle: false }
    ]
  },
  parameters: {
    linearSpeed: 1.0,        // 직진 주행 속도 (m/s)
    turn90Duration: 0.5,     // 90도 회전 시간 (초)
    breakEvenDelay: 3.0,     // 전환점 임계값 (초)
    tolerance: 0.0001,       // 부동소수점 오차 허용치
  }
};

/**
 * 정점 간 2D 유클리드 거리 및 방향 벡터 계산
 */
function getVector(fromNode, toNode) {
  const p1 = WAREHOUSE_GRAPH.vertices[fromNode];
  const p2 = WAREHOUSE_GRAPH.vertices[toNode];
  return { dx: p2.x - p1.x, dy: p2.y - p1.y };
}

/**
 * 두 벡터 사이의 회전 각도(radian) 및 회전 시간(초) 계산 (90도당 0.5초)
 */
function calculateTurnCost(v1, v2) {
  const len1 = Math.hypot(v1.dx, v1.dy);
  const len2 = Math.hypot(v2.dx, v2.dy);
  if (len1 === 0 || len2 === 0) return { angleDeg: 0, turnTime: 0 };

  const dot = v1.dx * v2.dx + v1.dy * v2.dy;
  const cosTheta = Math.max(-1, Math.min(1, dot / (len1 * len2)));
  const angleRad = Math.acos(cosTheta);
  const angleDeg = (angleRad * 180) / Math.PI;

  // 90도 = 0.5초 비례 계산
  const turnTime = (angleRad / (Math.PI / 2)) * WAREHOUSE_GRAPH.parameters.turn90Duration;
  return { angleDeg, turnTime };
}

/**
 * 주어진 경로(노드 시퀀스)의 거리, 주행시간, 회전시간, 대기시간, 총 소요시간을 계산합니다.
 */
export function evaluatePath(pathNodes, delaySec = 0) {
  const { linearSpeed } = WAREHOUSE_GRAPH.parameters;
  let distance = 0;
  let driveTime = 0;
  let turnTime = 0;
  let turnCount = 0;
  let waitTime = 0;

  for (let i = 0; i < pathNodes.length - 1; i++) {
    const from = pathNodes[i];
    const to = pathNodes[i + 1];

    // 이동 거리
    const edge = WAREHOUSE_GRAPH.adjacency[from]?.find(e => e.to === to);
    const dist = edge ? edge.distance : Math.hypot(
      WAREHOUSE_GRAPH.vertices[to].x - WAREHOUSE_GRAPH.vertices[from].x,
      WAREHOUSE_GRAPH.vertices[to].y - WAREHOUSE_GRAPH.vertices[from].y
    );
    distance += dist;

    // 직진 통로(S-T 구간) 포함 시 재확인 대기 부과
    if (edge && edge.isDirectAisle) {
      waitTime += delaySec;
    }

    // 회전 시간 (i >= 1 일 때 이전 진행 방향과 회전 계산)
    if (i >= 1) {
      const vPrev = getVector(pathNodes[i - 1], pathNodes[i]);
      const vNext = getVector(pathNodes[i], pathNodes[i + 1]);
      const { angleDeg, turnTime: tTurn } = calculateTurnCost(vPrev, vNext);
      if (angleDeg > 1.0) { // 1도 이상 방향 전환 시
        turnCount++;
        turnTime += tTurn;
      }
    }
  }

  driveTime = distance / linearSpeed;
  const totalTime = driveTime + turnTime + waitTime;

  return {
    path: pathNodes,
    distance,
    driveTime,
    turnCount,
    turnTime,
    waitTime,
    totalTime,
  };
}

/**
 * 출발점(startNode)에서 목적지(endNode)까지의 모든 단순 경로를 탐색하고,
 * 각 경로의 총 소요비용(이동+회전+대기)을 계산하여 최적 경로를 판정합니다.
 */
export function findShortestTimePath(startNode = 'S', endNode = 'T', delaySec = 0) {
  const d = Math.max(0, Number(delaySec) || 0);
  const allPaths = [];

  function dfs(curr, visited) {
    if (curr === endNode) {
      allPaths.push([...visited]);
      return;
    }
    const neighbors = WAREHOUSE_GRAPH.adjacency[curr] || [];
    for (const edge of neighbors) {
      if (!visited.includes(edge.to)) {
        visited.push(edge.to);
        dfs(edge.to, visited);
        visited.pop();
      }
    }
  }

  dfs(startNode, [startNode]);

  if (allPaths.length === 0) {
    return { optimalPaths: [], allEvaluations: [], statusMessage: '경로가 존재하지 않습니다.' };
  }

  const evaluations = allPaths.map(p => evaluatePath(p, d));
  evaluations.sort((a, b) => a.totalTime - b.totalTime);

  const minTime = evaluations[0].totalTime;
  const tolerance = WAREHOUSE_GRAPH.parameters.tolerance;
  const optimalPaths = evaluations.filter(e => Math.abs(e.totalTime - minTime) < tolerance);
  const isTie = optimalPaths.length > 1;

  return {
    startNode,
    endNode,
    delaySec: d,
    isTie,
    minTime,
    optimalPaths,
    allEvaluations: evaluations
  };
}

/**
 * 기존 인터페이스 호환: S -> T 경로 A(직진)와 B(우회) 비교 계산
 * @param {number} delaySec - 직진 통로 재확인 대기 (초)
 */
export function calculateRoutes(delaySec = 0) {
  const d = Math.max(0, Number(delaySec) || 0);
  const { breakEvenDelay, tolerance } = WAREHOUSE_GRAPH.parameters;

  const routeA = evaluatePath(['S', 'T'], d);
  routeA.id = 'A';
  routeA.name = '직진 경로 (S → T)';
  routeA.color = '#00d2ff';

  const routeB = evaluatePath(['S', 'U', 'V', 'T'], d);
  routeB.id = 'B';
  routeB.name = '우회 경로 (S → U → V → T)';
  routeB.color = '#ff9800';

  let optimalRoute = 'A';
  let isTie = false;
  let statusMessage = '';

  if (Math.abs(d - breakEvenDelay) < tolerance) {
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
    routeA,
    routeB
  };
}
