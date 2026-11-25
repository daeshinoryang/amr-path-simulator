/**
 * TorWIC-SLAM 카메라 상태 및 듀얼 프레임 특징점 시각화 모듈
 * 
 * - Frame 1 (96.39s) vs Frame 2 (96.49s)
 * - 밝기 변화량 (0~1 정규화 픽셀 지표)
 * - 특징점(ORB/FAST) 트래킹 유지 및 유실 시각화
 */

export class CameraStatusView {
  constructor(canvas1, canvas2, domElements = {}) {
    this.canvas1 = canvas1;
    this.canvas2 = canvas2;
    this.ctx1 = canvas1?.getContext('2d');
    this.ctx2 = canvas2?.getContext('2d');
    this.dom = domElements;

    // 기본 TorWIC-SLAM 실측 관측 사례
    this.currentCase = {
      source: 'TorWIC-SLAM, Aisle_CCW, 왼쪽 카메라',
      t1: 96.39,
      t2: 96.49,
      brightness1: 0.4512,
      brightness2: 0.4713,
      deltaBrightness: 0.0201,
      retentionPct: 48.5,
      isRecheckRequired: true, // 48.5% < 90%
      pointsTotal: 24,
      pointsRetained: 12,
      note: '바닥 고반사광 및 역광으로 인한 특징점 급격 소실'
    };

    // 특징점 고정 좌표 시드 (재현 가능한 24개 특징점)
    this.featurePoints = this.generateBasePoints(24);

    this.render();
  }

  generateBasePoints(count) {
    const points = [];
    const seedCoords = [
      // 좌측 선반 기둥/선반면 특징점들
      [35, 30], [50, 45], [40, 70], [60, 60], [30, 90], [55, 95],
      // 우측 선반 기둥/선반면 특징점들
      [165, 30], [150, 45], [160, 70], [140, 60], [170, 90], [145, 95],
      // 중앙 통로 소실점 및 바닥 라인 특징점들
      [90, 40], [110, 40], [100, 50], [85, 65], [115, 65],
      [75, 80], [125, 80], [95, 85], [105, 85], [70, 105], [130, 105], [100, 108]
    ];
    for (let i = 0; i < count; i++) {
      const coord = seedCoords[i] || [40 + (i * 25) % 120, 30 + (i * 15) % 80];
      points.push({
        x: coord[0],
        y: coord[1],
        // 유지 여부: 인덱스 짝수면 유지 (48.5%에 근접한 12/24 = 50%)
        retained: (i % 2 === 0)
      });
    }
    return points;
  }

  setCaseData(caseData) {
    this.currentCase = { ...this.currentCase, ...caseData };
    this.currentCase.isRecheckRequired = (this.currentCase.retentionPct < 90.0);
    this.render();
    this.updateDom();
  }

  render() {
    if (this.ctx1 && this.canvas1) {
      this.drawFrame(this.ctx1, this.canvas1, 1, this.currentCase.brightness1, false);
    }
    if (this.ctx2 && this.canvas2) {
      this.drawFrame(this.ctx2, this.canvas2, 2, this.currentCase.brightness2, true);
    }
  }

  drawFrame(ctx, canvas, frameNum, brightness, hasGlare) {
    const w = canvas.width;
    const h = canvas.height;

    // 1. 배경 (그레이스케일 창고 통로 환경)
    const baseGray = Math.round(brightness * 255);
    ctx.fillStyle = `rgb(${baseGray - 30}, ${baseGray - 25}, ${baseGray - 15})`;
    ctx.fillRect(0, 0, w, h);

    // 2. 창고 통로 원근 가이드라인 및 선반 실루엣
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.15 + brightness * 0.1})`;
    ctx.lineWidth = 1;

    const vpX = w / 2;
    const vpY = h * 0.35; // 원근 소실점

    // 바닥 통로 경계선
    ctx.beginPath();
    ctx.moveTo(vpX - 15, vpY);
    ctx.lineTo(10, h);
    ctx.moveTo(vpX + 15, vpY);
    ctx.lineTo(w - 10, h);
    ctx.stroke();

    // 좌우 랙 기둥 실루엣
    ctx.fillStyle = `rgba(15, 23, 42, 0.75)`;
    // 좌측 랙
    ctx.fillRect(0, 10, w * 0.28, h - 20);
    // 우측 랙
    ctx.fillRect(w * 0.72, 10, w * 0.28, h - 20);

    // 랙 프레임 라인
    ctx.strokeStyle = `rgba(100, 150, 220, 0.35)`;
    ctx.strokeRect(4, 14, w * 0.26, h - 28);
    ctx.strokeRect(w * 0.73, 14, w * 0.26, h - 28);

    // 3. 반사광(Glare) 효과 (Frame 2인 경우 바닥에 강한 빛 번짐)
    if (hasGlare) {
      const glareGrad = ctx.createRadialGradient(vpX, h * 0.75, 5, vpX, h * 0.75, w * 0.45);
      glareGrad.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
      glareGrad.addColorStop(0.35, 'rgba(255, 250, 220, 0.45)');
      glareGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = glareGrad;
      ctx.beginPath();
      ctx.ellipse(vpX, h * 0.75, w * 0.42, h * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. 특징점(ORB/FAST) 그리기
    this.featurePoints.forEach(pt => {
      // 캔버스 스케일에 맞춤 (기준 200x120)
      const px = (pt.x / 200) * w;
      const py = (pt.y / 120) * h;

      if (frameNum === 1) {
        // Frame 1: 모든 특징점 정상 추적 (녹색 십자)
        this.drawCrosshair(ctx, px, py, '#00e676', 4);
      } else {
        // Frame 2: 유지된 특징점(녹색 십자) vs 유실된 특징점(빨간색 X)
        if (pt.retained) {
          this.drawCrosshair(ctx, px, py, '#00e676', 4);
        } else {
          this.drawLostPoint(ctx, px, py, '#ff3366', 4);
        }
      }
    });

    // 5. 프레임 정보 헤더 오버레이
    ctx.fillStyle = 'rgba(10, 15, 29, 0.75)';
    ctx.fillRect(0, 0, w, 20);

    ctx.fillStyle = frameNum === 1 ? '#00d2ff' : (hasGlare ? '#ff9800' : '#00d2ff');
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(frameNum === 1 ? `F1 [${this.currentCase.t1.toFixed(2)}s]` : `F2 [${this.currentCase.t2.toFixed(2)}s]`, 6, 14);

    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'right';
    ctx.fillText(`밝기: ${brightness.toFixed(4)}`, w - 6, 14);
  }

  drawCrosshair(ctx, x, y, color, size) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x - size, y);
    ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size);
    ctx.lineTo(x, y + size);
    ctx.stroke();

    // 중앙 원
    ctx.fillStyle = color;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  }

  drawLostPoint(ctx, x, y, color, size) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    // X 마커
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.stroke();
  }

  updateDom() {
    if (this.dom.valDeltaBrightness) {
      this.dom.valDeltaBrightness.textContent = `Δ ${this.currentCase.deltaBrightness.toFixed(4)}`;
    }
    if (this.dom.valRetentionPct) {
      this.dom.valRetentionPct.textContent = `${this.currentCase.retentionPct.toFixed(1)}%`;
    }
    if (this.dom.valBrightness1) {
      this.dom.valBrightness1.textContent = this.currentCase.brightness1.toFixed(4);
    }
    if (this.dom.valBrightness2) {
      this.dom.valBrightness2.textContent = this.currentCase.brightness2.toFixed(4);
    }
    if (this.dom.badgeRecheckStatus) {
      if (this.currentCase.isRecheckRequired) {
        this.dom.badgeRecheckStatus.className = 'status-pill pill-warning';
        this.dom.badgeRecheckStatus.textContent = '⚠️ 재확인 필요 (유지율 < 90%)';
      } else {
        this.dom.badgeRecheckStatus.className = 'status-pill pill-success';
        this.dom.badgeRecheckStatus.textContent = '🟢 안정 (유지율 ≥ 90%)';
      }
    }
  }
}
