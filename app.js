/**
 * 물류 AMR 시뮬레이터 메인 컨트롤러 및 이벤트 바인딩
 */

import { calculateRoutes } from './graph.js';
import { WarehouseScene } from './scene.js';
import { AMRSimulator } from './simulator.js';
import { AIPlayer } from './ai-player.js';

class App {
  constructor() {
    this.scene = null;
    this.simulator = null;
    this.aiPlayer = null;

    // 현재 상태
    this.currentDelay = 0.0;
    this.selectedRouteId = 'A';
    this.isTie = false;
    this.tieUserChoice = 'A'; // 동률 시 사용자가 고른 경로 (기본 A)
    this.isAIMode = false;

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

    // 3. MATLAB AI 예측 플레이어 초기화
    this.aiPlayer = new AIPlayer({
      onDataLoaded: (records, source) => this.handleAIDataLoaded(records, source),
      onRecordChange: (info) => this.handleAIRecordChange(info),
      onError: (errMsg) => this.handleAIError(errMsg)
    });

    // 4. 이벤트 리스너 등록
    this.bindEvents();

    // 5. 초기 경로 계산 및 UI 갱신 (d = 0초)
    this.updateRouteState(0.0);
  }

  cacheDOM() {
    this.dom = {
      // 뷰포트 & 툴바
      threeContainer: document.getElementById('threeContainer'),
      btnToggleGraph: document.getElementById('btnToggleGraph'),
      btnResetView: document.getElementById('btnResetView'),
      speedSelect: document.getElementById('speedSelect'),
      hudRouteText: document.getElementById('hudRouteText'),
      hudStatusText: document.getElementById('hudStatusText'),

      // 재생 제어
      btnPlay: document.getElementById('btnPlay'),
      btnPlayIcon: document.getElementById('btnPlayIcon'),
      btnPlayText: document.getElementById('btnPlayText'),
      btnPause: document.getElementById('btnPause'),
      btnReset: document.getElementById('btnReset'),
      simCurrentTime: document.getElementById('simCurrentTime'),
      simTotalTime: document.getElementById('simTotalTime'),
      simProgressBar: document.getElementById('simProgressBar'),

      // 비교 카드 & 결과
      cardRouteA: document.getElementById('cardRouteA'),
      cardRouteB: document.getElementById('cardRouteB'),
      timeAVal: document.getElementById('timeAVal'),
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

    // 2. 프리셋 버튼 클릭
    this.dom.presetButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const val = parseFloat(btn.dataset.val);
        this.dom.delaySlider.value = val;
        this.onDelayChanged(val);
      });
    });

    // 3. 동률 시 라디오 버튼 선택
    this.dom.tieRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.tieUserChoice = e.target.value;
          this.applyRouteSelection();
        }
      });
    });

    // 4. 재생 제어 버튼
    this.dom.btnPlay.addEventListener('click', () => {
      this.simulator.start();
    });

    this.dom.btnPause.addEventListener('click', () => {
      this.simulator.togglePause();
    });

    this.dom.btnReset.addEventListener('click', () => {
      this.simulator.reset();
    });

    this.dom.speedSelect.addEventListener('change', (e) => {
      this.simulator.setSpeed(Number(e.target.value) || 2.0);
    });

    // 5. 툴바 기능
    this.dom.btnToggleGraph.addEventListener('click', () => {
      const active = this.dom.btnToggleGraph.classList.toggle('active');
      this.scene.setGraphVisibility(active);
    });

    this.dom.btnResetView.addEventListener('click', () => {
      this.scene.resetCamera();
    });

    // 6. AI 모드 파일 로드 및 재생 제어
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

  /**
   * 대기 시간(d) 변경 시 호출
   */
  onDelayChanged(delaySec) {
    this.currentDelay = delaySec;
    this.dom.sliderValDisplay.textContent = delaySec.toFixed(1);

    // 프리셋 버튼 활성화 스타일 동기화
    this.dom.presetButtons.forEach(btn => {
      const val = parseFloat(btn.dataset.val);
      if (Math.abs(val - delaySec) < 0.05) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    // 주행 중 변경 시 즉시 리셋 (불일치 방지)
    this.simulator.reset();

    // 경로 계산 및 UI 갱신
    this.updateRouteState(delaySec);
  }

  /**
   * 경로 계산 및 UI / 3D 반영
   */
  updateRouteState(delaySec) {
    const calc = calculateRoutes(delaySec);

    this.isTie = calc.isTie;
    this.currentDelay = calc.delaySec;

    // 1. 소요 시간 및 카드 텍스트 업데이트
    this.dom.timeAVal.textContent = calc.routeA.totalTime.toFixed(1);
    this.dom.cardWaitA.textContent = `+${calc.delaySec.toFixed(1)} 초`;
    this.dom.simTotalTime.textContent = (this.isTie ? 15.0 : (calc.optimalRoute === 'A' ? calc.routeA.totalTime : 15.0)).toFixed(1);

    // 2. 동률 상태 처리
    if (calc.isTie) {
      this.dom.tieSelectorBar.style.display = 'flex';
      this.dom.cardRouteA.className = 'route-card tie-state';
      this.dom.cardRouteB.className = 'route-card tie-state';
      this.dom.decisionBadge.textContent = '소요 시간 동률';
      this.dom.decisionBadge.style.color = 'var(--accent-green)';

      this.dom.decisionBanner.className = 'decision-result-banner banner-tie';
      this.dom.decisionBannerText.innerHTML = `<strong>동률 발생 (15.0초):</strong> 직진 경로와 우회 경로의 소요 시간이 같습니다.`;

      // 사용자가 고른 경로로 시연
      this.selectedRouteId = this.tieUserChoice;
    } else if (calc.optimalRoute === 'A') {
      this.dom.tieSelectorBar.style.display = 'none';
      this.dom.cardRouteA.className = 'route-card selected';
      this.dom.cardRouteB.className = 'route-card';
      this.dom.decisionBadge.textContent = 'A 최적 (직진)';
      this.dom.decisionBadge.style.color = 'var(--accent-cyan)';

      this.dom.decisionBanner.className = 'decision-result-banner';
      this.dom.decisionBannerText.innerHTML = `<strong>직진 경로 A 최적:</strong> 우회로보다 ${(15.0 - calc.routeA.totalTime).toFixed(1)}초 더 빠릅니다.`;

      this.selectedRouteId = 'A';
    } else {
      this.dom.tieSelectorBar.style.display = 'none';
      this.dom.cardRouteA.className = 'route-card';
      this.dom.cardRouteB.className = 'route-card selected-b';
      this.dom.decisionBadge.textContent = 'B 최적 (우회)';
      this.dom.decisionBadge.style.color = 'var(--accent-orange)';

      this.dom.decisionBanner.className = 'decision-result-banner banner-b';
      this.dom.decisionBannerText.innerHTML = `<strong>우회 경로 B 최적:</strong> 대기 지연으로 인해 우회가 ${(calc.routeA.totalTime - 15.0).toFixed(1)}초 더 빠릅니다.`;

      this.selectedRouteId = 'B';
    }

    this.applyRouteSelection(calc.routeA.totalTime);
  }

  applyRouteSelection(totalTimeA = null) {
    const calc = calculateRoutes(this.currentDelay);
    const activeRouteId = this.isTie ? this.tieUserChoice : this.selectedRouteId;
    const timeA = totalTimeA ?? calc.routeA.totalTime;

    // 3D 씬 강조 업데이트
    this.scene.updateRouteHighlight(activeRouteId, this.isTie, this.currentDelay, timeA);

    // 시뮬레이터에 적용
    this.simulator.setRoute(activeRouteId, this.currentDelay);

    // HUD 텍스트 갱신
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

  // --- MATLAB AI 예측 연동 콜백 처리 ---

  handleAIDataLoaded(records, source) {
    this.isAIMode = true;
    this.dom.systemModeLabel.textContent = `AI 예측 재생 모드 (${source})`;
    this.dom.aiStatusPill.textContent = 'AI 재생 모드';
    this.dom.aiStatusPill.style.color = 'var(--accent-cyan)';
    this.dom.aiNoticeBox.className = 'ai-status-message';
    this.dom.aiNoticeBox.innerHTML = `✅ <strong>${records.length}개</strong>의 MATLAB 예측 레코드가 로드되었습니다.`;
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

    // 단계별 표시 (1단계: 예측 vs 2단계: 실제 공개)
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

    // 분기점 S 시뮬레이터 연동:
    // 경고가 있으면 사용자가 설정한 슬라이더 d초를 그대로 반영,
    // 경고가 없으면(warning: false) 추가 대기 0초를 적용!
    const effectiveDelay = hasWarning ? parseFloat(this.dom.delaySlider.value) : 0.0;
    this.updateRouteState(effectiveDelay);

    // AI 모드 가이드 배너 갱신
    if (hasWarning) {
      this.dom.decisionBannerText.innerHTML += ` <span style="color: var(--accent-red); font-size: 0.72rem;">[MATLAB 경고: S 분기점 재확인 대기 ${effectiveDelay.toFixed(1)}초 적용]</span>`;
    } else {
      this.dom.decisionBannerText.innerHTML += ` <span style="color: var(--accent-green); font-size: 0.72rem;">[MATLAB 정상: 특징점 안정, 추가 대기 0.0초 적용]</span>`;
    }
  }

  handleAIError(errMsg) {
    this.dom.aiNoticeBox.className = 'ai-status-message error';
    this.dom.aiNoticeBox.textContent = `❌ ${errMsg} (수동 시뮬레이션 모드를 계속 사용합니다)`;
    this.isAIMode = false;
    this.dom.systemModeLabel.textContent = '수동 시뮬레이션 모드';
    this.dom.aiStatusPill.textContent = '수동 모드';
    this.dom.aiStatusPill.style.color = 'var(--text-muted)';
  }
}

// 애플리케이션 시작
window.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
