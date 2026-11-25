/**
 * MATLAB AI 예측 결과 연동 및 시계열 재생 모듈
 * 
 * 예측 JSON 스키마 필드:
 *  - decision_time_s: 예측을 내린 촬영 시각(초)
 *  - target_time_s: 다음 프레임 쌍의 실제 결과가 확인된 시각(초)
 *  - risk_probability: 다음 프레임 쌍의 특징점 추적 유지율이 90% 미만일 예측 확률(0~1)
 *  - warning: MATLAB에서 판정한 경고 여부(true/false)
 *  - actual_retention_pct: 다음 프레임 쌍의 실제 특징점 추적 유지율(0~100)
 */

export class AIPlayer {
  constructor(callbacks = {}) {
    this.records = [];
    this.currentIndex = -1;
    this.phase = 'idle'; // 'idle' | 'decision' | 'target'
    this.callbacks = callbacks; // onDataLoaded, onRecordChange, onError, onModeChange
    this.loadedSource = null;
  }

  /**
   * JSON 문자열을 파싱하고 스키마를 검증합니다.
   * @param {string} jsonString 
   * @param {string} sourceName 
   */
  loadFromJSONString(jsonString, sourceName = '파일') {
    try {
      const data = JSON.parse(jsonString);
      if (!Array.isArray(data)) {
        throw new Error('JSON의 최상위 구조는 레코드 객체들의 배열([])이어야 합니다.');
      }
      if (data.length === 0) {
        throw new Error('예측 데이터 배열이 비어 있습니다.');
      }

      const validatedRecords = [];
      for (let i = 0; i < data.length; i++) {
        const item = data[i];
        const row = i + 1;

        if (typeof item.decision_time_s !== 'number' || isNaN(item.decision_time_s)) {
          throw new Error(`[레코드 ${row}] 'decision_time_s'는 숫자형 시각(초)이어야 합니다.`);
        }
        if (typeof item.target_time_s !== 'number' || isNaN(item.target_time_s)) {
          throw new Error(`[레코드 ${row}] 'target_time_s'는 숫자형 시각(초)이어야 합니다.`);
        }
        if (typeof item.risk_probability !== 'number' || item.risk_probability < 0 || item.risk_probability > 1) {
          throw new Error(`[레코드 ${row}] 'risk_probability'는 0 이상 1 이하의 확률값이어야 합니다.`);
        }
        if (typeof item.warning !== 'boolean') {
          throw new Error(`[레코드 ${row}] 'warning'은 boolean(true/false) 값이어야 합니다.`);
        }
        if (typeof item.actual_retention_pct !== 'number' || item.actual_retention_pct < 0 || item.actual_retention_pct > 100) {
          throw new Error(`[레코드 ${row}] 'actual_retention_pct'는 0~100 사이의 유지율(%)이어야 합니다.`);
        }

        validatedRecords.push({
          id: item.id ?? i + 1,
          decision_time_s: Number(item.decision_time_s.toFixed(3)),
          target_time_s: Number(item.target_time_s.toFixed(3)),
          risk_probability: Number(item.risk_probability),
          warning: Boolean(item.warning),
          actual_retention_pct: Number(item.actual_retention_pct),
          note: item.note || ''
        });
      }

      this.records = validatedRecords;
      this.loadedSource = sourceName;
      this.currentIndex = 0;
      this.phase = 'decision';

      if (this.callbacks.onDataLoaded) {
        this.callbacks.onDataLoaded(this.records, this.loadedSource);
      }
      this.emitCurrentRecord();
      return { success: true, count: this.records.length };
    } catch (err) {
      if (this.callbacks.onError) {
        this.callbacks.onError(`파일 읽기 오류: ${err.message}`);
      }
      return { success: false, error: err.message };
    }
  }

  /**
   * 상대 경로의 JSON 파일을 fetch로 로드합니다.
   * @param {string} url 
   */
  async loadFromURL(url = './data/predictions.json') {
    try {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const text = await res.text();
      return this.loadFromJSONString(text, url);
    } catch (err) {
      if (this.callbacks.onError) {
        this.callbacks.onError(`서버 파일 로드 실패 (${url}): ${err.message}`);
      }
      return { success: false, error: err.message };
    }
  }

  hasData() {
    return this.records.length > 0;
  }

  getCurrentRecord() {
    if (!this.hasData() || this.currentIndex < 0 || this.currentIndex >= this.records.length) {
      return null;
    }
    return this.records[this.currentIndex];
  }

  setIndex(index) {
    if (!this.hasData()) return;
    if (index >= 0 && index < this.records.length) {
      this.currentIndex = index;
      this.phase = 'decision'; // 새 레코드 선택 시 1단계(예측)부터 시작
      this.emitCurrentRecord();
    }
  }

  nextRecord() {
    if (this.currentIndex < this.records.length - 1) {
      this.setIndex(this.currentIndex + 1);
    }
  }

  prevRecord() {
    if (this.currentIndex > 0) {
      this.setIndex(this.currentIndex - 1);
    }
  }

  /**
   * 1단계(decision)에서 2단계(target: 실제 결과 공개)로 전환합니다.
   */
  revealActual() {
    if (!this.hasData()) return;
    this.phase = 'target';
    this.emitCurrentRecord();
  }

  /**
   * 1단계(decision)로 되돌립니다.
   */
  showDecisionOnly() {
    if (!this.hasData()) return;
    this.phase = 'decision';
    this.emitCurrentRecord();
  }

  emitCurrentRecord() {
    const record = this.getCurrentRecord();
    if (record && this.callbacks.onRecordChange) {
      this.callbacks.onRecordChange({
        record,
        index: this.currentIndex,
        total: this.records.length,
        phase: this.phase, // 'decision' or 'target'
        // warning에 따라 창고 시뮬레이션에 적용할 추가 대기 시간 가이드
        hasWarning: record.warning,
      });
    }
  }
}
