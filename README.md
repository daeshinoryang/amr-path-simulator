# 물류 AMR의 최소시간 경로 시뮬레이터
> **고등학교 「인공지능을 위한 이산수학」 주제탐구 발표 프로젝트**  
> 조도 및 반사광에 따른 SLAM 특징점 추적 불안정과 재확인 대기를 반영한 3D 물류 AMR 최소시간 경로 결정 시뮬레이터

---

## 1. 탐구 배경 및 사이트 목표

- **1학년 선행 탐구 연계**: 1학년 대신사이언스챌린지에서 조도 및 바닥 반사광에 따라 라인트레이싱 AGV의 주행 안정성이 저하되는 현상을 탐구했습니다.
- **2학년 주제 확장**: 이번 탐구에서는 실제 물류창고에서 수집된 **TorWIC-SLAM** 주행 영상을 분석하여, 조도 급변 및 반사광으로 인해 영상 특징점(Feature Point) 추적이 불안정해질 때 발생하는 **'재확인 대기(Re-localization / Re-check Latency)'**를 AMR의 경로 가중치 그래프에 반영했습니다.
- **핵심 질문**:
  > **“직진 통로에서 예상되는 재확인 대기가 몇 초부터 우회로를 선택하는 것이 더 빠를까?”**
- **이산수학적 해결**: 정점(Vertex)과 간선(Edge)으로 모델링된 창고 네트워크에서, 직진 경로 $A$의 소요 시간 $T_A = 12 + d$와 우회 경로 $B$의 소요 시간 $T_B = 15$를 비교하여 최적해의 전이가 일어나는 **전환점(Threshold) $d = 3.0$초**를 도출하고 3D 시뮬레이션으로 시각화 및 검증합니다.

---

## 2. MATLAB 검증 창고 그래프 및 경로 모델

모든 좌표 단위는 미터($\text{m}$)이며, 주행 속도는 $1.0\,\text{m/s}$, $90^\circ$ 회전 시간은 $0.5$초입니다.

### 정점 좌표
- **$S$ (출발점 겸 분기점)**: $(0, 0)$
- **$T$ (목적지)**: $(12, 0)$
- **$U$ (우회로 첫 번째 모서리)**: $(0, 1)$
- **$V$ (우회로 두 번째 모서리)**: $(12, 1)$

### 비교 경로 및 소요 시간 수식
1. **경로 A (직진 통로: $S \to T$)**:
   - 이동 거리: $12\,\text{m}$
   - 직진 주행 시간: $12\,\text{m} / 1\,\text{m/s} = 12.0$초
   - 회전 횟수 / 시간: 0회 ($0.0$초)
   - 재확인 예상 대기: $d$초 (가정값)
   - **총 예상 소요 시간 $T_A = 12 + d$ (초)**

2. **경로 B (우회 통로: $S \to U \to V \to T$)**:
   - 이동 거리: $S \to U\,(1\text{m}) + U \to V\,(12\text{m}) + V \to T\,(1\text{m}) = 14.0\,\text{m}$
   - 주행 시간: $14\,\text{m} / 1\,\text{m/s} = 14.0$초
   - 회전 횟수 / 시간: $U$에서 $90^\circ$ 회전 1회 + $V$에서 $90^\circ$ 회전 1회 = 총 2회 ($2 \times 0.5 = 1.0$초)
   - 재확인 예상 대기: $0.0$초 (우회로는 특징점 추적이 양호하다고 가정)
   - **총 예상 소요 시간 $T_B = 14.0 + 1.0 = 15.0$ (초)**

### 최적 경로 판정 조건 (전환점 $d = 3.0$초)
- $d < 3.0$초: **경로 A 선택** ($T_A < 15.0$초)
- $d = 3.0$초 ($\pm 0.001$ 오차 허용): **동률(Tie)** ($T_A = T_B = 15.0$초) $\to$ 두 경로 모두 강조, 시연 경로 선택 가능 (기본값: A)
- $d > 3.0$초: **경로 B 선택** ($T_B < T_A$)

---

## 3. 프로젝트 파일 구조

```text
amr-path-simulator/
├── index.html              # 메인 관제 대시보드 웹 애플리케이션
├── README.md               # 프로젝트 문서 (이산수학 모델, 배포 가이드, JSON 규격)
├── css/
│   └── style.css           # 물류 관제 대시보드 반응형 다크 테마 스타일시트
├── js/
│   ├── graph.js            # MATLAB 검증 창고 그래프 모델 및 경로 계산 모듈
│   ├── scene.js            # Three.js 3D 창고 환경, AMR 로봇, 경로 및 그래프 텍스트 렌더링
│   ├── simulator.js        # 대기 카운트다운, 속도, 90도 회전 보간 및 주행 애니메이션 엔진
│   ├── ai-player.js        # MATLAB 예측 JSON 스키마 검증, 시계열 단계별 재생 및 S 분기점 연계 모듈
│   └── app.js              # UI 이벤트 바인딩 및 상태 동기화 메인 진입점
└── data/
    └── predictions.json    # TorWIC-SLAM 실측 사례 및 전후 시계열을 반영한 샘플 예측 데이터
```

---

## 4. 로컬 실행 방법

보안 상 ES Module(`import/export`) 및 Three.js 모듈 로딩을 위해 로컬 정적 웹 서버를 통해 실행하는 것을 권장합니다.

### 방법 1. Python 내장 서버 (추천)
터미널에서 프로젝트 폴더로 이동 후 아래 명령을 실행합니다.
```bash
# Python 3
python -m http.server 8000
```
웹 브라우저에서 `http://localhost:8000` 접속

### 방법 2. Node.js npx serve
```bash
npx serve .
```

### 방법 3. VS Code Live Server 확장
VS Code에서 `amr-path-simulator` 폴더를 열고 `index.html` 우클릭 $\to$ **`Open with Live Server`** 클릭

---

## 5. GitHub Pages 배포 안내

이 프로젝트는 빌드 과정(Webpack, Vite 등)이 필요 없는 **순수 표준 정적 웹 프로젝트(HTML5/CSS3/Vanilla ES Modules)**이므로, 저장소에 그대로 푸시하면 GitHub Pages에서 바로 동작합니다.

### 배포할 파일 목록
- `index.html`
- `css/` 폴더 전체
- `js/` 폴더 전체
- `data/` 폴더 전체
- `README.md`

### 배포 절차
1. GitHub에서 새 공개(Public) 저장소를 생성합니다. (예: `amr-path-simulator`)
2. 로컬 프로젝트를 커밋하고 푸시합니다:
   ```bash
   git init
   git add .
   git commit -m "feat: 물류 AMR의 최소시간 경로 시뮬레이터 배포"
   git branch -M main
   git remote add origin https://github.com/<사용자ID>/amr-path-simulator.git
   git push -u origin main
   ```
3. GitHub 저장소의 **Settings** $\to$ **Pages** 메뉴로 이동합니다.
4. **Build and deployment** $\to$ **Source**를 **`Deploy from a branch`**로 선택하고, **Branch**를 `main` / `/(root)`로 지정한 뒤 **Save**를 누릅니다.
5. 수 분 후 생성된 Pages URL (`https://<사용자ID>.github.io/amr-path-simulator/`)에 접속하여 확인합니다.

---

## 6. MATLAB AI 예측 JSON 데이터 규격

MATLAB에서 Aisle_CCW 데이터로 학습하고 Aisle_CW로 검증한 모델의 추론 결과를 JSON으로 내보낼 때 아래 스키마를 준수해야 합니다.

### 필드 명세 및 단위

| 필드명 | 타입 | 단위 / 범위 | 설명 |
| :--- | :---: | :---: | :--- |
| `decision_time_s` | `number` | 초 (s) | 모델이 특징점 추적 위험도를 예측한 원본 비디오 촬영 시각 |
| `target_time_s` | `number` | 초 (s) | 다음 프레임 쌍의 실제 SLAM 추적 결과가 확인된 시각 |
| `risk_probability` | `number` | $0.0 \sim 1.0$ | 다음 프레임 쌍의 특징점 유지율이 90% 미만으로 떨어질 예측 확률 |
| `warning` | `boolean` | `true` / `false` | MATLAB 모델에서 판정한 경고 발생 여부 (`true`: 위험) |
| `actual_retention_pct` | `number` | $0.0 \sim 100.0$ (%) | 다음 프레임 쌍에서 실제로 측정된 특징점 추적 유지율 |
| `note` *(선택)* | `string` | - | 관측 구간 특이사항 메모 (예: "급격한 바닥 반사광 발생") |

### 예시 JSON (`data/predictions.json`)
```json
[
  {
    "id": 1,
    "decision_time_s": 95.10,
    "target_time_s": 95.20,
    "risk_probability": 0.08,
    "warning": false,
    "actual_retention_pct": 94.2,
    "note": "정상 주행 구간 (조도 균일)"
  },
  {
    "id": 4,
    "decision_time_s": 96.39,
    "target_time_s": 96.49,
    "risk_probability": 0.88,
    "warning": true,
    "actual_retention_pct": 48.5,
    "note": "실제 관측 사례 구간 (강한 바닥 반사광 및 역광으로 특징점 소실 급증)"
  }
]
```

### 웹 시뮬레이터 재생 및 연동 방식
1. **1단계 (예측 시점 `decision_time_s`)**:
   - 예측 확률 `risk_probability`와 MATLAB 경고 `warning`을 먼저 표시합니다.
   - 실제 유지율은 블라인드 처리(`검증 대기 중...`)됩니다.
2. **2단계 (결과 확인 시점 `target_time_s`)**:
   - 실제 측정된 유지율 `actual_retention_pct`를 공개하여 예측의 정합성을 비교합니다.
3. **창고 분기점 $S$ 연계**:
   - `warning: true`인 경우: 사용자가 슬라이더로 설정한 재확인 예상 대기 시간 $d$를 직진 통로(경로 A)에 적용하여 경로를 비교합니다.
   - `warning: false`인 경우: 특징점이 안정적이므로 추가 대기를 $0.0$초로 적용하여 직진 A가 최적 경로가 됩니다.
4. **시각 분리 표시**:
   - SLAM 영상 촬영 시각(`valDecisionTime` / `valTargetTime`)과 모의 창고 AMR 주행 시간(`simCurrentTime`)이 각각 독립적으로 정확하게 표시됩니다.

---

## 7. 실제 영상 관측값과 시뮬레이션 개념 구분

발표 평가 및 보고서 작성 시 혼동을 방지하기 위해 세 가지 개념을 엄격히 구분하여 설계했습니다:

1. **[실제 관측값]**
   - **TorWIC-SLAM (Aisle_CCW, 왼쪽 카메라, 96.39s $\to$ 96.49s)**: 평균 밝기 변화량 $\Delta = 0.0201$, 실제 특징점 유지율 **$48.5\%$** (절반 이상의 특징점 급격 소실).
   - **756쌍 통계**: 밝기 변화량과 유지율의 피어슨 상관계수 **$r = -0.256$** (급격한 밝기 변동이 추적 실패를 유발함을 실측 검증).
2. **[시뮬레이션 가정값]**
   - 재확인 예상 대기 시간 **$d$**: 영상 분석에서 특징점 소실이 일어났을 때, AMR이 안전을 위해 센서를 재스캔하거나 위치를 재추정(Re-localization)하는 데 소요된다고 가정한 가변 파라미터 ($0 \sim 6$초).
3. **[이산수학적 임계값]**
   - **$3.0$초**: 두 경로의 기하학적 기본 소요 시간 차이 ($15.0\,\text{s} - 12.0\,\text{s} = 3.0\,\text{s}$)에서 도출된 최적 경로의 분기 기준(Phase Transition Point).
