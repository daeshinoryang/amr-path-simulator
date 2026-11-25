/**
 * Three.js 3D 창고 씬, AMR 로봇 모델, 경로 및 그래프 오버레이 렌더링 모듈
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

export class WarehouseScene {
  constructor(containerElement) {
    this.container = containerElement;
    this.width = containerElement.clientWidth || 800;
    this.height = containerElement.clientHeight || 500;

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;

    // 객체 참조
    this.amrRobot = null;
    this.lidarSensor = null;
    this.statusLed = null;
    this.pathMeshA = null;
    this.pathMeshB = null;
    this.graphOverlayGroup = null;
    this.markersGroup = null;

    // 상태
    this.showGraph = false;
    this.currentDelay = 0;
    this.activeRouteId = 'A';
    this.isTie = false;

    this.init();
  }

  init() {
    // 1. 씬 생성
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0e131f); // 딥 네이비 물류 관제 배경
    this.scene.fog = new THREE.FogExp2(0x0e131f, 0.025);

    // 2. 카메라 (0~12m, Z: 0~1m 중심 (6, 0, 0.5)을 향함)
    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 100);
    this.resetCamera();

    // 3. 렌더러
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // 4. 컨트롤
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(6, 0, 0.5);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05; // 바닥 아래로 안 내려가게 제한
    this.controls.minDistance = 3;
    this.controls.maxDistance = 35;
    this.controls.update();

    // 5. 조명
    this.setupLighting();

    // 6. 창고 환경 (바닥, 선반, 마킹)
    this.buildWarehouseFloor();
    this.buildWarehouseRacks();

    // 7. 정점 마커 및 경로 라인
    this.buildPathLines();
    this.buildVertexMarkers();

    // 8. 그래프 가중치 오버레이 그룹
    this.buildGraphOverlay();

    // 9. AMR 로봇 생성
    this.amrRobot = this.createAMR();
    this.scene.add(this.amrRobot);

    // 창 크기 변경 대응
    window.addEventListener('resize', () => this.onWindowResize());

    // 렌더 루프
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  resetCamera() {
    // S(0,0)과 T(12,0), 우회로(0~12, Z=1)가 한눈에 잘 보이는 각도
    // Z가 +방향이 우회로이므로, Z가 -방향인 앞쪽 비스듬한 상단에서 조망
    this.camera.position.set(6, 11, -8.5);
    if (this.controls) {
      this.controls.target.set(6, 0, 0.5);
      this.controls.update();
    }
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xdde6f5, 0.7);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(10, 16, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 40;
    const d = 14;
    dirLight.shadow.camera.left = -d;
    dirLight.shadow.camera.right = d;
    dirLight.shadow.camera.top = d;
    dirLight.shadow.camera.bottom = -d;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // 창고 작업등 포인트 라이트 (부드러운 조명)
    const pLight1 = new THREE.PointLight(0x00d2ff, 0.6, 20);
    pLight1.position.set(0, 4, 0);
    this.scene.add(pLight1);

    const pLight2 = new THREE.PointLight(0xff9800, 0.6, 20);
    pLight2.position.set(12, 4, 1);
    this.scene.add(pLight2);
  }

  buildWarehouseFloor() {
    // 바닥 평면: X: -4 ~ 16 (20m), Z: -5 ~ 6 (11m)
    const floorGeo = new THREE.PlaneGeometry(24, 14);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1b2234, // 물류창고 에폭시 바닥
      roughness: 0.35,
      metalness: 0.15,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(6, -0.005, 0.5);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // 바닥 그리드 라인 (1m 간격)
    const gridHelper = new THREE.GridHelper(24, 24, 0x3d4b68, 0x242d42);
    gridHelper.position.set(6, 0.001, 0.5);
    this.scene.add(gridHelper);

    // 직진 통로(Z=0)와 우회 통로(Z=1) 바닥 주행 가이드 구획선
    this.createAisleStripe(0, 0x1e3a5f);
    this.createAisleStripe(1, 0x3d301f);
  }

  createAisleStripe(zPos, colorHex) {
    const geo = new THREE.PlaneGeometry(13.6, 0.85);
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    const stripe = new THREE.Mesh(geo, mat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(6, 0.005, zPos);
    this.scene.add(stripe);
  }

  buildWarehouseRacks() {
    const rackGroup = new THREE.Group();

    // 선반은 경로(Z=0 ~ Z=1, X=0 ~ 12)를 절대 가리지 않는 영역에 배치:
    // 1열: Z <= -1.2 쪽 선반 (X: -2 ~ 14 구간)
    // 2열: Z >= 2.2 쪽 선반 (X: -2 ~ 14 구간)
    // 랙 베이 5세트씩 배치
    for (let x = -1; x <= 13; x += 3.2) {
      rackGroup.add(this.createSingleRack(x, -1.8, 3));
      rackGroup.add(this.createSingleRack(x, 2.8, 3));
    }

    this.scene.add(rackGroup);
  }

  createSingleRack(x, z, levels = 3) {
    const rack = new THREE.Group();
    const width = 2.8;
    const depth = 0.9;
    const height = 2.4;

    // 기둥 재질 (산업용 오렌지/블루)
    const postMat = new THREE.MeshStandardMaterial({ color: 0x3060a0, roughness: 0.5, metalness: 0.6 });
    const beamMat = new THREE.MeshStandardMaterial({ color: 0xd97724, roughness: 0.4, metalness: 0.4 });
    const boxMatColors = [0xd6a461, 0xb8864a, 0x3f51b5, 0x455a64, 0x8d6e63];

    // 4개 수직 기둥
    const postGeo = new THREE.BoxGeometry(0.06, height, 0.06);
    const halfW = width / 2;
    const halfD = depth / 2;
    const offsets = [
      [-halfW, -halfD], [halfW, -halfD],
      [-halfW, halfD], [halfW, halfD]
    ];
    offsets.forEach(([ox, oz]) => {
      const p = new THREE.Mesh(postGeo, postMat);
      p.position.set(ox, height / 2, oz);
      p.castShadow = true;
      p.receiveShadow = true;
      rack.add(p);
    });

    // 각 단 빔과 팔레트 & 박스
    for (let lvl = 0; lvl < levels; lvl++) {
      const y = 0.4 + lvl * 0.8;
      // 가로 빔
      const beamGeoX = new THREE.BoxGeometry(width, 0.05, 0.05);
      const b1 = new THREE.Mesh(beamGeoX, beamMat);
      b1.position.set(0, y, -halfD);
      const b2 = new THREE.Mesh(beamGeoX, beamMat);
      b2.position.set(0, y, halfD);
      rack.add(b1, b2);

      // 팔레트 2개와 화물 상자
      for (let pIdx = -1; pIdx <= 1; pIdx += 2) {
        const px = pIdx * (width / 4);
        // 목재 팔레트
        const palletGeo = new THREE.BoxGeometry(1.0, 0.08, 0.8);
        const palletMat = new THREE.MeshStandardMaterial({ color: 0x8a623a, roughness: 0.8 });
        const pallet = new THREE.Mesh(palletGeo, palletMat);
        pallet.position.set(px, y + 0.04, 0);
        pallet.castShadow = true;
        rack.add(pallet);

        // 상자들 (2~3개)
        const boxCount = 2;
        for (let b = 0; b < boxCount; b++) {
          const bx = px + (b === 0 ? -0.2 : 0.2);
          const bGeo = new THREE.BoxGeometry(0.38, 0.4 + (lvl % 2) * 0.1, 0.5);
          const bMat = new THREE.MeshStandardMaterial({
            color: boxMatColors[(lvl + b + Math.abs(pIdx)) % boxMatColors.length],
            roughness: 0.7
          });
          const box = new THREE.Mesh(bGeo, bMat);
          box.position.set(bx, y + 0.08 + 0.25, 0);
          box.castShadow = true;
          box.receiveShadow = true;
          rack.add(box);
        }
      }
    }

    rack.position.set(x, 0, z);
    return rack;
  }

  buildPathLines() {
    // 경로 A: S(0,0,0) -> T(12,0,0)
    const pointsA = [
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(12, 0.02, 0)
    ];
    const geoA = new THREE.BufferGeometry().setFromPoints(pointsA);
    const matA = new THREE.LineBasicMaterial({
      color: 0x00d2ff,
      linewidth: 4,
    });
    this.pathMeshA = new THREE.Line(geoA, matA);
    this.scene.add(this.pathMeshA);

    // 경로 A 바닥 발광 띠 (리본)
    const ribbonGeoA = new THREE.PlaneGeometry(12, 0.14);
    const ribbonMatA = new THREE.MeshBasicMaterial({
      color: 0x00d2ff,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    this.ribbonA = new THREE.Mesh(ribbonGeoA, ribbonMatA);
    this.ribbonA.rotation.x = -Math.PI / 2;
    this.ribbonA.position.set(6, 0.015, 0);
    this.scene.add(this.ribbonA);

    // 경로 B: S(0,0,0) -> U(0,0,1) -> V(12,0,1) -> T(12,0,0)
    const pointsB = [
      new THREE.Vector3(0, 0.02, 0),
      new THREE.Vector3(0, 0.02, 1),
      new THREE.Vector3(12, 0.02, 1),
      new THREE.Vector3(12, 0.02, 0)
    ];
    const geoB = new THREE.BufferGeometry().setFromPoints(pointsB);
    const matB = new THREE.LineBasicMaterial({
      color: 0xff9800,
      linewidth: 4,
    });
    this.pathMeshB = new THREE.Line(geoB, matB);
    this.scene.add(this.pathMeshB);

    // 경로 B 바닥 발광 띠 세그먼트들
    this.ribbonBGroup = new THREE.Group();
    const ribbonMatB = new THREE.MeshBasicMaterial({
      color: 0xff9800,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    });
    // 세그먼트 1: S(0,0) -> U(0,1) (길이 1m, Z방향)
    const rB1 = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1.0), ribbonMatB);
    rB1.rotation.x = -Math.PI / 2;
    rB1.position.set(0, 0.015, 0.5);
    // 세그먼트 2: U(0,1) -> V(12,1) (길이 12m, X방향)
    const rB2 = new THREE.Mesh(new THREE.PlaneGeometry(12.0, 0.14), ribbonMatB);
    rB2.rotation.x = -Math.PI / 2;
    rB2.position.set(6, 0.015, 1.0);
    // 세그먼트 3: V(12,1) -> T(12,0) (길이 1m, Z방향)
    const rB3 = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 1.0), ribbonMatB);
    rB3.rotation.x = -Math.PI / 2;
    rB3.position.set(12, 0.015, 0.5);

    this.ribbonBGroup.add(rB1, rB2, rB3);
    this.scene.add(this.ribbonBGroup);
  }

  buildVertexMarkers() {
    this.markersGroup = new THREE.Group();

    // S (0,0), T (12,0), U (0,1), V (12,1)
    const vertices = [
      { id: 'S', pos: [0, 0, 0], color: 0x00e676, label: 'S (출발/분기)' },
      { id: 'T', pos: [12, 0, 0], color: 0xff1744, label: 'T (목적지)' },
      { id: 'U', pos: [0, 0, 1], color: 0xffb300, label: 'U (우회 모서리 1)' },
      { id: 'V', pos: [12, 0, 1], color: 0xffb300, label: 'V (우회 모서리 2)' },
    ];

    vertices.forEach(v => {
      // 바닥 원형 링
      const ringGeo = new THREE.RingGeometry(0.2, 0.35, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: v.color,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(v.pos[0], 0.025, v.pos[2]);
      this.markersGroup.add(ring);

      // 중심 점 구체
      const dotGeo = new THREE.SphereGeometry(0.08, 16, 16);
      const dotMat = new THREE.MeshBasicMaterial({ color: v.color });
      const dot = new THREE.Mesh(dotGeo, dotMat);
      dot.position.set(v.pos[0], 0.08, v.pos[2]);
      this.markersGroup.add(dot);
    });

    this.scene.add(this.markersGroup);
  }

  /**
   * 그래프 보기(S, T, U, V 정점 이름, 통로 연결, 이동시간, 회전시간, 추가대기) 오버레이
   */
  buildGraphOverlay() {
    this.graphOverlayGroup = new THREE.Group();

    // 1. 노드 라벨 스프라이트 (S, T, U, V)
    this.graphOverlayGroup.add(this.createTextSprite('S: (0, 0) 출발/분기', 0, 0.8, 0, '#00e676'));
    this.graphOverlayGroup.add(this.createTextSprite('T: (12, 0) 목적지', 12, 0.8, 0, '#ff1744'));
    this.graphOverlayGroup.add(this.createTextSprite('U: (0, 1)', 0, 0.8, 1, '#ffb300'));
    this.graphOverlayGroup.add(this.createTextSprite('V: (12, 1)', 12, 0.8, 1, '#ffb300'));

    // 2. 모서리 회전 시간 라벨 (U, V)
    this.graphOverlayGroup.add(this.createTextSprite('↶ 90° 회전 (0.5s)', 0, 0.4, 1.25, '#ffcc80', '#2a1a05'));
    this.graphOverlayGroup.add(this.createTextSprite('↷ 90° 회전 (0.5s)', 12, 0.4, 1.25, '#ffcc80', '#2a1a05'));

    // 3. 간선 이동 시간 라벨 (S-U: 1s, U-V: 12s, V-T: 1s)
    this.graphOverlayGroup.add(this.createTextSprite('1m (1.0s)', -0.6, 0.35, 0.5, '#ffd54f'));
    this.graphOverlayGroup.add(this.createTextSprite('12m 직진 통로 (12.0s 주행)', 6, 0.45, 1.0, '#ffa726'));
    this.graphOverlayGroup.add(this.createTextSprite('1m (1.0s)', 12.6, 0.35, 0.5, '#ffd54f'));

    // 4. 경로 A(직진) 소요 시간 동적 라벨 (대기시간 반영)
    this.edgeLabelSpriteA = this.createTextSprite('12m 직진 (12.0s) + 재확인 0.0s = 12.0s', 6, 0.45, 0, '#00e5ff');
    this.graphOverlayGroup.add(this.edgeLabelSpriteA);

    // 초기에는 숨김 상태
    this.graphOverlayGroup.visible = this.showGraph;
    this.scene.add(this.graphOverlayGroup);
  }

  /**
   * Canvas 2D 기반 고해상도 텍스트 스프라이트 생성기
   */
  createTextSprite(text, x, y, z, textColor = '#ffffff', bgColor = 'rgba(15, 23, 42, 0.85)') {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 512;
    canvas.height = 128;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 둥근 사각형 배경
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 4;
    const r = 16;
    const pad = 8;
    ctx.beginPath();
    ctx.roundRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, r);
    ctx.fill();
    ctx.stroke();

    // 텍스트 그리기
    ctx.fillStyle = textColor;
    ctx.font = 'bold 36px "Pretendard", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, z);
    sprite.scale.set(1.9, 0.48, 1);
    sprite.userData = { canvas, ctx, textColor, bgColor };
    return sprite;
  }

  updateEdgeSpriteA(d, totalA) {
    if (!this.edgeLabelSpriteA) return;
    const text = `12m 직진 (12.0s) + 재확인 ${d.toFixed(1)}s = ${totalA.toFixed(1)}s`;
    const { canvas, ctx, textColor, bgColor } = this.edgeLabelSpriteA.userData;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = bgColor;
    ctx.strokeStyle = textColor;
    ctx.lineWidth = 4;
    const pad = 8;
    ctx.beginPath();
    ctx.roundRect(pad, pad, canvas.width - pad * 2, canvas.height - pad * 2, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = textColor;
    ctx.font = 'bold 32px "Pretendard", "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);

    this.edgeLabelSpriteA.material.map.needsUpdate = true;
  }

  setGraphVisibility(visible) {
    this.showGraph = visible;
    if (this.graphOverlayGroup) {
      this.graphOverlayGroup.visible = visible;
    }
  }

  createAMR() {
    const amr = new THREE.Group();

    // 치수: 길이 0.75m, 폭 0.55m, 높이 0.32m
    const bodyGeo = new THREE.BoxGeometry(0.75, 0.22, 0.55);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // 슬레이트 다크
      roughness: 0.3,
      metalness: 0.5,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.16;
    body.castShadow = true;
    amr.add(body);

    // 상판 커버 (포인트 실버/화이트)
    const topPlateGeo = new THREE.BoxGeometry(0.70, 0.04, 0.50);
    const topPlateMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.2,
      metalness: 0.3
    });
    const topPlate = new THREE.Mesh(topPlateGeo, topPlateMat);
    topPlate.position.y = 0.29;
    topPlate.castShadow = true;
    amr.add(topPlate);

    // 라이다(LiDAR) 센서 터렛
    const lidarBaseGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 24);
    const lidarMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.8 });
    const lidarBase = new THREE.Mesh(lidarBaseGeo, lidarMat);
    lidarBase.position.set(0.18, 0.34, 0);
    amr.add(lidarBase);

    const lidarPuckGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.05, 24);
    const lidarPuckMat = new THREE.MeshStandardMaterial({ color: 0x00d2ff, roughness: 0.1, metalness: 0.9 });
    this.lidarSensor = new THREE.Mesh(lidarPuckGeo, lidarPuckMat);
    this.lidarSensor.position.set(0.18, 0.38, 0);
    amr.add(this.lidarSensor);

    // 좌우 메인 구동 바퀴
    const wheelGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.06, 24);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    const leftWheel = new THREE.Mesh(wheelGeo, wheelMat);
    leftWheel.rotation.x = Math.PI / 2;
    leftWheel.position.set(0, 0.09, 0.29);
    leftWheel.castShadow = true;

    const rightWheel = new THREE.Mesh(wheelGeo, wheelMat);
    rightWheel.rotation.x = Math.PI / 2;
    rightWheel.position.set(0, 0.09, -0.29);
    rightWheel.castShadow = true;

    amr.add(leftWheel, rightWheel);

    // 전면/후면 상태 LED 바
    const ledGeo = new THREE.BoxGeometry(0.04, 0.04, 0.44);
    this.statusLedMat = new THREE.MeshStandardMaterial({
      color: 0x00e676,
      emissive: 0x00e676,
      emissiveIntensity: 0.8,
    });
    this.statusLed = new THREE.Mesh(ledGeo, this.statusLedMat);
    this.statusLed.position.set(0.36, 0.20, 0);
    amr.add(this.statusLed);

    // 바닥 그림자 가짜 데칼 (더 부드러운 안착감)
    const shadowGeo = new THREE.PlaneGeometry(0.95, 0.7);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    const fakeShadow = new THREE.Mesh(shadowGeo, shadowMat);
    fakeShadow.rotation.x = -Math.PI / 2;
    fakeShadow.position.y = 0.006;
    amr.add(fakeShadow);

    // 초기 위치: S(0,0,0)
    amr.position.set(0, 0, 0);
    return amr;
  }

  setRobotLED(state = 'idle') {
    if (!this.statusLedMat) return;
    if (state === 'waiting') {
      // 대기/경고 (황색 점멸)
      this.statusLedMat.color.setHex(0xffab00);
      this.statusLedMat.emissive.setHex(0xffab00);
      this.statusLedMat.emissiveIntensity = 1.0;
    } else if (state === 'running') {
      // 주행 중 (녹색/시안)
      this.statusLedMat.color.setHex(0x00e676);
      this.statusLedMat.emissive.setHex(0x00e676);
      this.statusLedMat.emissiveIntensity = 0.9;
    } else if (state === 'turning') {
      // 회전 중 (시안 블루)
      this.statusLedMat.color.setHex(0x00d2ff);
      this.statusLedMat.emissive.setHex(0x00d2ff);
      this.statusLedMat.emissiveIntensity = 1.0;
    } else if (state === 'arrived') {
      // 도착 (화이트/바이올렛)
      this.statusLedMat.color.setHex(0x7c4dff);
      this.statusLedMat.emissive.setHex(0x7c4dff);
      this.statusLedMat.emissiveIntensity = 1.2;
    } else {
      // 기본 대기
      this.statusLedMat.color.setHex(0x64748b);
      this.statusLedMat.emissive.setHex(0x64748b);
      this.statusLedMat.emissiveIntensity = 0.3;
    }
  }

  /**
   * 경로 강조 상태 업데이트
   */
  updateRouteHighlight(activeRouteId, isTie, delaySec, totalTimeA) {
    this.activeRouteId = activeRouteId;
    this.isTie = isTie;
    this.currentDelay = delaySec;

    this.updateEdgeSpriteA(delaySec, totalTimeA);

    if (isTie) {
      // 동률: 둘 다 최대 강조
      this.ribbonA.material.opacity = 0.95;
      this.ribbonA.scale.set(1, 1.6, 1);
      this.ribbonBGroup.children.forEach(c => {
        c.material.opacity = 0.95;
      });
      this.ribbonBGroup.scale.set(1, 1, 1);
    } else if (activeRouteId === 'A') {
      // A 강조, B 흐리게
      this.ribbonA.material.opacity = 0.95;
      this.ribbonA.scale.set(1, 1.6, 1);
      this.ribbonBGroup.children.forEach(c => {
        c.material.opacity = 0.25;
      });
    } else {
      // B 강조, A 흐리게
      this.ribbonA.material.opacity = 0.25;
      this.ribbonA.scale.set(1, 1.0, 1);
      this.ribbonBGroup.children.forEach(c => {
        c.material.opacity = 0.95;
      });
    }
  }

  onWindowResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    if (this.camera && this.renderer) {
      this.camera.aspect = this.width / this.height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(this.width, this.height);
    }
  }

  animate(time) {
    requestAnimationFrame(this.animate);

    // 라이다 터렛 회전
    if (this.lidarSensor) {
      this.lidarSensor.rotation.y += 0.05;
    }

    // 선택 경로 펄스 애니메이션
    const pulse = 0.7 + Math.sin(time * 0.005) * 0.2;
    if (this.isTie) {
      this.ribbonA.material.opacity = pulse;
      this.ribbonBGroup.children.forEach(c => { c.material.opacity = pulse; });
    } else if (this.activeRouteId === 'A') {
      this.ribbonA.material.opacity = pulse;
    } else {
      this.ribbonBGroup.children.forEach(c => { c.material.opacity = pulse; });
    }

    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }
}
