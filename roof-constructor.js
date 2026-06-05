(function () {
  const canvas = document.querySelector("#roof-canvas");
  const viewer = document.querySelector("#roof-viewer");
  const form = document.querySelector("#roof-form");
  const sendButton = document.querySelector("#roof-send");
  const areaOutput = document.querySelector("#roof-area");
  const reserveOutput = document.querySelector("#roof-area-reserve");
  const angleOutput = document.querySelector("#roof-angle");
  const drainageOutput = document.querySelector("#roof-drainage");

  if (!canvas || !viewer || !form || !window.THREE) {
    if (viewer) viewer.textContent = "3D viewer unavailable";
    return;
  }

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const root = new THREE.Group();
  const modelGroup = new THREE.Group();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let pitch = -0.28;
  let cameraDistance = 20;
  let idleTimer = 0;
  let autoRotate = true;
  const IDLE_DELAY = 3000;
  let lastInteraction = 0;
  let pinchStartDist = 0;

  const materials = {
    wall: new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.58, metalness: 0.05 }),
    base: new THREE.MeshStandardMaterial({ color: 0x27323c, roughness: 0.7 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x88ccee, roughness: 0.05, metalness: 0.1, transmission: 0.6, thickness: 0.2, transparent: true, opacity: 0.7 }),
    roof: new THREE.MeshStandardMaterial({ color: 0xb92525, metalness: 0.32, roughness: 0.36, side: THREE.DoubleSide }),
    roofDark: new THREE.MeshStandardMaterial({ color: 0x841c1c, metalness: 0.34, roughness: 0.42, side: THREE.DoubleSide }),
    ridge: new THREE.MeshStandardMaterial({ color: 0xf2f4f6, metalness: 0.45, roughness: 0.32 }),
    edge: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 }),
    seam: new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.24 }),
    drain: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 0.72, roughness: 0.24 }),
    ground: new THREE.MeshStandardMaterial({ color: 0x101820, roughness: 0.9, transparent: true, opacity: 0.4 }),
    chimney: new THREE.MeshStandardMaterial({ color: 0x8b7355, roughness: 0.75, metalness: 0.02 }),
    door: new THREE.MeshStandardMaterial({ color: 0x3a2f28, roughness: 0.65, metalness: 0.05 }),
    windowFrame: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, metalness: 0.1 }),
  };

  const shapeLabels = {
    gable: "Casa simpla - 2 pante",
    hip: "Casa simpla - 4 pante",
    l: "Casa in L",
    t: "Casa in T",
  };

  const drainageLabels = {
    none: "fara sistem de scurgere",
    eaves: "sandrama / streasina",
    drainage: "scurgere",
    full: "sandrama + scurgere",
  };

  scene.add(root);
  root.add(modelGroup);
  scene.fog = new THREE.Fog(0x0d141b, 26, 52);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x26313c, 2.1));

  const mainLight = new THREE.DirectionalLight(0xffffff, 2.2);
  mainLight.position.set(8, 12, 8);
  mainLight.castShadow = true;
  mainLight.shadow.mapSize.width = 2048;
  mainLight.shadow.mapSize.height = 2048;
  mainLight.shadow.camera.near = 1;
  mainLight.shadow.camera.far = 60;
  mainLight.shadow.camera.left = -22;
  mainLight.shadow.camera.right = 22;
  mainLight.shadow.camera.top = 22;
  mainLight.shadow.camera.bottom = -22;
  scene.add(mainLight);

  const accentLight = new THREE.PointLight(0xdf2f2f, 2.2, 35);
  accentLight.position.set(-7, 5, 8);
  scene.add(accentLight);

  function updateCamera() {
    camera.position.set(0, 0, cameraDistance);
    camera.lookAt(0, 0, 0);
  }
  root.rotation.y = -0.55;
  root.rotation.x = pitch;
  root.position.y = 1;
  updateCamera();

  function numberValue(name, fallback) {
    const el = form.elements.namedItem(name);
    const value = el ? Number(el.value) : NaN;
    return Number.isFinite(value) ? value : fallback;
  }

  function selectedShape() {
    return form.elements.shape?.value || "gable";
  }

  function clearGroup(group) {
    while (group.children.length) {
      const child = group.children.pop();
      child.geometry?.dispose();
      if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    }
  }

  function addLine(group, points) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
    group.add(new THREE.Line(geometry, materials.edge));
  }

  function addSeam(group, points) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(...point)));
    group.add(new THREE.Line(geometry, materials.seam));
  }

  function addPlane(group, vertices, material = materials.roof) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.flat(), 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }

  function addBody(group, length, width, height, x = 0, z = 0, isMain = true) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(width, height, length), materials.wall);
    body.position.set(x, -height / 2, z);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.18, 0.18, length + 0.18), materials.base);
    plinth.position.set(x, -height - 0.09, z);
    plinth.receiveShadow = true;
    group.add(plinth);

    const windowCount = Math.max(2, Math.min(5, Math.round(length / 3.4)));
    for (let index = 0; index < windowCount; index += 1) {
      const offset = -length / 2 + ((index + 1) * length) / (windowCount + 1);
      const ww = 0.8;
      const wh = 0.55;
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, wh + 0.1, ww + 0.1), materials.windowFrame);
      frame.position.set(x + width / 2 + 0.04, -height * 0.48, z + offset);
      group.add(frame);
      const glass = new THREE.Mesh(new THREE.BoxGeometry(0.08, wh, ww), materials.glass);
      glass.position.set(x + width / 2 + 0.055, -height * 0.48, z + offset);
      glass.castShadow = true;
      group.add(glass);
      const backFrame = new THREE.Mesh(new THREE.BoxGeometry(0.06, wh + 0.1, ww + 0.1), materials.windowFrame);
      backFrame.position.set(x - width / 2 - 0.04, -height * 0.48, z + offset);
      group.add(backFrame);
      const backGlass = new THREE.Mesh(new THREE.BoxGeometry(0.08, wh, ww), materials.glass);
      backGlass.position.set(x - width / 2 - 0.055, -height * 0.48, z + offset);
      group.add(backGlass);
    }

    if (isMain) {
      const dw = 0.7;
      const dh = height * 0.72;
      const door = new THREE.Mesh(new THREE.BoxGeometry(dw, dh, 0.1), materials.door);
      door.position.set(x, -height + dh / 2, z + length / 2 + 0.06);
      door.castShadow = true;
      group.add(door);
      const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(dw + 0.12, dh + 0.06, 0.08), materials.windowFrame);
      doorFrame.position.set(x, -height + dh / 2, z + length / 2 + 0.04);
      group.add(doorFrame);
    }
  }

  function addChimney(group, ridgeHeight, width, length) {
    const cw = 0.4;
    const cd = 0.4;
    const ch = ridgeHeight * 0.55;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(cw, ch, cd), materials.chimney);
    chimney.position.set(width * 0.18, ridgeHeight * 0.55 + ch / 2, -length * 0.22);
    chimney.castShadow = true;
    group.add(chimney);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(cw + 0.1, 0.06, cd + 0.1), materials.base);
    cap.position.set(width * 0.18, ridgeHeight * 0.55 + ch, -length * 0.22);
    group.add(cap);
  }

  function addGroundGrid(group, bounds, houseHeight) {
    const gridHelper = new THREE.GridHelper(Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) * 2.2, 20, 0x1a2530, 0x111b24);
    gridHelper.position.y = -houseHeight - 0.2;
    gridHelper.position.x = (bounds.minX + bounds.maxX) / 2;
    gridHelper.position.z = (bounds.minZ + bounds.maxZ) / 2;
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.35;
    group.add(gridHelper);
  }

  function addPlatform(group, bounds, houseHeight) {
    const width = bounds.maxX - bounds.minX + 2.6;
    const length = bounds.maxZ - bounds.minZ + 2.6;
    const radius = Math.max(width, length) * 0.68;
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.04, 0.18, 96), materials.ground);
    platform.position.set((bounds.minX + bounds.maxX) / 2, -houseHeight - 0.18, (bounds.minZ + bounds.maxZ) / 2);
    platform.receiveShadow = true;
    group.add(platform);
  }

  function addRidgeCap(group, from, to) {
    const start = new THREE.Vector3(...from);
    const end = new THREE.Vector3(...to);
    const length = start.distanceTo(end);
    const center = start.clone().lerp(end, 0.5);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, length, 18), materials.ridge);
    cap.position.copy(center);
    cap.rotation.set(Math.PI / 2, 0, 0);
    cap.castShadow = true;
    group.add(cap);
  }

  function addRoofSeams(group, eaveA, eaveB, ridgeA, ridgeB, count) {
    for (let index = 1; index < count; index += 1) {
      const t = index / count;
      const start = [
        eaveA[0] + (eaveB[0] - eaveA[0]) * t,
        eaveA[1] + (eaveB[1] - eaveA[1]) * t,
        eaveA[2] + (eaveB[2] - eaveA[2]) * t,
      ];
      const end = [
        ridgeA[0] + (ridgeB[0] - ridgeA[0]) * t,
        ridgeA[1] + (ridgeB[1] - ridgeA[1]) * t,
        ridgeA[2] + (ridgeB[2] - ridgeA[2]) * t,
      ];
      addSeam(group, [start, end]);
    }
  }

  function setRoofMaterial(materialName) {
    const colors = {
      "Tigla metalica": [0xb92525, 0x7f1d1d],
      "Tigla metalica modulara": [0x1f5f99, 0x173f66],
      "Tigla bituminoasa": [0x343a40, 0x20252b],
      "Tabla profilata": [0x5b6670, 0x3d464e],
      "Panouri sandwich acoperis": [0x173a5e, 0x102a45],
    };
    const [main, dark] = colors[materialName] || colors["Tigla metalica"];
    materials.roof.color.setHex(main);
    materials.roofDark.color.setHex(dark);
  }

  function addGable(group, length, width, ridgeHeight, overhang, x = 0, z = 0, rotate = false) {
    const axisLength = length + overhang * 2;
    const span = width + overhang * 2;
    const halfAxis = axisLength / 2;
    const halfSpan = span / 2;
    const z1 = z - halfAxis;
    const z2 = z + halfAxis;
    const x1 = x - halfSpan;
    const x2 = x + halfSpan;
    const ridgeA = [x, ridgeHeight, z1];
    const ridgeB = [x, ridgeHeight, z2];
    const leftA = [x1, 0, z1];
    const leftB = [x1, 0, z2];
    const rightA = [x2, 0, z1];
    const rightB = [x2, 0, z2];

    if (rotate) {
      return addGable(group, width, length, ridgeHeight, overhang, x, z, false);
    }

    addPlane(group, [leftA, ridgeA, ridgeB, leftB], materials.roof);
    addPlane(group, [ridgeA, rightA, rightB, ridgeB], materials.roofDark);
    addRoofSeams(group, leftA, leftB, ridgeA, ridgeB, Math.max(5, Math.round(axisLength / 1.3)));
    addRoofSeams(group, rightA, rightB, ridgeA, ridgeB, Math.max(5, Math.round(axisLength / 1.3)));
    addLine(group, [leftA, ridgeA, rightA]);
    addLine(group, [leftB, ridgeB, rightB]);
    addLine(group, [ridgeA, ridgeB]);
    addRidgeCap(group, ridgeA, ridgeB);
    addLine(group, [leftA, leftB]);
    addLine(group, [rightA, rightB]);
  }

  function addHip(group, length, width, ridgeHeight, overhang, x = 0, z = 0) {
    const totalLength = length + overhang * 2;
    const totalWidth = width + overhang * 2;
    const halfL = totalLength / 2;
    const halfW = totalWidth / 2;
    const ridgeHalf = Math.max(0.4, (totalLength - totalWidth * 0.7) / 2);
    const ridgeA = [x, ridgeHeight, z - ridgeHalf];
    const ridgeB = [x, ridgeHeight, z + ridgeHalf];
    const p1 = [x - halfW, 0, z - halfL];
    const p2 = [x + halfW, 0, z - halfL];
    const p3 = [x + halfW, 0, z + halfL];
    const p4 = [x - halfW, 0, z + halfL];

    addPlane(group, [p1, ridgeA, ridgeB, p4], materials.roof);
    addPlane(group, [ridgeA, p2, p3, ridgeB], materials.roofDark);
    addPlane(group, [p1, p2, ridgeA, ridgeA], materials.roof);
    addPlane(group, [ridgeB, p3, p4, ridgeB], materials.roofDark);
    [p1, p2, p3, p4].forEach((point) => addLine(group, [point, point[2] < z ? ridgeA : ridgeB]));
    addLine(group, [ridgeA, ridgeB]);
    addRidgeCap(group, ridgeA, ridgeB);
    addLine(group, [p1, p2, p3, p4, p1]);
  }

  function addDrainage(group, bounds, enabled) {
    if (!enabled) return 0;

    const { minX, maxX, minZ, maxZ } = bounds;
    const y = -0.08;
    const diameter = 0.08;
    const lengthX = maxX - minX;
    const lengthZ = maxZ - minZ;
    const gutterLength = lengthX * 2 + lengthZ * 2;
    const cylinderMaterial = materials.drain;

    [
      { position: [0, y, minZ], rotation: [0, 0, Math.PI / 2], length: lengthX },
      { position: [0, y, maxZ], rotation: [0, 0, Math.PI / 2], length: lengthX },
      { position: [minX, y, 0], rotation: [Math.PI / 2, 0, 0], length: lengthZ },
      { position: [maxX, y, 0], rotation: [Math.PI / 2, 0, 0], length: lengthZ },
    ].forEach((item) => {
      const gutter = new THREE.Mesh(new THREE.CylinderGeometry(diameter, diameter, item.length, 16), cylinderMaterial);
      gutter.position.set(...item.position);
      gutter.rotation.set(...item.rotation);
      gutter.castShadow = true;
      group.add(gutter);
    });

    [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]].forEach(([x, z]) => {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(diameter * 0.8, diameter * 0.8, 2.2, 16), cylinderMaterial);
      pipe.position.set(x, -1.2, z);
      pipe.castShadow = true;
      group.add(pipe);
    });

    return gutterLength;
  }

  function buildModel() {
    const shape = selectedShape();
    const length = numberValue("length", 12);
    const width = numberValue("width", 8);
    const wingLength = numberValue("wingLength", 7);
    const wingWidth = numberValue("wingWidth", 4);
    const ridgeHeight = numberValue("height", 2.5);
    const overhang = numberValue("overhang", 0.4);
    const reserve = numberValue("reserve", 10);
    const material = form.elements.material.value;
    const drainageMode = form.elements.drainage.value;
    const houseHeight = Math.max(1.6, Math.min(4, ridgeHeight * 0.9));
    const footprintMain = length * width;
    const footprintWing = shape === "l" || shape === "t" ? wingLength * wingWidth : 0;
    const shapeCoefficient = { gable: 1, hip: 1.08, l: 1.22, t: 1.3 }[shape];
    const totalHalfWidth = width / 2 + overhang;
    const slopeLength = Math.sqrt(totalHalfWidth ** 2 + ridgeHeight ** 2);
    const baseArea = 2 * (length + overhang * 2) * slopeLength;
    const wingArea = footprintWing ? 2 * (wingLength + overhang * 2) * Math.sqrt((wingWidth / 2 + overhang) ** 2 + ridgeHeight ** 2) : 0;
    const roofArea = (baseArea + wingArea) * (shape === "hip" ? 1.08 : 1) * (shape === "t" ? 1.06 : 1);
    const roofWithReserve = roofArea * (1 + reserve / 100);
    const angle = Math.atan(ridgeHeight / totalHalfWidth) * (180 / Math.PI);
    const drainageEnabled = drainageMode === "drainage" || drainageMode === "full";
    const eavesEnabled = drainageMode === "eaves" || drainageMode === "full";
    const bounds = {
      minX: -width / 2 - overhang - (shape === "l" ? wingWidth : 0),
      maxX: width / 2 + overhang + (shape === "t" ? wingWidth / 2 : 0),
      minZ: -length / 2 - overhang,
      maxZ: length / 2 + overhang + (shape === "l" || shape === "t" ? wingLength / 2 : 0),
    };

    clearGroup(modelGroup);
    setRoofMaterial(material);
    addGroundGrid(modelGroup, bounds, houseHeight);
    addPlatform(modelGroup, bounds, houseHeight);
    addBody(modelGroup, length, width, houseHeight, 0, 0, true);

    if (shape === "hip") {
      addHip(modelGroup, length, width, ridgeHeight, overhang);
    } else {
      addGable(modelGroup, length, width, ridgeHeight, overhang);
    }

    if (shape === "l") {
      addBody(modelGroup, wingLength, wingWidth, houseHeight, -width / 2 - wingWidth / 2, length / 2 - wingLength / 2, false);
      addGable(modelGroup, wingLength, wingWidth, ridgeHeight * 0.88, overhang, -width / 2 - wingWidth / 2, length / 2 - wingLength / 2, true);
    }

    if (shape === "t") {
      addBody(modelGroup, wingLength, wingWidth, houseHeight, 0, length / 2 - wingLength / 2, false);
      addHip(modelGroup, wingLength, wingWidth, ridgeHeight * 0.88, overhang, 0, length / 2 - wingLength / 2);
    }

    const drainageLength = addDrainage(modelGroup, bounds, drainageEnabled);
    const eavesLength = eavesEnabled ? (bounds.maxX - bounds.minX) * 2 + (bounds.maxZ - bounds.minZ) * 2 : 0;
    const downpipeCount = drainageEnabled ? 4 : 0;
    addChimney(modelGroup, ridgeHeight, width, length);

    const modelSpan = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, ridgeHeight * 2);
    cameraDistance = Math.max(14, modelSpan * 1.5);
    updateCamera();

    areaOutput.textContent = `${roofArea.toFixed(1)} m2`;
    reserveOutput.textContent = `${roofWithReserve.toFixed(1)} m2`;
    angleOutput.textContent = `${angle.toFixed(0)}°`;
    drainageOutput.textContent = drainageEnabled ? `${drainageLength.toFixed(1)} ml` : "0 ml";

    const valLength = document.querySelector("#val-length");
    const valWidth = document.querySelector("#val-width");
    const valWingLength = document.querySelector("#val-wingLength");
    const valWingWidth = document.querySelector("#val-wingWidth");
    const valHeight = document.querySelector("#val-height");
    const valOverhang = document.querySelector("#val-overhang");
    const valReserve = document.querySelector("#val-reserve");

    if (valLength) valLength.textContent = `${length} m`;
    if (valWidth) valWidth.textContent = `${width} m`;
    if (valWingLength) valWingLength.textContent = `${wingLength} m`;
    if (valWingWidth) valWingWidth.textContent = `${wingWidth} m`;
    if (valHeight) valHeight.textContent = `${ridgeHeight} m`;
    if (valOverhang) valOverhang.textContent = `${overhang} m`;
    if (valReserve) valReserve.textContent = `${reserve} %`;

    const wingLengthInput = form.elements.namedItem("wingLength");
    const wingWidthInput = form.elements.namedItem("wingWidth");
    if (wingLengthInput && wingWidthInput) {
      const showWings = shape === "l" || shape === "t";
      wingLengthInput.parentElement.style.display = showWings ? "" : "none";
      wingWidthInput.parentElement.style.display = showWings ? "" : "none";
    }

    form.dataset.roofSummary = [
      "Configuratie 3D acoperis",
      `Forma: ${shapeLabels[shape]}`,
      `Material: ${material}`,
      `Corp principal: ${length} x ${width} m`,
      shape === "l" || shape === "t" ? `Aripa secundara: ${wingLength} x ${wingWidth} m` : "",
      `Amprenta: ${(footprintMain + footprintWing).toFixed(1)} m2`,
      `Streasina: ${overhang} m`,
      `Inaltime coama: ${ridgeHeight} m`,
      `Unghi aproximativ: ${angle.toFixed(0)}°`,
      `Suprafata acoperis: ${roofArea.toFixed(1)} m2`,
      `Rezerva material: ${reserve}%`,
      `Suprafata cu rezerva: ${roofWithReserve.toFixed(1)} m2`,
      `Sistem ales: ${drainageLabels[drainageMode] || drainageMode}`,
      eavesEnabled ? `Sandrama / streasina: ${eavesLength.toFixed(1)} metri liniari` : "",
      drainageEnabled ? `Jgheaburi / scurgere: ${drainageLength.toFixed(1)} metri liniari` : "",
      drainageEnabled ? `Burlane estimate: ${downpipeCount} buc` : "",
    ].filter(Boolean).join("\n");
  }

  let isVisible = false;
  let animationFrameId = null;

  const visibilityObserver = new IntersectionObserver(
    (entries) => {
      isVisible = entries[0].isIntersecting;
      if (isVisible && !animationFrameId) {
        animate();
      }
    },
    { threshold: 0.05 }
  );
  visibilityObserver.observe(viewer);

  function resize() {
    const width = Math.max(320, viewer.clientWidth);
    const height = Math.max(320, viewer.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function animate() {
    if (!isVisible) {
      animationFrameId = null;
      return;
    }

    const now = Date.now();
    if (!dragging && now - lastInteraction > IDLE_DELAY) {
      root.rotation.y += 0.003;
    }

    renderer.render(scene, camera);
    animationFrameId = requestAnimationFrame(animate);
  }

  canvas.addEventListener("pointerdown", (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    lastInteraction = Date.now();
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    root.rotation.y += dx * 0.008;
    pitch = Math.max(-0.75, Math.min(0.12, pitch + dy * 0.005));
    root.rotation.x = pitch;
    lastInteraction = Date.now();
  });

  canvas.addEventListener("pointerup", () => {
    dragging = false;
    lastInteraction = Date.now();
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    cameraDistance = Math.max(8, Math.min(45, cameraDistance + event.deltaY * 0.02));
    updateCamera();
    lastInteraction = Date.now();
  }, { passive: false });

  canvas.addEventListener("touchstart", (event) => {
    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      pinchStartDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });

  canvas.addEventListener("touchmove", (event) => {
    if (event.touches.length === 2) {
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = pinchStartDist - dist;
      cameraDistance = Math.max(8, Math.min(45, cameraDistance + delta * 0.06));
      pinchStartDist = dist;
      updateCamera();
      lastInteraction = Date.now();
    }
  }, { passive: true });

  form.addEventListener("input", buildModel);
  form.addEventListener("change", buildModel);

  // Accordion Next Step Logic
  const nextButtons = form.querySelectorAll("[data-next-step]");
  nextButtons.forEach(button => {
    button.addEventListener("click", () => {
      const currentDetails = button.closest("details");
      if (currentDetails) {
        currentDetails.removeAttribute("open");
        const nextDetails = currentDetails.nextElementSibling;
        if (nextDetails && nextDetails.tagName === "DETAILS") {
          nextDetails.setAttribute("open", "");
          nextDetails.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });
  });

  // Ensure accordion only has one open at a time (optional UX enhancement)
  const allDetails = form.querySelectorAll("details.cfg-step");
  allDetails.forEach(details => {
    details.addEventListener("toggle", (e) => {
      if (details.open) {
        allDetails.forEach(other => {
          if (other !== details && other.open) {
            other.removeAttribute("open");
          }
        });
      }
    });
  });

  sendButton.addEventListener("click", () => {
    // Add hidden input for payload if it doesn't exist
    let payloadInput = document.querySelector(".offer-form input[name='roofPayload']");
    if (!payloadInput) {
      payloadInput = document.createElement("input");
      payloadInput.type = "hidden";
      payloadInput.name = "roofPayload";
      document.querySelector(".offer-form").appendChild(payloadInput);
    }
    
    const quantity = document.querySelector(".offer-form input[name='quantity']");
    payloadInput.value = form.dataset.roofSummary || "";
    if (quantity) quantity.value = reserveOutput.textContent;
    
    window.openLeadForm?.();
  });

  window.addEventListener("resize", resize);
  resize();
  buildModel();
  animate();
})();
