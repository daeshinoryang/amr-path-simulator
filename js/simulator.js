/**
 * AMR 시뮬레이터 주행 엔진
 * 
 * - 정점 간 경로를 받아 이동(1m/s), 회전(90도당 0.5s), 대기(d초)를 보간 시뮬레이션
 * - 경로 A (S->T): S에서 d초 재확인 대기 후 직진 주행 (총 12+d초)
 * - 경로 B (S->U->V->T): S->U(1s) -> U 90도 회전(0.5s) -> U->V(12s) -> V 90도 회전(0.5s) -> V->T(1s) (총 15s)
 * - 임의의 출발점/목적지 경로도 동적 세그먼트 생성으로 완벽 지원
 */

import { WAREHOUSE_GRAPH } from './graph.js';

// Three.js 3D 공간 상의 정점 좌표 매핑 (x, y=0, z)
const VERTEX_POS_3D = {
  S: { x: 0, y: 0, z: 0 },
  T: { x: 12, y: 0, z: 0 },
  U: { x: 0, y: 0, z: 1 },
  V: { x: 12, y: 0, z: 1 },
};

function getHeadingYaw(fromPos, toPos) {
  const dx = toPos.x - fromPos.x;
  const dz = toPos.z - fromPos.z;
  // Three.js 좌표계: +X가 0 rad, +Z가 -pi/2 rad
  return -Math.atan2(dz, dx);
}

export class AMRSimulator {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks; // onTick, onComplete, onStatusChange

    this.routeId = 'A';
    this.pathNodes = ['S', 'T'];
    this.delaySec = 0;
    this.playbackSpeed = 1.0;

    this.isRunning = false;
    this.isPaused = false;
    this.elapsedTime = 0;
    this.totalDuration = 12.0;

    this.lastFrameTime = null;
    this.animationId = null;

    this.timelineSegments = [];
    this.setupSegments();
    this.reset();
  }

  setRoute(routeId, delaySec) {
    this.routeId = routeId;
    this.delaySec = Math.max(0, Number(delaySec) || 0);
    this.pathNodes = (routeId === 'B') ? ['S', 'U', 'V', 'T'] : ['S', 'T'];
    this.setupSegments();
    this.reset();
  }

  setCustomPath(pathNodes, delaySec = 0) {
    this.pathNodes = pathNodes && pathNodes.length >= 2 ? pathNodes : ['S', 'T'];
    this.delaySec = Math.max(0, Number(delaySec) || 0);
    this.routeId = (this.pathNodes.join('-') === 'S-U-V-T') ? 'B' : 'CUSTOM';
    this.setupSegments();
    this.reset();
  }

  setSpeed(speedMultiplier) {
    this.playbackSpeed = Math.max(0.25, Math.min(8.0, Number(speedMultiplier) || 1.0));
  }

  setupSegments() {
    this.timelineSegments = [];
    let curTime = 0;
    const nodes = this.pathNodes;

    if (nodes.length < 2) return;

    // 첫 간선의 초기 방향
    const firstFrom = VERTEX_POS_3D[nodes[0]];
    const firstTo = VERTEX_POS_3D[nodes[1]];
    const initialYaw = getHeadingYaw(firstFrom, firstTo);

    let prevYaw = initialYaw;

    // 경로 상에 직진 통로(S-T)가 포함되어 있고 대기 시간 d > 0이면 출발점 또는 진입부에서 대기
    const hasDirectAisle = (nodes[0] === 'S' && nodes[1] === 'T') || 
                           (nodes.some((n, idx) => idx < nodes.length - 1 && 
                            ((n === 'S' && nodes[idx + 1] === 'T') || (n === 'T' && nodes[idx + 1] === 'S'))));

    if (hasDirectAisle && this.delaySec > 0.001) {
      this.timelineSegments.push({
        type: 'wait',
        name: `분기점 특징점 재확인 대기 (${this.delaySec.toFixed(1)}s)`,
        startTime: curTime,
        duration: this.delaySec,
        endTime: curTime + this.delaySec,
        posStart: { ...firstFrom },
        posEnd: { ...firstFrom },
        yawStart: initialYaw,
        yawEnd: initialYaw,
        ledState: 'waiting'
      });
      curTime += this.delaySec;
    }

    // 각 구간 주행 및 회전 세그먼트 생성
    for (let i = 0; i < nodes.length - 1; i++) {
      const fromId = nodes[i];
      const toId = nodes[i + 1];
      const pFrom = VERTEX_POS_3D[fromId];
      const pTo = VERTEX_POS_3D[toId];

      const segYaw = getHeadingYaw(pFrom, pTo);

      // 1. 회전이 필요한 경우 (코너 회전 세그먼트)
      if (i > 0) {
        let diffYaw = segYaw - prevYaw;
        // 각도 차이 정규화 (-PI ~ +PI)
        while (diffYaw > Math.PI) diffYaw -= 2 * Math.PI;
        while (diffYaw < -Math.PI) diffYaw += 2 * Math.PI;

        const absAngle = Math.abs(diffYaw);
        if (absAngle > 0.02) {
          // 90도당 0.5초 계산
          const turnDur = (absAngle / (Math.PI / 2)) * 0.5;
          this.timelineSegments.push({
            type: 'turn',
            name: `${fromId} 모서리 방향 전환 (${Math.round(absAngle * 180 / Math.PI)}°)`,
            startTime: curTime,
            duration: turnDur,
            endTime: curTime + turnDur,
            posStart: { ...pFrom },
            posEnd: { ...pFrom },
            yawStart: prevYaw,
            yawEnd: prevYaw + diffYaw,
            ledState: 'turning'
          });
          curTime += turnDur;
        }
      }

      // 2. 주행 세그먼트
      const dist = Math.hypot(pTo.x - pFrom.x, pTo.z - pFrom.z);
      const driveDur = dist / 1.0; // 1 m/s

      this.timelineSegments.push({
        type: 'drive',
        name: `${fromId} → ${toId} 구간 주행 (${dist.toFixed(1)}m)`,
        startTime: curTime,
        duration: driveDur,
        endTime: curTime + driveDur,
        posStart: { ...pFrom },
        posEnd: { ...pTo },
        yawStart: segYaw,
        yawEnd: segYaw,
        ledState: 'running'
      });
      curTime += driveDur;
      prevYaw = segYaw;
    }

    this.totalDuration = curTime;
  }

  start() {
    if (this.isRunning && !this.isPaused) return;

    if (this.isPaused) {
      this.isPaused = false;
      this.isRunning = true;
      this.lastFrameTime = performance.now();
      this.tick();
      if (this.callbacks.onStatusChange) {
        this.callbacks.onStatusChange('running', '주행 재개');
      }
      return;
    }

    this.reset();
    this.isRunning = true;
    this.isPaused = false;
    this.lastFrameTime = performance.now();
    this.tick();
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange('running', '주행 시작');
    }
  }

  pause() {
    if (!this.isRunning || this.isPaused) return;
    this.isPaused = true;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange('paused', '일시 정지');
    }
  }

  togglePause() {
    if (!this.isRunning) {
      this.start();
    } else if (this.isPaused) {
      this.start();
    } else {
      this.pause();
    }
  }

  reset() {
    this.isRunning = false;
    this.isPaused = false;
    this.elapsedTime = 0;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // 로봇 위치를 출발 노드로 리셋
    if (this.scene && this.scene.amrRobot && this.pathNodes.length >= 2) {
      const startPos = VERTEX_POS_3D[this.pathNodes[0]] || { x: 0, y: 0, z: 0 };
      const nextPos = VERTEX_POS_3D[this.pathNodes[1]] || { x: 12, y: 0, z: 0 };
      const initialYaw = getHeadingYaw(startPos, nextPos);

      this.scene.amrRobot.position.set(startPos.x, startPos.y, startPos.z);
      this.scene.amrRobot.rotation.y = initialYaw;
      this.scene.setRobotLED('idle');
    }

    if (this.callbacks.onTick) {
      this.callbacks.onTick({
        currentTime: 0,
        totalTime: this.totalDuration,
        progress: 0,
        segmentName: '대기 중 (출발 준비)',
        ledState: 'idle'
      });
    }

    if (this.callbacks.onStatusChange) {
      this.callbacks.onStatusChange('ready', '출발 대기');
    }
  }

  tick() {
    if (!this.isRunning || this.isPaused) return;

    const now = performance.now();
    const dt = ((now - this.lastFrameTime) / 1000) * this.playbackSpeed;
    this.lastFrameTime = now;

    this.elapsedTime += dt;

    if (this.elapsedTime >= this.totalDuration) {
      // 주행 완료
      this.elapsedTime = this.totalDuration;
      this.applyStateAtTime(this.elapsedTime);
      this.isRunning = false;
      this.isPaused = false;

      if (this.scene) {
        this.scene.setRobotLED('arrived');
      }

      if (this.callbacks.onTick) {
        this.callbacks.onTick({
          currentTime: this.totalDuration,
          totalTime: this.totalDuration,
          progress: 1.0,
          segmentName: `${this.pathNodes[this.pathNodes.length - 1]} 목적지 도착 완료`,
          ledState: 'arrived'
        });
      }

      if (this.callbacks.onComplete) {
        this.callbacks.onComplete({
          path: this.pathNodes,
          totalDuration: this.totalDuration
        });
      }

      if (this.callbacks.onStatusChange) {
        this.callbacks.onStatusChange('completed', '목적지 도착');
      }
      return;
    }

    const segment = this.applyStateAtTime(this.elapsedTime);

    if (this.callbacks.onTick) {
      const progress = Math.min(1.0, this.elapsedTime / this.totalDuration);
      this.callbacks.onTick({
        currentTime: this.elapsedTime,
        totalTime: this.totalDuration,
        progress,
        segmentName: segment ? segment.name : '주행 중',
        ledState: segment ? segment.ledState : 'running'
      });
    }

    this.animationId = requestAnimationFrame(() => this.tick());
  }

  applyStateAtTime(time) {
    if (!this.scene || !this.scene.amrRobot) return null;

    let activeSeg = this.timelineSegments[this.timelineSegments.length - 1];
    for (const seg of this.timelineSegments) {
      if (time >= seg.startTime && time <= seg.endTime) {
        activeSeg = seg;
        break;
      }
    }

    if (!activeSeg) return null;

    const segDuration = activeSeg.duration;
    const segElapsed = Math.max(0, Math.min(segDuration, time - activeSeg.startTime));
    const t = segDuration > 0 ? segElapsed / segDuration : 1.0;

    // 위치 선형 보간 (Lerp)
    const posX = activeSeg.posStart.x + (activeSeg.posEnd.x - activeSeg.posStart.x) * t;
    const posY = activeSeg.posStart.y + (activeSeg.posEnd.y - activeSeg.posStart.y) * t;
    const posZ = activeSeg.posStart.z + (activeSeg.posEnd.z - activeSeg.posStart.z) * t;

    // 회전각 보간
    const yaw = activeSeg.yawStart + (activeSeg.yawEnd - activeSeg.yawStart) * t;

    this.scene.amrRobot.position.set(posX, posY, posZ);
    this.scene.amrRobot.rotation.y = yaw;
    this.scene.setRobotLED(activeSeg.ledState);

    return activeSeg;
  }
}
