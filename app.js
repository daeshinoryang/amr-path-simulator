/**
 * 물류 AMR 시뮬레이터 메인 컨트롤러
 * 
 * - 카메라 상태 패널 (TorWIC-SLAM 듀얼 프레임 시각화)
 * - 관측 사례 재생 (48.5% 관측값 기반 재확인 필요 판정 및 대기 d 반영 경로 이동)
 * - MATLAB AI 예측 재생 (검증된 JSON 연결 시에만 예측 확률/경고 사용, 단계별 공개)
 * - 임의의 출발점/목적지 간 최소시간 경로 탐색 (Dijkstra / 가중치 그래프)
 */

import { calculateRoutes, findShortestTimePath, WAREHOUSE_GRAPH } from './graph.js';
import { WarehouseScene } from './scene.js';
import { AMRSimulator } from './simulator.js';
import { AIPlayer } from './ai-player.js';
import { CameraStatusView } from './camera-view.js';

class App {
  constructor() {
    this.scene = null;
    this.simulator = null;
    this.aiPlayer = null;
    this.cameraView = null;

    // 현재 상태
    this.startNode = 'S';
    this.endNode = 'T';
    this.currentDelay = 0.0;
    this.selectedRouteId = 'A';
    this.selectedPathNodes = ['S', 'T'];
    this.isTie = false;
    this.tieUserChoice = 'A';
    this.currentMode = 'manual'; // 'manual' | 'observation' | 'ai'

    this.dom = {};
  }

  init() {
    this.cacheDOM();

    // 1. Three.js 창고 씬 초기화
    this.scene = new WarehouseScene(this.dom.threeContainer);

    // 2. AMR 시뮬레이터 주행 엔진 초기화
    this.simulator = new AMRSimulator(this.scene, {
      onTick: (data) => this.handleSimTick(data),
      onComplete: (data) => this.handleSimComplete(data),
      onStatusChange: (state, text) => this.handleSimStatusChange(state, text)
    });
    this.simulator.setSpeed(Number(this.dom.speedSelect.value) || 2.0);

    // 3. 카메라 상태 패널 뷰파인더 초기화 (요구사항 1)
    this.cameraView = new CameraStatusView(
      this.dom.canvasFrame1,
      this.dom.canvasFrame2,
      {
        valDeltaBrightness: this.dom.valDeltaBrightness,
        valRetentionPct: this.dom.valRetentionPct,
        valBrightness1: this.dom.valBrightness1,
        valBrightness2: this.dom.valBrightness2,
        badgeRecheckStatus: this.dom.badgeRecheckStatus,
      }
    );

    // 4. MATLAB AI 예측 플레이어 초기화 (요구사항 3)
    this.aiPlayer = new AIPlayer({
      onDataLoaded: (records, source) => this.handleAIDataLoaded(records, source),
      onRecordChange: (info) => this.handleAIRecordChange(info),
      onError: (errMsg) => this.handleAIError(errMsg)
    });

    // 5. 이벤트 리스너 등록
    this.bindEvents();

    // 6. 초기 경로 계산 (S -> T, d = 0)
    this.updateRouteState(0.0);
  }

  cacheDOM() {
    this.dom = {
      // 뷰포트 & 툴바
      threeContainer: document.getElementById('threeContainer'),
      btnToggleGraph: document.getElementById('btnToggleGraph'),
      btnResetView: document.getElementById('btnResetView'),
      selectStartNode: document.getElementById('selectStartNode'),
      selectEndNode: document.getElementById('selectEndNode'),
      btnPlayObservedCase: document.getElementById('btnPlayObservedCase'),
      speedSelect: document.getElementById('speedSelect'),
      hudRouteText: document.getElementById('hudRouteText'),
      hudStatusText: document.getElementById('hudStatusText'),
      hudDemoBadge: document.getElementById('hudDemoBadge'),
      hudDemoText: document.getElementById('hudDemoText'),

      // 재생 제어
      btnPlay: document.getElementById('btnPlay'),
      btnPlayIcon: document.getElementById('btnPlayIcon'),
      btnPlayText: document.getElementById('btnPlayText'),
      btnPause: document.getElementById('btnPause'),
      btnReset: document.getElementById('btnReset'),
      simCurrentTime: document.getElementById('simCurrentTime'),
      simTotalTime: document.getElementById('simTotalTime'),
      simProgressBar: document.getElementById('simProgressBar'),
      timelineStartLabel: document.getElementById('timelineStartLabel'),
      timelineEndLabel: document.getElementById('timelineEndLabel'),

      // 카메라 상태 패널
      canvasFrame1: document.getElementById('canvasFrame1'),
      canvasFrame2: document.getElementById('canvasFrame2'),
      valBrightness1: document.getElementById('valBrightness1'),
      valBrightness2: document.getElementById('valBrightness2'),
      valDeltaBrightness: document.getElementById('valDeltaBrightness'),
      valRetentionPct: document.getElementById('valRetentionPct'),
      badgeRecheckStatus: document.getElementById('badgeRecheckStatus'),
      btnTriggerObservation: document.getElementById('btnTriggerObservation'),

      // 비교 카드 & 결과
      cardRouteA: document.getElementById('cardRouteA'),
      cardRouteB: document.getElementById('cardRouteB'),
      timeAVal: document.getElementById('timeAVal'),
      timeBVal: document.getElementById('timeBVal'),
      distAVal: document.getElementById('distAVal'),
      distBVal: document.getElementById('distBVal'),
      driveAVal: document.getElementById('driveAVal'),
      driveBVal: document.getElementById('driveBVal'),
      turnAVal: document.getElementById('turnAVal'),
      turnBVal: document.getElementById('turnBVal'),
      cardWaitA: document.getElementById('cardWaitA'),
      decisionBadge: document.getElementById('decisionBadge'),
      tieSelectorBar: document.getElementById('tieSelectorBar'),
      tieRadios: document.querySelectorAll('input[name="tieRouteSelect"]'),
      decisionBanner: document.getElementById('decisionBanner'),
      decisionBannerText: document.getElementById('decisionBannerText'),

      // 슬라이더 & 프리셋
      delaySlider: document.getElementById('delaySlider'),
      sliderValDisplay: document.getElementById('sliderValDisplay'),
      presetButtons: document.querySelectorAll('.btn-preset'),
      systemModeLabel: document.getElementById('systemModeLabel'),

      // AI 예측 연동
      aiStatusPill: document.getElementById('aiStatusPill'),
      fileInputJSON: document.getElementById('fileInputJSON'),
      btnLoadSampleJSON: document.getElementById('btnLoadSampleJSON'),
      aiNoticeBox: document.getElementById('aiNoticeBox'),
      aiPlaybackPanel: document.getElementById('aiPlaybackPanel'),
      recCurrentIdx: document.getElementById('recCurrentIdx'),
      recTotalCount: document.getElementById('recTotalCount'),
      recNote: document.getElementById('recNote'),
      btnPrevRec: document.getElementById('btnPrevRec'),
      btnNextRec: document.getElementById('btnNextRec'),
      pillDecisionTime: document.getElementById('pillDecisionTime'),
      pillTargetTime: document.getElementById('pillTargetTime'),
      valDecisionTime: document.getElementById('valDecisionTime'),
      valTargetTime: document.getElementById('valTargetTime'),
      valRiskProb: document.getElementById('valRiskProb'),
      badgeWarning: document.getElementById('badgeWarning'),
      valActualRetention: document.getElementById('valActualRetention'),
      btnStepPredict: document.getElementById('btnStepPredict'),
      btnStepReveal: document.getElementById('btnStepReveal'),
    };
  }

  bindEvents() {
    // 1. 슬라이더 조작
    this.dom.delaySlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      this.onDelayChanged(val);
    });

    // 2. 프리셋 버튼 클릭 (0초, 3초, 5초)
    this.dom.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.val);
        this.dom.delaySlider.value = val;
        this.onDelayChanged(val);
      });
    });

    // 3. 출발점 / 목적지 노드 변경 (요구사항 4)
    this.dom.selectStartNode.addEventListener('change', (e) => {
      this.startNode = e.target.value;
      if (this.startNode === this.endNode) {
        // 출발점과 목적지가 같으면 다른 노드로 자동 조정
        this.endNode = (this.startNode === 'T') ? 'S' : 'T';
        this.dom.selectEndNode.value = this.endNode;
      }
      this.onNodesChanged();
    });

    this.dom.selectEndNode.addEventListener('change', (e) => {
      this.endNode = e.target.value;
      if (this.startNode === this.endNode) {
        this.startNode = (this.endNode === 'S') ? 'T' : 'S';
        this.dom.selectStartNode.value = this.startNode;
      }
      this.onNodesChanged();
    });

    // 4. 관측 사례 재생 버튼들 (요구사항 2)
    this.dom.btnPlayObservedCase.addEventListener('click', () => this.triggerObservedCasePlayback());
    this.dom.btnTriggerObservation.addEventListener('click', () => this.triggerObservedCasePlayback());

    // 5. 동률 시 라디오 선택
    this.dom.tieRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.tieUserChoice = e.target.value;
          this.applyRouteSelection();
        }
      });
    });

    // 6. 주행 재생 제어
    this.dom.btnPlay.addEventListener('click', () => this.simulator.start());
    this.dom.btnPause.addEventListener('click', () => this.simulator.togglePause());
    this.dom.btnReset.addEventListener('click', () => this.simulator.reset());
    this.dom.speedSelect.addEventListener('change', (e) => {
      this.simulator.setSpeed(Number(e.target.value) || 2.0);
    });

    // 7. 툴바 기능
    this.dom.btnToggleGraph.addEventListener('click', () => {
      const active = this.dom.btnToggleGraph.classList.toggle('active');
      this.scene.setGraphVisibility(active);
    });
    this.dom.btnResetView.addEventListener('click', () => this.scene.resetCamera());

    // 8. AI 모드 파일 로드 및 재생
    this.dom.fileInputJSON.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.aiPlayer.loadFromJSONString(event.target.result, file.name);
        };
        reader.readAsText(file);
      }
    });

    this.dom.btnLoadSampleJSON.addEventListener('click', () => {
      this.aiPlayer.loadFromURL('./data/predictions.json');
    });

    this.dom.btnPrevRec.addEventListener('click', () => this.aiPlayer.prevRecord());
    this.dom.btnNextRec.addEventListener('click', () => this.aiPlayer.nextRecord());
    this.dom.btnStepPredict.addEventListener('click', () => this.aiPlayer.showDecisionOnly());
    this.dom.btnStepReveal.addEventListener('click', () => this.aiPlayer.revealActual());
  }

  onNodesChanged() {
    this.scene.updateStartEndMarkers(this.startNode, this.endNode);
    this.dom.timelineStartLabel.textContent = `${this.startNode} (${WAREHOUSE_GRAPH.vertices[this.startNode].x},${WAREHOUSE_GRAPH.vertices[this.startNode].y})`;
    this.dom.timelineEndLabel.textContent = `${this.endNode} (${WAREHOUSE_GRAPH.vertices[this.endNode].x},${WAREHOUSE_GRAPH.vertices[this.endNode].y})`;

    this.simulator.reset();
    this.updateRouteState(this.currentDelay);
  }

  onDelayChanged(delaySec) {
    this.currentDelay = delaySec;
    this.dom.sliderValDisplay.textContent = delaySec.toFixed(1);

    this.dom.presetButtons.forEach(btn => {
      const val = parseFloat(btn.dataset.val);
      if (Math.abs(val - delaySec) < 0.05) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    this.simulator.reset();
    this.updateRouteState(delaySec);
  }

  /**
   * [요구사항 2] 관측 사례 재생 (48.5% 관측값 기반 규칙 시연)
   */
  triggerObservedCasePlayback() {
    this.currentMode = 'observation';

    // 1. 상단 모드 및 HUD 뱃지 업데이트
    this.dom.systemModeLabel.textContent = '관측값 기반 규칙 시연 (TorWIC-SLAM 48.5%)';
    this.dom.hudDemoBadge.style.display = 'flex';
    this.dom.hudDemoText.textContent = '관측값 기반 규칙 시연';

    // 2. 출발점 S, 목적지 T로 정렬
    this.startNode = 'S';
    this.endNode = 'T';
    this.dom.selectStartNode.value = 'S';
    this.dom.selectEndNode.value = 'T';
    this.scene.updateStartEndMarkers('S', 'T');

    // 3. 카메라 상태 패널을 48.5% 관측 사례로 갱신
    this.cameraView.setCaseData({
      t1: 96.39,
      t2: 96.49,
      brightness1: 0.4512,
      brightness2: 0.4713,
      deltaBrightness: 0.0201,
      retentionPct: 48.5,
      isRecheckRequired: true
    });

    // 4. 직진 통로에 현재 설정된 재확인 대기 d 적용하여 경로 재계산
    this.updateRouteState(this.currentDelay);

    // 5. 판정 배너에 시연 안내 추가
    const isDetour = (this.selectedRouteId === 'B');
    this.dom.decisionBannerText.innerHTML = `<strong>[관측값 기반 규칙 시연]</strong> 유지율 48.5% &lt; 90%로 재확인 대기(d=${this.currentDelay.toFixed(1)}초) 발생 → ` +
      (isDetour ? `<strong>우회 경로 B 선택 (${this.simulator.totalDuration.toFixed(1)}초)</strong>` : `<strong>직진 경로 A 유지 (${this.simulator.totalDuration.toFixed(1)}초)</strong>`);

    // 6. AMR이 선택된 경로로 즉시 주행 시작!
    this.simulator.start();
  }

  /**
   * 경로 계산 및 UI / 3D 반영
   */
  updateRouteState(delaySec) {
    const isStandardST = (this.startNode === 'S' && this.endNode === 'T');

    if (isStandardST) {
      // 기본 S -> T 구간 A/B 비교
      const calc = calculateRoutes(delaySec);
      this.isTie = calc.isTie;
      this.currentDelay = calc.delaySec;

      this.dom.timeAVal.textContent = calc.routeA.totalTime.toFixed(1);
      this.dom.timeBVal.textContent = calc.routeB.totalTime.toFixed(1);
      this.dom.distAVal.textContent = `${calc.routeA.distance} m`;
      this.dom.distBVal.textContent = `${calc.routeB.distance} m`;
      this.dom.driveAVal.textContent = `${calc.routeA.driveTime.toFixed(1)} 초`;
      this.dom.driveBVal.textContent = `${calc.routeB.driveTime.toFixed(1)} 초`;
      this.dom.turnAVal.textContent = `${calc.routeA.turnCount}회 / ${calc.routeA.turnTime.toFixed(1)} 초`;
      this.dom.turnBVal.textContent = `${calc.routeB.turnCount}회 / ${calc.routeB.turnTime.toFixed(1)} 초`;
      this.dom.cardWaitA.textContent = `+${calc.delaySec.toFixed(1)} 초`;

      if (calc.isTie) {
        this.dom.tieSelectorBar.style.display = 'flex';
        this.dom.cardRouteA.className = 'route-card tie-state';
        this.dom.cardRouteB.className = 'route-card tie-state';
        this.dom.decisionBadge.textContent = '소요 시간 동률';
        this.dom.decisionBadge.style.color = 'var(--accent-green)';

        this.dom.decisionBanner.className = 'decision-result-banner banner-tie';
        this.dom.decisionBannerText.innerHTML = `<strong>동률 발생 (15.0초):</strong> 직진 경로와 우회 경로의 소요 시간이 같습니다.`;

        this.selectedRouteId = this.tieUserChoice;
        this.selectedPathNodes = (this.tieUserChoice === 'A') ? ['S', 'T'] : ['S', 'U', 'V', 'T'];
      } else if (calc.optimalRoute === 'A') {
        this.dom.tieSelectorBar.style.display = 'none';
        this.dom.cardRouteA.className = 'route-card selected';
        this.dom.cardRouteB.className = 'route-card';
        this.dom.decisionBadge.textContent = 'A 최적 (직진)';
        this.dom.decisionBadge.style.color = 'var(--accent-cyan)';

        this.dom.decisionBanner.className = 'decision-result-banner';
        this.dom.decisionBannerText.innerHTML = `<strong>직진 경로 A 최적:</strong> 우회로보다 ${(15.0 - calc.routeA.totalTime).toFixed(1)}초 더 빠릅니다.`;

        this.selectedRouteId = 'A';
        this.selectedPathNodes = ['S', 'T'];
      } else {
        this.dom.tieSelectorBar.style.display = 'none';
        this.dom.cardRouteA.className = 'route-card';
        this.dom.cardRouteB.className = 'route-card selected-b';
        this.dom.decisionBadge.textContent = 'B 최적 (우회)';
        this.dom.decisionBadge.style.color = 'var(--accent-orange)';

        this.dom.decisionBanner.className = 'decision-result-banner banner-b';
        this.dom.decisionBannerText.innerHTML = `<strong>우회 경로 B 최적:</strong> 대기 지연으로 인해 우회가 ${(calc.routeA.totalTime - 15.0).toFixed(1)}초 더 빠릅니다.`;

        this.selectedRouteId = 'B';
        this.selectedPathNodes = ['S', 'U', 'V', 'T'];
      }

      this.applyRouteSelection(calc.routeA.totalTime);

    } else {
      // 임의의 출발점/목적지 간 최소시간 경로 탐색 (요구사항 4)
      const searchRes = findShortestTimePath(this.startNode, this.endNode, delaySec);
      this.dom.tieSelectorBar.style.display = 'none';

      if (searchRes.optimalPaths.length > 0) {
        const best = searchRes.optimalPaths[0];
        this.selectedPathNodes = best.path;
        this.selectedRouteId = 'CUSTOM';

        this.dom.decisionBadge.textContent = `최적: ${best.path.join(' → ')}`;
        this.dom.decisionBadge.style.color = 'var(--accent-cyan)';

        this.dom.decisionBanner.className = 'decision-result-banner';
        this.dom.decisionBannerText.innerHTML = `<strong>${this.startNode} → ${this.endNode} 최소시간 경로:</strong> [${best.path.join(' → ')}] | 거리 ${best.distance}m | 예상 소요시간 <strong>${best.totalTime.toFixed(1)}초</strong>`;

        this.scene.updateRouteHighlight('CUSTOM', false, delaySec, best.totalTime, best.path);
        this.simulator.setCustomPath(best.path, delaySec);

        this.dom.hudRouteText.textContent = `탐색 경로: ${best.path.join(' → ')}`;
        this.dom.hudRouteText.className = 'badge-a';
        this.dom.simTotalTime.textContent = this.simulator.totalDuration.toFixed(1);
      }
    }
  }

  applyRouteSelection(totalTimeA = null) {
    const calc = calculateRoutes(this.currentDelay);
    const activeRouteId = this.isTie ? this.tieUserChoice : this.selectedRouteId;
    const timeA = totalTimeA ?? calc.routeA.totalTime;

    this.scene.updateRouteHighlight(activeRouteId, this.isTie, this.currentDelay, timeA);
    this.simulator.setRoute(activeRouteId, this.currentDelay);

    if (this.isTie) {
      this.dom.hudRouteText.textContent = `[동률] 시연: 경로 ${activeRouteId} (${activeRouteId === 'A' ? '직진 S→T' : '우회 S→U→V→T'})`;
      this.dom.hudRouteText.className = activeRouteId === 'A' ? 'badge-a' : 'badge-b';
    } else if (activeRouteId === 'A') {
      this.dom.hudRouteText.textContent = '경로 A (직진 S → T)';
      this.dom.hudRouteText.className = 'badge-a';
    } else {
      this.dom.hudRouteText.textContent = '경로 B (우회 S → U → V → T)';
      this.dom.hudRouteText.className = 'badge-b';
    }

    this.dom.simTotalTime.textContent = this.simulator.totalDuration.toFixed(1);
  }

  // --- 시뮬레이터 콜백 처리 ---

  handleSimTick(data) {
    this.dom.simCurrentTime.textContent = data.currentTime.toFixed(1);
    this.dom.simProgressBar.style.width = `${(data.progress * 100).toFixed(1)}%`;
    this.dom.hudStatusText.textContent = data.segmentName || '주행 중';
  }

  handleSimComplete(data) {
    this.dom.hudStatusText.textContent = `도착 완료 (${data.totalDuration.toFixed(1)}초 소요)`;
    this.dom.btnPlayIcon.textContent = '▶';
    this.dom.btnPlayText.textContent = '다시 주행';
  }

  handleSimStatusChange(state, text) {
    if (state === 'running') {
      this.dom.btnPlayIcon.textContent = '▶';
      this.dom.btnPlayText.textContent = '주행 중';
      this.dom.btnPause.textContent = '⏸ 일시정지';
    } else if (state === 'paused') {
      this.dom.btnPause.textContent = '▶ 계속';
    } else if (state === 'ready') {
      this.dom.btnPlayIcon.textContent = '▶';
      this.dom.btnPlayText.textContent = '주행 시작';
      this.dom.btnPause.textContent = '⏸ 일시정지';
      this.dom.simProgressBar.style.width = '0%';
      this.dom.simCurrentTime.textContent = '0.0';
    }
  }

  // --- [요구사항 3] MATLAB AI 예측 연동 콜백 처리 ---

  handleAIDataLoaded(records, source) {
    this.currentMode = 'ai';
    this.dom.systemModeLabel.textContent = `AI 예측 재생 모드 (${source})`;
    this.dom.aiStatusPill.textContent = 'AI 예측 연결됨';
    this.dom.aiStatusPill.style.color = 'var(--accent-cyan)';
    this.dom.aiNoticeBox.className = 'ai-status-message';
    this.dom.aiNoticeBox.innerHTML = `✅ <strong>${records.length}개</strong>의 MATLAB 검증 예측 레코드가 로드되었습니다.`;
    this.dom.aiPlaybackPanel.style.display = 'block';
  }

  handleAIRecordChange(info) {
    const { record, index, total, phase, hasWarning } = info;

    this.dom.recCurrentIdx.textContent = index + 1;
    this.dom.recTotalCount.textContent = total;
    this.dom.recNote.textContent = record.note ? `• ${record.note}` : '';

    this.dom.valDecisionTime.textContent = record.decision_time_s.toFixed(2);
    this.dom.valTargetTime.textContent = record.target_time_s.toFixed(2);
    this.dom.valRiskProb.textContent = `${(record.risk_probability * 100).toFixed(1)}%`;

    // 경고 뱃지
    if (record.warning) {
      this.dom.badgeWarning.className = 'warning-indicator warn-true';
      this.dom.badgeWarning.textContent = '⚠️ WARNING (추적 불안정 경고)';
    } else {
      this.dom.badgeWarning.className = 'warning-indicator warn-false';
      this.dom.badgeWarning.textContent = '🟢 NORMAL (정상 주행)';
    }

    // 단계별 공개: 1단계(예측) vs 2단계(실제 결과 공개)
    if (phase === 'decision') {
      this.dom.pillDecisionTime.classList.add('active');
      this.dom.pillTargetTime.classList.remove('active');
      this.dom.valActualRetention.className = 'retention-hidden';
      this.dom.valActualRetention.textContent = '(검증 대기 중...)';
      this.dom.btnStepPredict.classList.add('btn-primary');
      this.dom.btnStepPredict.classList.remove('btn-secondary');
      this.dom.btnStepReveal.classList.add('btn-secondary');
      this.dom.btnStepReveal.classList.remove('btn-primary');
    } else {
      this.dom.pillDecisionTime.classList.remove('active');
      this.dom.pillTargetTime.classList.add('active');
      this.dom.valActualRetention.className = 'retention-revealed';
      this.dom.valActualRetention.textContent = `${record.actual_retention_pct.toFixed(1)}%`;
      this.dom.btnStepPredict.classList.remove('btn-primary');
      this.dom.btnStepPredict.classList.add('btn-secondary');
      this.dom.btnStepReveal.classList.remove('btn-secondary');
      this.dom.btnStepReveal.classList.add('btn-primary');
    }

    // 카메라 뷰파인더도 해당 레코드 값에 맞춰 업데이트
    this.cameraView.setCaseData({
      t1: record.decision_time_s,
      t2: record.target_time_s,
      retentionPct: (phase === 'target') ? record.actual_retention_pct : 48.5,
      isRecheckRequired: record.warning
    });

    // MATLAB 예측 경고 여부로 직진 통로 대기 d 반영 및 경로 계산
    const effectiveDelay = hasWarning ? parseFloat(this.dom.delaySlider.value) : 0.0;
    this.updateRouteState(effectiveDelay);

    // 배너 갱신
    if (hasWarning) {
      this.dom.decisionBannerText.innerHTML += ` <span style="color: var(--accent-red); font-size: 0.72rem;">[AI 경고: 직진 통로 대기 ${effectiveDelay.toFixed(1)}초 적용]</span>`;
    } else {
      this.dom.decisionBannerText.innerHTML += ` <span style="color: var(--accent-green); font-size: 0.72rem;">[AI 정상: 추가 대기 0.0초 적용]</span>`;
    }
  }

  handleAIError(errMsg) {
    this.dom.aiNoticeBox.className = 'ai-status-message error';
    this.dom.aiNoticeBox.textContent = `❌ ${errMsg} (수동 시뮬레이션 모드를 계속 사용합니다)`;
    this.currentMode = 'manual';
    this.dom.systemModeLabel.textContent = '수동 시뮬레이션 모드';
    this.dom.aiStatusPill.textContent = 'AI 검증 결과 미연결';
    this.dom.aiStatusPill.style.color = 'var(--text-subtle)';
  }
}

// 애플리케이션 시작
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
