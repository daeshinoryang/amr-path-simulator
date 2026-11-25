/**
 * AMR 시뮬레이터 주행 엔진
 * 
 * - 경로 A: 분기점 S에서 d초 재확인 대기 후 S->T 12m 직진 (총 12+d초)
 * - 경로 B: S->U(1m, 1s) -> U 90도 회전(0.5s) -> U->V(12m, 12s) -> V 90도 회전(0.5s) -> V->T(1m, 1s) (총 15s)
 * - 속도: 1 m/s, 회전 시간: 0.5초
 */

export class AMRSimulator {
  constructor(scene, callbacks = {}) {
    this.scene = scene;
    this.callbacks = callbacks; // onTick, onComplete, onStatusChange

    this.routeId = 'A';
    this.delaySec = 0;
    this.playbackSpeed = 1.0;

    this.isRunning = false;
    this.isPaused = false;
    this.elapsedTime = 0; // 시뮬레이션 경과 시간 (초)
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
    this.setupSegments();
    this.reset();
  }

  setSpeed(speedMultiplier) {
    this.playbackSpeed = Math.max(0.25, Math.min(8.0, Number(speedMultiplier) || 1.0));
  }

  setupSegments() {
    this.timelineSegments = [];
    let curTime = 0;

    if (this.routeId === 'A') {
      // 1. 대기 구간 (S 지점)
      if (this.delaySec > 0.001) {
        this.timelineSegments.push({
          type: 'wait',
          name: '분기점 재확인 대기 (S)',
          startTime: curTime,
          duration: this.delaySec,
          endTime: curTime + this.delaySec,
          posStart: { x: 0, y: 0, z: 0 },
          posEnd: { x: 0, y: 0, z: 0 },
          yawStart: 0,
          yawEnd: 0,
          ledState: 'waiting'
        });
        curTime += this.delaySec;
      }

      // 2. 직진 주행 (S -> T: 12m)
      const driveDur = 12.0;
      this.timelineSegments.push({
        type: 'drive',
        name: '직진 주행 (S → T)',
        startTime: curTime,
        duration: driveDur,
        endTime: curTime + driveDur,
        posStart: { x: 0, y: 0, z: 0 },
        posEnd: { x: 12, y: 0, z: 0 },
        yawStart: 0,
        yawEnd: 0,
        ledState: 'running'
      });
      curTime += driveDur;

    } else {
      // 경로 B: S -> U -> V -> T (출발 시 첫 통로 +Z 향함)
      const yawSU = -Math.PI / 2; // +Z 방향
      const yawUV = 0;            // +X 방향
      const yawVT = Math.PI / 2;  // -Z 방향

      // 1. S -> U 주행 (1m, 1s)
      this.timelineSegments.push({
        type: 'drive',
        name: '우회로 진입 (S → U)',
        startTime: curTime,
        duration: 1.0,
        endTime: curTime + 1.0,
        posStart: { x: 0, y: 0, z: 0 },
        posEnd: { x: 0, y: 0, z: 1 },
        yawStart: yawSU,
        yawEnd: yawSU,
        ledState: 'running'
      });
      curTime += 1.0;

      // 2. U 모서리 90도 회전 (0.5s)
      this.timelineSegments.push({
        type: 'turn',
        name: 'U 모서리 90° 방향 전환',
        startTime: curTime,
        duration: 0.5,
        endTime: curTime + 0.5,
        posStart: { x: 0, y: 0, z: 1 },
        posEnd: { x: 0, y: 0, z: 1 },
        yawStart: yawSU,
        yawEnd: yawUV,
        ledState: 'turning'
      });
      curTime += 0.5;

      // 3. U -> V 주행 (12m, 12s)
      this.timelineSegments.push({
        type: 'drive',
        name: '우회 통로 주행 (U → V)',
        startTime: curTime,
        duration: 12.0,
        endTime: curTime + 12.0,
        posStart: { x: 0, y: 0, z: 1 },
        posEnd: { x: 12, y: 0, z: 1 },
        yawStart: yawUV,
        yawEnd: yawUV,
        ledState: 'running'
      });
      curTime += 12.0;

      // 4. V 모서리 90도 회전 (0.5s)
      this.timelineSegments.push({
        type: 'turn',
        name: 'V 모서리 90° 방향 전환',
        startTime: curTime,
        duration: 0.5,
        endTime: curTime + 0.5,
        posStart: { x: 12, y: 0, z: 1 },
        posEnd: { x: 12, y: 0, z: 1 },
        yawStart: yawUV,
        yawEnd: yawVT,
        ledState: 'turning'
      });
      curTime += 0.5;

      // 5. V -> T 주행 (1m, 1s)
      this.timelineSegments.push({
        type: 'drive',
        name: '목적지 진입 (V → T)',
        startTime: curTime,
        duration: 1.0,
        endTime: curTime + 1.0,
        posStart: { x: 12, y: 0, z: 1 },
        posEnd: { x: 12, y: 0, z: 0 },
        yawStart: yawVT,
        yawEnd: yawVT,
        ledState: 'running'
      });
      curTime += 1.0;
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
      this.start(); // resumes
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

    // 로봇 위치를 S(0,0,0) 및 초기 정렬 각도로 복원
    if (this.scene && this.scene.amrRobot) {
      this.scene.amrRobot.position.set(0, 0, 0);
      const initialYaw = (this.routeId === 'A') ? 0 : -Math.PI / 2;
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
          segmentName: '목적지 T 도착 완료',
          ledState: 'arrived'
        });
      }

      if (this.callbacks.onComplete) {
        this.callbacks.onComplete({
          routeId: this.routeId,
          totalDuration: this.totalDuration
        });
      }

      if (this.callbacks.onStatusChange) {
        this.callbacks.onStatusChange('completed', '목적지 도착');
      }
      return;
    }

    // 진행 상태 계산 및 로봇 반영
    const segment = this.applyStateAtTime(this.elapsedTime);

    if (this.callbacks.onTick) {
      const progress = Math.min(1.0, this.elapsedTime / this.totalDuration);
      this.callbacks.onTick({
        currentTime: this.elapsedTime,
        totalTime: this.totalDuration,
        progress,
        segmentName: segment ? segment.name : '',
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
