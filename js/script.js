import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { gsap } from "gsap";
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

// --- THEME COLORS ---
const themes = {
    red: {
        mainNeon: new THREE.Color("#ff0000"),
        lightNeon: new THREE.Color("#ff4d4d"),
        lighterNeon: new THREE.Color("#ffaaaa"),
        suit: new THREE.Color("#8B0000"),
        bg: new THREE.Color("#220000"),
        fog: new THREE.Color("#440000"),
        cloud: { r: 50, g: 0, b: 0 },
        css: {
            main: '#ff0000', main_rgb: '255, 0, 0',
            light: '#ff4d4d', lighter: '#ffaaaa'
        }
    },
    blue: {
        mainNeon: new THREE.Color("#00aeff"),
        lightNeon: new THREE.Color("#61daff"),
        lighterNeon: new THREE.Color("#a3e6ff"),
        suit: new THREE.Color("#003366"),
        bg: new THREE.Color("#001a22"),
        fog: new THREE.Color("#002244"),
        cloud: { r: 0, g: 20, b: 50 },
        css: {
            main: '#00aeff', main_rgb: '0, 174, 255',
            light: '#61daff', lighter: '#a3e6ff'
        }
    }
};

// --- BACKGROUND SCENE (MODIFIED FOR THEME) ---
const bg_isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
let bg_scene, bg_camera, bg_renderer, bg_composer;
const bg_clock = new THREE.Clock();
let bg_characterGroup, bg_head, bg_torso, bg_leftArm, bg_rightArm, bg_leftLeg, bg_rightLeg, bg_mouth;
let bg_suitMaterial, bg_rimLight1, bg_rimLight2;
let bg_poses = [], bg_currentPoseIndex = 0, bg_nextPoseIndex = 1, bg_poseStartTime = 0;
const bg_poseTransitionDuration = 1.0, bg_poseHoldDuration = 2.0;
let bg_cubeCamera, bg_cubeRenderTarget;
let bg_cameraShots = [], bg_currentShotIndex = 0;
let bg_cloudParticles, bg_windowsTextureCanvas, bg_cloudTextureCanvas;
let bg_hBlurPass, bg_vBlurPass;

// PERFORMANCE OPTIMIZATIONS
const buildingCount = bg_isMobile ? 80 : 150;
const particleCount = bg_isMobile ? 80 : 120;


function bg_init() {
    if (typeof THREE === 'undefined') {
        document.getElementById('loadingOverlay').innerHTML = 'Error: Could not load 3D library.';
        return;
    }
    bg_scene = new THREE.Scene();
    bg_scene.background = themes.red.bg.clone();
    bg_scene.fog = new THREE.Fog(themes.red.fog.getHex(), 20, 100);
    bg_camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
    bg_renderer = new THREE.WebGLRenderer({ antialias: !bg_isMobile });
    bg_renderer.shadowMap.enabled = false;
    bg_renderer.setPixelRatio(bg_isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio);
    bg_renderer.setSize(window.innerWidth, window.innerHeight);
    bg_renderer.toneMapping = THREE.ACESFilmicToneMapping;
    bg_renderer.toneMappingExposure = 1.2;
    document.getElementById('background-canvas').appendChild(bg_renderer.domElement);

    bg_composer = new EffectComposer(bg_renderer);
    const renderPass = new RenderPass(bg_scene, bg_camera);
    bg_composer.addPass(renderPass);

    bg_hBlurPass = new ShaderPass(HorizontalBlurShader);
    bg_hBlurPass.uniforms.h.value = 2 / window.innerWidth;
    bg_vBlurPass = new ShaderPass(VerticalBlurShader);
    bg_vBlurPass.uniforms.v.value = 2 / window.innerHeight;

    const reflectionResolution = bg_isMobile ? 128 : 256;
    bg_cubeRenderTarget = new THREE.WebGLCubeRenderTarget(reflectionResolution, { format: THREE.RGBFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    bg_cubeCamera = new THREE.CubeCamera(0.1, 100, bg_cubeRenderTarget);
    bg_cubeCamera.position.set(-1.5, 2.01, 0);
    bg_scene.add(bg_cubeCamera);
    bg_createInfiniteFloor();
    const characterScale = 0.06;
    bg_characterGroup = new THREE.Group();
    bg_characterGroup.scale.set(characterScale, characterScale, characterScale);
    bg_characterGroup.position.set(-1.5, 0.03, 0);
    bg_characterGroup.rotation.y = Math.PI / 2;
    bg_scene.add(bg_characterGroup);
    bg_createStudioLighting();
    bg_createFullCharacter();
    bg_createCityscape();
    bg_createClouds();
    const micGroup = new THREE.Group();
    micGroup.name = "MIC";
    micGroup.scale.set(characterScale, characterScale, characterScale);
    micGroup.position.set(0, 0, 0);
    micGroup.rotation.y = Math.PI;
    bg_scene.add(micGroup);
    bg_createMicrophone();
    bg_definePoses();
    bg_poseStartTime = bg_clock.getElapsedTime();
    bg_defineCameraShots();
    
    setTimeout(() => {
        const transitionOverlay = document.getElementById('transitionOverlay');
        new TWEEN.Tween({ opacity: 1 }).to({ opacity: 0 }, 1000).easing(TWEEN.Easing.Quadratic.InOut).onUpdate((obj) => {
            transitionOverlay.style.opacity = obj.opacity;
        }).start();
    }, 500);
    
    bg_playShot(bg_currentShotIndex);
    window.addEventListener('resize', bg_onWindowResize, false);
    document.getElementById('loadingOverlay').style.display = 'none';
    bg_animate();
}
function bg_updateCubeCamera() { if (bg_cubeCamera) { const glassesGroup = bg_scene.getObjectByName("Head")?.children.find(c => c.children[0]?.material.envMap); if (glassesGroup) glassesGroup.visible = false; bg_cubeCamera.update(bg_renderer, bg_scene); if (glassesGroup) glassesGroup.visible = true; } }
function bg_createInfiniteFloor() { const floorMaterial = new THREE.MeshStandardMaterial({ color: 0x080808, metalness: 0.1, roughness: 0.9, }); const floorGeometry = new THREE.PlaneGeometry(1000, 1000); const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = 0; floor.receiveShadow = false; floor.renderOrder = -1; bg_scene.add(floor); }
function bg_createStudioLighting() { const ambientLight = new THREE.AmbientLight(0xffffff, 0.2); bg_scene.add(ambientLight); const keyLight = new THREE.SpotLight(0xffffff, 1.0, 100, Math.PI / 4, 1.0, 2); keyLight.position.set(8, 6, 8); keyLight.target = bg_characterGroup; bg_scene.add(keyLight); bg_rimLight1 = new THREE.SpotLight(themes.red.mainNeon, 3.0, 100, Math.PI / 6, 1.0, 2); bg_rimLight1.position.set(-8, 8, -10); bg_rimLight1.target = bg_characterGroup; bg_scene.add(bg_rimLight1); bg_rimLight2 = new THREE.SpotLight(themes.red.mainNeon, 3.0, 100, Math.PI / 6, 1.0, 2); bg_rimLight2.position.set(0, 8, -12); bg_rimLight2.target = bg_characterGroup; bg_scene.add(bg_rimLight2); }
function bg_createFullCharacter() { const mainGroup = new THREE.Group(); mainGroup.position.y = 28.5; bg_characterGroup.add(mainGroup); const skinMaterial = new THREE.MeshStandardMaterial({ color: '#4a2a15', roughness: 0.5 }); bg_suitMaterial = new THREE.MeshStandardMaterial({ color: themes.red.suit, roughness: 0.5 }); const blackShirtMaterial = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.95 }); const shoeMaterial = new THREE.MeshStandardMaterial({ color: '#1C1C1C', roughness: 0.2, metalness: 0.1 }); bg_torso = new THREE.Mesh(new THREE.BoxGeometry(24, 18, 14), bg_suitMaterial); mainGroup.add(bg_torso); const shirtVGeom = new THREE.Shape(); shirtVGeom.moveTo(-6, 9); shirtVGeom.lineTo(6, 9); shirtVGeom.lineTo(0, -5); shirtVGeom.lineTo(-6, 9); const shirtV = new THREE.Mesh(new THREE.ExtrudeGeometry(shirtVGeom, { depth: 0.1, bevelEnabled: false }), blackShirtMaterial); shirtV.position.z = 7.01; bg_torso.add(shirtV); bg_head = new THREE.Group(); bg_head.name = "Head"; bg_head.position.y = 14; bg_createHead(bg_head, skinMaterial); bg_torso.add(bg_head); bg_leftArm = bg_createLimb(18, -1, false, skinMaterial, bg_suitMaterial, shoeMaterial); bg_rightArm = bg_createLimb(18, 1, false, skinMaterial, bg_suitMaterial, shoeMaterial); bg_torso.add(bg_leftArm, bg_rightArm); bg_leftLeg = bg_createLimb(18 * 1.2, -1, true, skinMaterial, bg_suitMaterial, shoeMaterial); bg_rightLeg = bg_createLimb(18 * 1.2, 1, true, skinMaterial, bg_suitMaterial, shoeMaterial); mainGroup.add(bg_leftLeg, bg_rightLeg); }
function bg_createLimb(height, side, isLeg, skinMat, clothingMat, shoeMat) { const limbGroup = new THREE.Group(); if (isLeg) { const leg = new THREE.Mesh(new THREE.BoxGeometry(8, height, 9), clothingMat); leg.position.y = -height / 2; limbGroup.add(leg); const shoe = new THREE.Mesh(new THREE.BoxGeometry(8.2, 2, 11), shoeMat); shoe.position.set(0, -height / 2 - 1, 1); leg.add(shoe); } else { const sleeve = new THREE.Mesh(new THREE.BoxGeometry(6, height * 0.8, 7), clothingMat); sleeve.position.y = -(height * 0.8) / 2; limbGroup.add(sleeve); const hand = new THREE.Mesh(new THREE.BoxGeometry(6, height * 0.2, 7), skinMat); hand.position.y = -(height * 0.8) - (height * 0.2) / 2; limbGroup.add(hand); } limbGroup.position.set(isLeg ? 7 * side : 15 * side, isLeg ? -9 : 9, 0); return limbGroup; }
function bg_createHead(headGroup, skinMaterial) { headGroup.add(new THREE.Mesh(new THREE.BoxGeometry(16, 16, 12), skinMaterial)); const neck = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2, 16), skinMaterial); neck.position.y = -9; headGroup.add(neck); bg_createSunglasses(headGroup); const earGeom = new THREE.BoxGeometry(2, 4, 2); const leftEar = new THREE.Mesh(earGeom, skinMaterial); leftEar.position.set(-9, 0, 0); const rightEar = leftEar.clone(); rightEar.position.x = 9; headGroup.add(leftEar, rightEar); bg_createBeard(headGroup); bg_mouth = bg_createMouth(headGroup); bg_createCap(headGroup); }
function bg_createSunglasses(headGroup) { const glassesMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, metalness: 0.95, roughness: 0.05, transparent: true, opacity: 0.8, envMap: bg_cubeRenderTarget.texture, envMapIntensity: 1 }); const glassesGroup = new THREE.Group(); glassesGroup.position.set(0, 3, 6.01); const lensGeom = new THREE.BoxGeometry(6, 4, 1); const leftLens = new THREE.Mesh(lensGeom, glassesMaterial); leftLens.position.x = -3.5; const rightLens = new THREE.Mesh(lensGeom, glassesMaterial); rightLens.position.x = 3.5; const bridge = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), glassesMaterial); glassesGroup.add(leftLens, rightLens, bridge); headGroup.add(glassesGroup); }
function bg_createBeard(headGroup) { const beardMaterial = new THREE.MeshStandardMaterial({ color: '#1A1A1A', roughness: 0.85 }); const beardGroup = new THREE.Group(); const mainBeard = new THREE.Mesh(new THREE.BoxGeometry(16.2, 8, 10), beardMaterial); mainBeard.position.set(0, -6, 4); const mustache = new THREE.Mesh(new THREE.BoxGeometry(14, 3, 3), beardMaterial); mustache.position.set(0, -2.5, 7.01); beardGroup.add(mainBeard, mustache); headGroup.add(beardGroup); }
function bg_createMouth(headGroup) { const mouthMesh = new THREE.Mesh(new THREE.BoxGeometry(7, 2, 1), new THREE.MeshBasicMaterial({ color: '#FFFFFF' })); mouthMesh.position.set(0, -5.01, 8.6); headGroup.add(mouthMesh); return mouthMesh; }
function bg_createCap(headGroup) { const capMaterial = new THREE.MeshStandardMaterial({ color: '#111111', roughness: 1.0 }); const capGroup = new THREE.Group(); const mainPart = new THREE.Mesh(new THREE.BoxGeometry(16.2, 4, 12.2), capMaterial); mainPart.position.y = 10.01; const brim = new THREE.Mesh(new THREE.BoxGeometry(16.2, 1, 6), capMaterial); brim.position.set(0, 8.01, 6.1); capGroup.add(mainPart, brim); headGroup.add(capGroup); }
function bg_createMicrophone() { const micGroup = bg_scene.getObjectByName("MIC"); const standMaterial = new THREE.MeshStandardMaterial({ color: '#999999', metalness: 1.0, roughness: 0.15 }); const micBodyMaterial = new THREE.MeshStandardMaterial({ color: '#111111', metalness: 0.5, roughness: 0.4 }); const micRingMaterial = new THREE.MeshStandardMaterial({ color: '#222222', metalness: 0.2, roughness: 0.8 }); const filterMeshMat = new THREE.MeshStandardMaterial({ color: 0x101010, transparent: true, opacity: 0.6, side: THREE.DoubleSide, metalness: 0.1, roughness: 0.9 }); const base = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 1, 32), standMaterial); base.position.y = 0.5; micGroup.add(base); const poleHeight = 40; const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, poleHeight, 16), standMaterial); pole.position.y = poleHeight / 2 + 1; micGroup.add(pole); const micBody = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 6, 16), micBodyMaterial); micBody.position.y = poleHeight + 1; micGroup.add(micBody); const popFilterAssembly = new THREE.Group(); micGroup.add(popFilterAssembly); popFilterAssembly.position.y = poleHeight - 8; const gooseneckLengthX = 8; const gooseneckEndPointY = 2; const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(gooseneckLengthX * 0.3, -1.5, 0), new THREE.Vector3(gooseneckLengthX * 0.7, 0.5, 0), new THREE.Vector3(gooseneckLengthX, gooseneckEndPointY, 0)]); const gooseneckGeom = new THREE.TubeGeometry(curve, 20, 0.3, 8, false); const gooseneck = new THREE.Mesh(gooseneckGeom, standMaterial); popFilterAssembly.add(gooseneck); const gooseneckEndPoint = curve.getPoint(1); const filterRing = new THREE.Mesh(new THREE.TorusGeometry(5, 0.3, 16, 100), micRingMaterial); const filterMesh = new THREE.Mesh(new THREE.CircleGeometry(5, 32), filterMeshMat); const filterElementsGroup = new THREE.Group(); filterElementsGroup.add(filterRing, filterMesh); filterElementsGroup.rotation.set(Math.PI / 2, Math.PI / 2, 0); filterElementsGroup.position.set(0, 5, 0); const popFilterGroup = new THREE.Group(); popFilterGroup.position.copy(gooseneckEndPoint); popFilterGroup.add(filterElementsGroup); popFilterAssembly.add(popFilterGroup); }
function bg_definePoses() { bg_poses = [{ leftArm: { x: 0, z: 0 }, rightArm: { x: 0, z: 0 }, torso: { y: 0, z: 0 } }, { leftArm: { x: -0.2, z: 0.1 }, rightArm: { x: -0.2, z: -0.1 }, torso: { y: 0, z: 0.1 } }, { leftArm: { x: -0.8, z: 0.5 }, rightArm: { x: 0, z: 0 }, torso: { y: 0.1, z: 0 } }, { leftArm: { x: 0.1, z: -0.1 }, rightArm: { x: 0.1, z: 0.1 }, torso: { y: 0, z: -0.1 } }, { leftArm: { x: -0.3, z: -0.1 }, rightArm: { x: -0.6, z: -0.4 }, torso: { y: -0.05, z: 0.05 } }]; }
function bg_defineCameraShots() { const charHeadPos = new THREE.Vector3(-1.5, 2.5, 0); const charBodyPos = new THREE.Vector3(-1.5, 1.8, 0); const micPos = new THREE.Vector3(0, 2.5, 0); bg_cameraShots = [{ startPos: new THREE.Vector3(12, 4, 0), endPos: new THREE.Vector3(5, 3, 0), startTarget: charBodyPos, endTarget: charBodyPos }, { startPos: new THREE.Vector3(-8, 7, -8), endPos: new THREE.Vector3(-5, 5, -5), startTarget: charHeadPos, endTarget: charHeadPos }, { startPos: new THREE.Vector3(-1.5, 2.2, 3), endPos: new THREE.Vector3(0.5, 2.2, 3), startTarget: charHeadPos, endTarget: charHeadPos }, { startPos: new THREE.Vector3(-5, 2.2, -6), endPos: new THREE.Vector3(2, 2.2, -6), startTarget: charBodyPos, endTarget: charBodyPos }, { startPos: new THREE.Vector3(0, 1, -8), endPos: new THREE.Vector3(0, 1.5, -4), startTarget: charBodyPos, endTarget: charBodyPos }, { startPos: new THREE.Vector3(3, 2.5, 3), endPos: new THREE.Vector3(3, 2.5, 3), startTarget: micPos, endTarget: charHeadPos }, { startPos: new THREE.Vector3(5, 2.5, -5), endPos: new THREE.Vector3(-5, 2.5, -5), startTarget: charBodyPos, endTarget: charBodyPos, dutchAngle: 0.2 }, { startPos: new THREE.Vector3(-0.5, 2, 2.5), endPos: new THREE.Vector3(-8, 4, 8), startTarget: charHeadPos, endTarget: charBodyPos }, { startPos: new THREE.Vector3(0, 12, 0), endPos: new THREE.Vector3(0, 7, 0), startTarget: charBodyPos, endTarget: charBodyPos }]; }
function bg_playShot(shotIndex) { const shot = bg_cameraShots[shotIndex]; const duration = 8000; bg_camera.position.copy(shot.startPos); const currentTarget = new THREE.Vector3().copy(shot.startTarget); bg_camera.lookAt(currentTarget); bg_camera.rotation.z = shot.dutchAngle || 0; new TWEEN.Tween(bg_camera.position).to(shot.endPos, duration).easing(TWEEN.Easing.Quadratic.InOut).start(); new TWEEN.Tween(currentTarget).to(shot.endTarget, duration).easing(TWEEN.Easing.Quadratic.InOut).onUpdate(() => { bg_camera.lookAt(currentTarget); }).onComplete(() => { bg_transitionToNextShot(); }).start(); }
function bg_transitionToNextShot() { const transitionOverlay = document.getElementById('transitionOverlay'); new TWEEN.Tween({ opacity: 0 }).to({ opacity: 1 }, 500).easing(TWEEN.Easing.Quadratic.Out).onUpdate((obj) => { transitionOverlay.style.opacity = obj.opacity; }).onComplete(() => { bg_currentShotIndex = (bg_currentShotIndex + 1) % bg_cameraShots.length; bg_playShot(bg_currentShotIndex); new TWEEN.Tween({ opacity: 1 }).to({ opacity: 0 }, 500).easing(TWEEN.Easing.Quadratic.In).onUpdate((obj) => { transitionOverlay.style.opacity = obj.opacity; }).start(); }).start(); }
function bg_createWindowsTexture(themeColor) { bg_windowsTextureCanvas = document.createElement('canvas'); bg_windowsTextureCanvas.width = 128; bg_windowsTextureCanvas.height = 256; const context = bg_windowsTextureCanvas.getContext('2d'); context.fillStyle = '#111'; context.fillRect(0, 0, 128, 256); for (let y = 8; y < 256; y += 16) { for (let x = 8; x < 128; x += 16) { if (Math.random() > 0.9) { context.fillStyle = themeColor; } else if (Math.random() > 0.8) { context.fillStyle = new THREE.Color(themeColor).lerp(new THREE.Color(0x000000), 0.5).getStyle(); } else { context.fillStyle = '#333'; } context.fillRect(x, y, 8, 8); } } return new THREE.CanvasTexture(bg_windowsTextureCanvas); }
function bg_createCityscape() { const cityGroup = new THREE.Group(); bg_scene.add(cityGroup); const buildingMaterials = [new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8, map: bg_createWindowsTexture(themes.red.mainNeon.getStyle()) }), new THREE.MeshStandardMaterial({ color: 0x202020, roughness: 0.9, map: bg_createWindowsTexture(themes.red.mainNeon.getStyle()) }), new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.7, map: bg_createWindowsTexture(themes.red.mainNeon.getStyle()) })]; const cityRadius = 50; for (let i = 0; i < buildingCount; i++) { const building = new THREE.Group(); const height = Math.random() * 40 + 10; const width = Math.random() * 5 + 2; const depth = Math.random() * 5 + 2; const mainBlock = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), buildingMaterials[i % 3]); building.add(mainBlock); if (Math.random() > 0.7) { const topHeight = Math.random() * 10 + 5; const topBlock = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, topHeight, depth * 0.8), buildingMaterials[i % 3]); topBlock.position.y = (height + topHeight) / 2; building.add(topBlock); } const angle = Math.random() * Math.PI * 2; const distance = cityRadius + Math.random() * 40; building.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance); cityGroup.add(building); } }
function bg_createCloudTexture(color) { bg_cloudTextureCanvas = document.createElement('canvas'); bg_cloudTextureCanvas.width = 128; bg_cloudTextureCanvas.height = 128; const context = bg_cloudTextureCanvas.getContext('2d'); const gradient = context.createRadialGradient(bg_cloudTextureCanvas.width / 2, bg_cloudTextureCanvas.height / 2, 0, bg_cloudTextureCanvas.width / 2, bg_cloudTextureCanvas.height / 2, bg_cloudTextureCanvas.width / 2); gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`); gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`); context.fillStyle = gradient; context.fillRect(0, 0, bg_cloudTextureCanvas.width, bg_cloudTextureCanvas.height); return new THREE.CanvasTexture(bg_cloudTextureCanvas); }
function bg_createClouds() { const particlesGeometry = new THREE.BufferGeometry(); const positions = []; const velocities = []; for (let i = 0; i < particleCount; i++) { const x = (Math.random() - 0.5) * 200; const y = 20 + Math.random() * 10; const z = (Math.random() - 0.5) * 200; positions.push(x, y, z); velocities.push((Math.random() - 0.5) * 0.05, 0, (Math.random() - 0.5) * 0.05); } particlesGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); particlesGeometry.setAttribute('velocity', new THREE.Float32BufferAttribute(velocities, 3)); const particlesMaterial = new THREE.PointsMaterial({ size: 80, map: bg_createCloudTexture(themes.red.cloud), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.2 }); bg_cloudParticles = new THREE.Points(particlesGeometry, particlesMaterial); bg_scene.add(bg_cloudParticles); }
function bg_onWindowResize() { 
    const width = window.innerWidth;
    const height = window.innerHeight;
    bg_camera.aspect = width / height; 
    bg_camera.updateProjectionMatrix(); 
    bg_renderer.setSize(width, height); 
    bg_composer.setSize(width, height);
    bg_hBlurPass.uniforms.h.value = 2 / width;
    bg_vBlurPass.uniforms.v.value = 2 / height;
    bg_renderer.setPixelRatio(bg_isMobile ? Math.min(window.devicePixelRatio, 1.5) : window.devicePixelRatio); 
}
function bg_animate() { requestAnimationFrame(bg_animate); const elapsedTime = bg_clock.getElapsedTime(); TWEEN.update(); if (bg_cloudParticles) { const positions = bg_cloudParticles.geometry.attributes.position.array; const velocities = bg_cloudParticles.geometry.attributes.velocity.array; for (let i = 0; i < positions.length; i += 3) { positions[i] += velocities[i]; positions[i + 2] += velocities[i + 2]; if (positions[i] > 100 || positions[i] < -100) velocities[i] *= -1; if (positions[i + 2] > 100 || positions[i + 2] < -100) velocities[i + 2] *= -1; } bg_cloudParticles.geometry.attributes.position.needsUpdate = true; } if (!bg_isMobile) { bg_updateCubeCamera(); } if (bg_mouth) { const mouthScaleY = 1 + Math.sin(elapsedTime * 8) * 0.2; bg_mouth.scale.y = mouthScaleY; bg_mouth.position.y = -5.01 + (1 - mouthScaleY); } if (bg_leftArm && bg_rightArm && bg_torso && bg_poses.length > 0) { const currentPose = bg_poses[bg_currentPoseIndex]; const nextPose = bg_poses[bg_nextPoseIndex]; const timeInPose = elapsedTime - bg_poseStartTime; if (timeInPose < bg_poseTransitionDuration) { const progress = timeInPose / bg_poseTransitionDuration; bg_leftArm.rotation.x = THREE.MathUtils.lerp(currentPose.leftArm.x, nextPose.leftArm.x, progress); bg_leftArm.rotation.z = THREE.MathUtils.lerp(currentPose.leftArm.z, nextPose.leftArm.z, progress); bg_rightArm.rotation.x = THREE.MathUtils.lerp(currentPose.rightArm.x, nextPose.rightArm.x, progress); bg_rightArm.rotation.z = THREE.MathUtils.lerp(currentPose.rightArm.z, nextPose.rightArm.z, progress); bg_torso.rotation.y = THREE.MathUtils.lerp(currentPose.torso.y, nextPose.torso.y, progress); bg_torso.rotation.z = THREE.MathUtils.lerp(currentPose.torso.z, nextPose.torso.z, progress); } else if (timeInPose >= bg_poseTransitionDuration + bg_poseHoldDuration) { bg_currentPoseIndex = bg_nextPoseIndex; do { bg_nextPoseIndex = Math.floor(Math.random() * bg_poses.length); } while (bg_nextPoseIndex === bg_currentPoseIndex); bg_poseStartTime = elapsedTime; } else { bg_leftArm.rotation.x = nextPose.leftArm.x; bg_leftArm.rotation.z = nextPose.leftArm.z; bg_rightArm.rotation.x = nextPose.rightArm.x; bg_rightArm.rotation.z = nextPose.rightArm.z; bg_torso.rotation.y = nextPose.torso.y; bg_torso.rotation.z = nextPose.torso.z; } } if (bg_head) { bg_head.rotation.x = Math.sin(elapsedTime * 0.8) * 0.05; bg_head.rotation.y = Math.sin(elapsedTime * 1.2 + 0.3) * 0.08; bg_head.rotation.z = Math.sin(elapsedTime * 0.6 + 0.7) * 0.03; } 
    bg_composer.render(); 
}

// --- FOREGROUND SCENE (MODIFIED) ---
function initCarousel() {

    if (bg_isMobile) {
        document.getElementById('cursor-container').style.display = 'none';
        document.body.style.cursor = 'auto';
        document.querySelectorAll('.btn, .swiper-button-next, .swiper-button-prev, .social-icon-wrapper, .play-button-v2, .popup-close-btn').forEach(el => el.style.cursor = 'pointer');
    }

    const webglScene = new THREE.Scene();
    const cursorScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.2, 1000);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.autoClear = false;
    renderer.setClearColor(0x000000, 0);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.outputEncoding = THREE.sRGBEncoding;

    const sceneContainer = document.getElementById('scene-container');
    sceneContainer.appendChild(renderer.domElement);
    
    const cursorContainer = document.getElementById('cursor-container');
    const cursorRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    cursorRenderer.setSize(window.innerWidth, window.innerHeight);
    cursorRenderer.setPixelRatio(window.devicePixelRatio);
    cursorContainer.appendChild(cursorRenderer.domElement);
    
    const buttonMaterial = new THREE.MeshPhysicalMaterial({ color: 0x444444, transmission: 0.5, roughness: 0.1, ior: 1.5, side: THREE.DoubleSide, transparent: true });
    const buttonTextMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true });
    const cursorMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF });
    const neonArrowMaterial = new THREE.MeshBasicMaterial({ color: themes.red.mainNeon });

    new RGBELoader().setPath('https://threejs.org/examples/textures/equirectangular/').load('royal_esplanade_1k.hdr', function (texture) {
        texture.mapping = THREE.EquirectangularReflectionMapping;
        webglScene.environment = texture;
    });
    
    let isInitialState = true;
    let inactivityTimer = null;
    let scriptenInactivityTimer = null;
    let isScriptenButtonVisible = true;
    let isAnimating = false;
    let currentIndex = 0;
    const carouselOptions = ["Portfolio", "Hire Me", "Reviews", "Contact Me"];
    const numOptions = carouselOptions.length;
    const radius = 4.5;

    const initialButtonGroup = new THREE.Group();
    const carouselUIGroup = new THREE.Group();
    const flatCarouselParent = new THREE.Object3D();
    webglScene.add(initialButtonGroup, carouselUIGroup);
    carouselUIGroup.add(flatCarouselParent);

    const cursorGroup = new THREE.Group();
    cursorScene.add(cursorGroup);
    const pointerShape = new THREE.Shape();
    const s = 0.3;
    pointerShape.moveTo(0, 0); pointerShape.lineTo(s * 0.4, s * -1.0); pointerShape.lineTo(s * 0.2, s * -1.0); pointerShape.lineTo(s * 0.0, s * -1.5); pointerShape.lineTo(s * -0.2, s * -1.0); pointerShape.lineTo(s * -0.4, s * -1.0); pointerShape.lineTo(0, 0);
    const pointerGeometry = new THREE.ExtrudeGeometry(pointerShape, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.01, bevelSegments: 2 });
    const pointerCursor = new THREE.Mesh(pointerGeometry, cursorMaterial);
    cursorGroup.add(pointerCursor);
    const box = new THREE.Box3().setFromObject(pointerCursor);
    const pointerOffset = box.max.y;
    cursorGroup.position.y = -pointerOffset;
    
    let popups = {};
    let initialButtonMesh, initialButtonTextMesh;
    let leftArrow, rightArrow;
    let carouselElements = [];
    let transitionRects = [];
    let hoveredIndex = -1; 
    let hoveredArrow = null;
    let activeColor = themes.red.mainNeon;
    const redColor = themes.red.mainNeon;
    const whiteColor = new THREE.Color(0xffffff); 
    
    const htmlPopupOverlay = document.getElementById('html-popup-overlay');
    let currentPopupName = null;

    htmlPopupOverlay.addEventListener('click', (event) => {
        if (event.target === htmlPopupOverlay) {
            hidePopup();
        }
    });

    let isHoveringHTML = false;
    htmlPopupOverlay.addEventListener('mouseover', (e) => {
        if (e.target.closest('button, a, .popup-close-btn, .swiper-button-next, .swiper-button-prev, .swiper-pagination-bullet, .social-icon-wrapper, input, textarea, .play-button-v2')) {
           isHoveringHTML = true;
        }
    });
    htmlPopupOverlay.addEventListener('mouseout', (e) => {
         if (e.target.closest('button, a, .popup-close-btn, .swiper-button-next, .swiper-button-prev, .swiper-pagination-bullet, .social-icon-wrapper, input, textarea, .play-button-v2')) {
            isHoveringHTML = false;
         }
    });

    function manageBlurState(isPopupVisible) {
        if (isPopupVisible) {
            if (!bg_composer.passes.includes(bg_hBlurPass)) {
                bg_composer.addPass(bg_hBlurPass);
                bg_composer.addPass(bg_vBlurPass);
                gsap.to(bg_renderer, { toneMappingExposure: 0.4, duration: 0.6, ease: 'power2.out' });
            }
        } else {
            if (bg_composer.passes.includes(bg_hBlurPass)) {
                bg_composer.removePass(bg_hBlurPass);
                bg_composer.removePass(bg_vBlurPass);
                gsap.to(bg_renderer, { toneMappingExposure: 1.2, duration: 0.8, delay: 0.2, ease: 'power2.inOut' });
            }
        }
    }
    
    function openPopup(popupName) {
        if (isAnimating || currentPopupName) return;
        isAnimating = true;
        currentPopupName = popupName;
        clearTimeout(inactivityTimer);
        manageBlurState(true);
        
        sceneContainer.style.pointerEvents = 'none';

        const popupData = popups[popupName];
        const newPopup = document.createElement('div');
        newPopup.className = 'wall-panel';
        newPopup.innerHTML = `
            <div class="popup-close-btn"></div>
            <div class="popup-title">${popupData.title}</div>
            <div class="popup-content-wrapper">${popupData.contentHTML}</div>
        `;
        htmlPopupOverlay.innerHTML = '';
        htmlPopupOverlay.appendChild(newPopup);
        
        gsap.set(newPopup, { scale: 0.5, opacity: 0 });

        const tl = gsap.timeline({
            onComplete: () => {
                isAnimating = false;
                if (popupData.onOpen) popupData.onOpen(newPopup);
                newPopup.querySelector('.popup-close-btn').addEventListener('click', () => {
                     hidePopup();
                });
            }
        });

        tl.to(carouselUIGroup.scale, { x: 0.5, y: 0.5, z: 0.5, duration: 0.4, ease: 'power2.in' })
          .add(() => { carouselUIGroup.visible = false; }, "-=0.1")
          .add(() => { htmlPopupOverlay.classList.add('visible'); })
          .to(newPopup, { scale: 1, opacity: 1, duration: 0.4, ease: 'power2.out' }, "-=0.2");
    }

    function hidePopup() {
        if (isAnimating) return;
        isAnimating = true;
        
        sceneContainer.style.pointerEvents = 'auto';

        const popupData = popups[currentPopupName];
        const popupElement = htmlPopupOverlay.querySelector('.wall-panel');

        if (popupData && popupData.onClose) popupData.onClose(popupElement);
        
        const tl = gsap.timeline({
            onComplete: () => {
                htmlPopupOverlay.classList.remove('visible');
                htmlPopupOverlay.innerHTML = '';
                currentPopupName = null;
                isAnimating = false;
                resetInactivityTimer();
            }
        });

        tl.to(popupElement, { scale: 0.5, opacity: 0, duration: 0.4, ease: 'power2.in' })
          .add(() => { carouselUIGroup.visible = true; }, "-=0.1")
          .to(carouselUIGroup.scale, { x: 1, y: 1, z: 1, duration: 0.4, ease: 'power2.out' }, "-=0.2")
          .add(() => {
                manageBlurState(false);
                gsap.to(carouselUIGroup.scale, { x: 1, y: 1, z: 1, duration: 0.5, delay: 0.3, ease: 'power2.out' });
                resetInactivityTimer();
          }, "-=0.4");
    }

    function switchPopup(newPopupName) {
        if (isAnimating || !currentPopupName || currentPopupName === newPopupName) return;
        isAnimating = true;

        const oldPopupData = popups[currentPopupName];
        const newPopupData = popups[newPopupName];
        const overlayContent = htmlPopupOverlay.querySelector('.wall-panel');

        if (oldPopupData && oldPopupData.onClose) oldPopupData.onClose(overlayContent);
        currentPopupName = newPopupName;

        gsap.to(overlayContent, {
            opacity: 0,
            duration: 0.25,
            ease: 'power2.in',
            onComplete: () => {
                overlayContent.innerHTML = `
                    <div class="popup-close-btn"></div>
                    <div class="popup-title">${newPopupData.title}</div>
                    <div class="popup-content-wrapper">${newPopupData.contentHTML}</div>
                `;
                
                if (newPopupData.onOpen) newPopupData.onOpen(overlayContent);
                overlayContent.querySelector('.popup-close-btn').addEventListener('click', () => {
                     hidePopup();
                });

                gsap.to(overlayContent, {
                    opacity: 1,
                    duration: 0.25,
                    ease: 'power2.out',
                    onComplete: () => isAnimating = false
                });
            }
        });
    }
    
    const fontLoader = new THREE.FontLoader();
    fontLoader.load('https://threejs.org/examples/fonts/helvetiker_bold.typeface.json', (font) => {
        const buttonTextSettings = { font: font, size: 0.25, height: 0.05, curveSegments: 24, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 10 };

        const initialButtonTextGeom = new THREE.TextGeometry('SCRIPTEN', buttonTextSettings);
        initialButtonTextGeom.center();
        initialButtonTextMesh = new THREE.Mesh(initialButtonTextGeom, buttonTextMaterial.clone());
        initialButtonTextMesh.position.z = 0.12;

        const initialButtonShape = new THREE.Shape();
        const buttonSize = 2.2; const buttonCornerRadius = 0.4;
        initialButtonShape.moveTo(-buttonSize / 2 + buttonCornerRadius, -buttonSize / 2); initialButtonShape.lineTo(buttonSize / 2 - buttonCornerRadius, -buttonSize / 2); initialButtonShape.quadraticCurveTo(buttonSize / 2, -buttonSize / 2, buttonSize / 2, -buttonSize / 2 + buttonCornerRadius); initialButtonShape.lineTo(buttonSize / 2, buttonSize / 2 - buttonCornerRadius); initialButtonShape.quadraticCurveTo(buttonSize / 2, buttonSize / 2, buttonSize / 2 - buttonCornerRadius, buttonSize / 2); initialButtonShape.lineTo(-buttonSize / 2 + buttonCornerRadius, buttonSize / 2); initialButtonShape.quadraticCurveTo(-buttonSize / 2, buttonSize / 2, -buttonSize / 2, buttonSize / 2 - buttonCornerRadius); initialButtonShape.lineTo(-buttonSize / 2, -buttonSize / 2 + buttonCornerRadius); initialButtonShape.quadraticCurveTo(-buttonSize / 2, -buttonSize / 2, -buttonSize / 2 + buttonCornerRadius, -buttonSize / 2);
        const extrudeSettings = { depth: 0.2, bevelEnabled: true, bevelSegments: 15, steps: 2, bevelSize: 0.05, bevelThickness: 0.05 };
        const initialButtonGeom = new THREE.ExtrudeGeometry(initialButtonShape, extrudeSettings);
        initialButtonGeom.center();
        initialButtonMesh = new THREE.Mesh(initialButtonGeom, buttonMaterial.clone());
        initialButtonGroup.add(initialButtonMesh, initialButtonTextMesh);
        initialButtonGroup.position.set(0, 0, 0);

        const arrowShape = new THREE.Shape();
        arrowShape.moveTo(0, 0.35); arrowShape.lineTo(0.4, 0); arrowShape.lineTo(0, -0.35); arrowShape.lineTo(0.2, 0); arrowShape.lineTo(0, 0.35);
        const arrowExtrudeSettings = { depth: 0.2, bevelEnabled: false };
        const arrowGeom = new THREE.ExtrudeGeometry(arrowShape, arrowExtrudeSettings);
        arrowGeom.center();

        leftArrow = new THREE.Mesh(arrowGeom, neonArrowMaterial.clone());
        leftArrow.rotation.z = Math.PI;
        leftArrow.position.x = -6;
        rightArrow = new THREE.Mesh(arrowGeom, neonArrowMaterial.clone());
        rightArrow.position.x = 6;
        
        carouselUIGroup.add(leftArrow, rightArrow);
        carouselUIGroup.position.set(0, 0, 0);
        carouselUIGroup.visible = false;

        carouselOptions.forEach((text, i) => {
            const group = new THREE.Group();
            const rectGeom = new THREE.BoxGeometry(3, 1, 0.2);
            const rectMesh = new THREE.Mesh(rectGeom, buttonMaterial.clone());
            
            const textGeom = new THREE.TextGeometry(text, buttonTextSettings);
            textGeom.center();
            const textMesh = new THREE.Mesh(textGeom, buttonTextMaterial.clone());
            textMesh.position.z = 0.12;

            group.add(rectMesh, textMesh);

            const angle = (i / numOptions) * Math.PI * 2;
            group.position.x = radius * Math.sin(angle);
            group.position.z = radius * Math.cos(angle);
            group.lookAt(webglScene.position);
            group.rotateY(Math.PI);
            
            flatCarouselParent.add(group);
            carouselElements.push({ group, rectMesh, textMesh });
        });
        
        for(let i=0; i<4; i++) {
            const rect = new THREE.Mesh(new THREE.BoxGeometry(2.2/2, 2.2/2, 0.2), buttonMaterial.clone());
            rect.visible = false;
            webglScene.add(rect);
            transitionRects.push(rect);
        }
        
        const repoName = "portfolio"; 
        const portfolioHTML = `
            <div class="swiper-container">
                <div class="swiper-wrapper">
                    <div class="swiper-slide">
                        <div class="demo-card">
                            <h3 class="work-title">#1 Urban Festival 'YADE LAUREN'</h3>
                            <p class="project-description">UF EVENT INTRO</p>
                            <div class="audio-player-v2">
                                <button class="play-button-v2"><svg class="play-icon-v2" viewBox="0 0 100 100"><path d="M 30,20 L 30,80 L 80,50 Z"></path></svg><svg class="pause-icon-v2" viewBox="0 0 100 100"><path d="M 30 20 H 40 V 80 H 30 V 20 Z M 60 20 H 70 V 80 H 60 V 20 Z"></path></svg></button>
                            </div>
                            <audio class="demo-audio" src="/${repoName}/assets/audio/1-urban-festival.mp3" preload="none"></audio>
                        </div>
                    </div>
                    <div class="swiper-slide">
                        <div class="demo-card">
                            <h3 class="work-title">#2 Speculative Advertisement Project</h3>
                            <p class="project-description">working with Michael_Tebebu</p>
                             <div class="audio-player-v2">
                                <button class="play-button-v2"><svg class="play-icon-v2" viewBox="0 0 100 100"><path d="M 30,20 L 30,80 L 80,50 Z"></path></svg><svg class="pause-icon-v2" viewBox="0 0 100 100"><path d="M 30 20 H 40 V 80 H 30 V 20 Z M 60 20 H 70 V 80 H 60 V 20 Z"></path></svg></button>
                            </div>
                            <audio class="demo-audio" src="/${repoName}/assets/audio/2-speculative-advertisement-project.mp3" preload="none"></audio>
                        </div>
                    </div>
                    <div class="swiper-slide">
                        <div class="demo-card">
                            <h3 class="work-title">#3 Nature's Yum Episode #1</h3>
                            <p class="project-description">Product Commercial</p>
                             <div class="audio-player-v2">
                                <button class="play-button-v2"><svg class="play-icon-v2" viewBox="0 0 100 100"><path d="M 30,20 L 30,80 L 80,50 Z"></path></svg><svg class="pause-icon-v2" viewBox="0 0 100 100"><path d="M 30 20 H 40 V 80 H 30 V 20 Z M 60 20 H 70 V 80 H 60 V 20 Z"></path></svg></button>
                            </div>
                            <audio class="demo-audio" src="/${repoName}/assets/audio/3-nature's-yum-episode1.mp3".replace("'", "%27") preload="none"></audio>
                        </div>
                    </div>
                    <div class="swiper-slide">
                        <div class="demo-card">
                            <h3 class="work-title">#4 Urban Festival 'LE BLANCO'</h3>
                            <p class="project-description">UF EVENT INTRO</p>
                             <div class="audio-player-v2">
                                <button class="play-button-v2"><svg class="play-icon-v2" viewBox="0 0 100 100"><path d="M 30,20 L 30,80 L 80,50 Z"></path></svg><svg class="pause-icon-v2" viewBox="0 0 100 100"><path d="M 30 20 H 40 V 80 H 30 V 20 Z M 60 20 H 70 V 80 H 60 V 20 Z"></path></svg></button>
                            </div>
                            <audio class="demo-audio" src="/${repoName}/assets/audio/4-uf-le-blanco-01.mp3" preload="none"></audio>
                        </div>
                    </div>
                    <div class="swiper-slide">
                        <div class="demo-card">
                            <h3 class="work-title">#5 DEADLINE RADIO</h3>
                            <p class="project-description">EVENT COMMERCIAL</p>
                             <div class="audio-player-v2">
                                <button class="play-button-v2"><svg class="play-icon-v2" viewBox="0 0 100 100"><path d="M 30,20 L 30,80 L 80,50 Z"></path></svg><svg class="pause-icon-v2" viewBox="0 0 100 100"><path d="M 30 20 H 40 V 80 H 30 V 20 Z M 60 20 H 70 V 80 H 60 V 20 Z"></path></svg></button>
                            </div>
                            <audio class="demo-audio" src="/${repoName}/assets/audio/5-deadline-radio-commercial.mp3" preload="none"></audio>
                        </div>
                    </div>
                    <div class="swiper-slide">
                        <div class="demo-card">
                            <h3 class="work-title">#6 UNDERCOVER BATTLE</h3>
                            <p class="project-description">EVENT COMMERCIAL</p>
                             <div class="audio-player-v2">
                                <button class="play-button-v2"><svg class="play-icon-v2" viewBox="0 0 100 100"><path d="M 30,20 L 30,80 L 80,50 Z"></path></svg><svg class="pause-icon-v2" viewBox="0 0 100 100"><path d="M 30 20 H 40 V 80 H 30 V 20 Z M 60 20 H 70 V 80 H 60 V 20 Z"></path></svg></button>
                            </div>
                            <audio class="demo-audio" src="/${repoName}/assets/audio/6-undercover-battle-festival-commercial.mp3" preload="none"></audio>
                        </div>
                    </div>
                    <div class="swiper-slide">
                        <div class="demo-card">
                            <h3 class="work-title">#7 Nature's Yum Episode #2</h3>
                            <p class="project-description">Product Commercial</p>
                             <div class="audio-player-v2">
                                <button class="play-button-v2"><svg class="play-icon-v2" viewBox="0 0 100 100"><path d="M 30,20 L 30,80 L 80,50 Z"></path></svg><svg class="pause-icon-v2" viewBox="0 0 100 100"><path d="M 30 20 H 40 V 80 H 30 V 20 Z M 60 20 H 70 V 80 H 60 V 20 Z"></path></svg></button>
                            </div>
                            <audio class="demo-audio" src="/${repoName}/assets/audio/7-natures-yum-episode2.mp3" preload="none"></audio>
                        </div>
                    </div>
                    <div class="swiper-slide">
                        <div class="demo-card">
                            <h3 class="work-title">#8 BAMA BACKWOODS TRAILRIDE</h3>
                            <p class="project-description">EVENT COMMERCIAL</p>
                             <div class="audio-player-v2">
                                <button class="play-button-v2"><svg class="play-icon-v2" viewBox="0 0 100 100"><path d="M 30,20 L 30,80 L 80,50 Z"></path></svg><svg class="pause-icon-v2" viewBox="0 0 100 100"><path d="M 30 20 H 40 V 80 H 30 V 20 Z M 60 20 H 70 V 80 H 60 V 20 Z"></path></svg></button>
                            </div>
                            <audio class="demo-audio" src="/${repoName}/assets/audio/8-bama-backwoods-trailride.mp3" preload="none"></audio>
                        </div>
                    </div>
                </div>
                <div class="swiper-pagination"></div>
                <div class="swiper-button-next"></div>
                <div class="swiper-button-prev"></div>
            </div>`;
        const hireMeHTML = `<div class="hire-me-buttons"><div class="order-btn-wrapper"><div id="coming-soon-msg">Coming Soon</div><button id="order-here-btn" class="btn inactive">Order Here</button></div><button id="contra-btn" class="btn">Order via Contra Platform</button></div>`;
        const reviewsHTML = `<div class="reviews-container">
            <div class="review-card active">
                <p class="review-quote">Fast & perfect!</p>
                <div class="review-author">yornpelgrims (Belgium)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: Up to $50 | Duration: 1 day – 4 months ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">Good Work!</p>
                <div class="review-author">mathew_1998 (Switzerland)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $50-$100 | Duration: 3 days – 4 months ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">High pristine/crisp sounds & open to work with my small request.</p>
                <div class="review-author">kuteljoh (Netherlands)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: Up to $50 | Duration: 1 day – 6 months ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">You did it super well again, you nailed it! No comments or edits, ten out of ten! Many thanks, see you next time ;-)</p>
                <div class="review-author">joostaa (Belgium, Repeat Client)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $400-$600 | Duration: 3 days – 6 months ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">First time working together... and not the last time! Great experience!!</p>
                <div class="review-author">joostaa (Belgium, Repeat Client)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $400-$600 | Duration: 2 days – 7 months ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">He went above and beyond with the order. Very fast delivery time, showcased a true understanding of the project at hand and knew exactly how to tone the voice-over I ordered. And he also has a great voice and a true professional artist. Whenever I would need this deep-voice again, I know exactly where to go.</p>
                <div class="review-author">mostromo (Sweden)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: Up to $50 | Duration: 1 day – 9 months ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">It’s always great working with the Vellex Voice! Will be returning soon with other projects!!</p>
                <div class="review-author">tstoree3 (United States, Repeat Client)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $50-$100 | Duration: 1 day – 10 months ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">Best service ever! Deffo would collab again and is a fantastic voice over artist.</p>
                <div class="review-author">michaelhailuteb (United Kingdom)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $50-$100 | Duration: 3 days – 11 months ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">Went above and beyond!</p>
                <div class="review-author">kylekrajewski (United States, Repeat Client)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $100-$200 | Duration: 3 days – 1 year ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">Amazing work, great job — exactly what I wanted with loads of variations and fast delivery. Definitely work with again.</p>
                <div class="review-author">sammywilde (United Kingdom)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $50-$100 | Duration: 1 day – 1 year ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">We received a voiceover that was perfect for what we needed. The quality of the VO was very high, and his deep tone fit well into our video.</p>
                <div class="review-author">gsportweb (United States, Repeat Client)</div>
                <div class="star-rating">★★★★☆ 4.7</div>
                <div class="review-details">Price: $100-$200 | Duration: 4 days – 1 year ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">Abvoice was tremendous! The work was done quickly, and he provided several options from which to choose. I will use him again!!!</p>
                <div class="review-author">mike278 (United States)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: Up to $50 | Duration: 2 days – 1 year ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">Always a pleasure to work with. Excellent communication skills and a great voice to deliver on time every time. Always keen to go that extra step and give variations on the lines.</p>
                <div class="review-author">cyrusmirzash991 (United Kingdom, Repeat Client)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $100-$200 | Duration: 1 day – 1 year ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">Really enjoy working with Vellex, I couldn't speak highly enough of them.</p>
                <div class="review-author">cyrusmirzash991 (United Kingdom, Repeat Client)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: Up to $50 | Duration: 2 days – 1 year ago</div>
            </div>
            <div class="review-card">
                <p class="review-quote">Wonderful to work with, would highly recommend! Great voice & professionalism.</p>
                <div class="review-author">cyrusmirzash991 (United Kingdom, Repeat Client)</div>
                <div class="star-rating">★★★★★</div>
                <div class="review-details">Price: $100-$200 | Duration: 1 day – 1 year ago</div>
            </div>
        </div>`;
        const contactMeHTML = `<div class="contact-container">
            <div class="social-icons">
                <a href="https://www.instagram.com/scripten.agency/" target="_blank" class="social-icon-wrapper">
                    <div class="social-icon"><img src="/${repoName}/assets/images/instagram.png" alt="Instagram"></div>
                    <span class="icon-label">Instagram</span>
                </a>
                <a href="https://contra.com/scripten" target="_blank" class="social-icon-wrapper">
                   <div class="social-icon"><img src="/${repoName}/assets/images/contra.png" alt="Contra"></div>
                   <span class="icon-label">Contra</span>
                </a>
                <div id="email-copy-btn" class="social-icon-wrapper">
                    <div class="social-icon">
                       <img src="/${repoName}/assets/images/mail.png" alt="Mail">
                        <span class="copy-success-msg">Copied! ✓</span>
                    </div>
                    <span class="icon-label">Mail</span>
                </div>
            </div>
        </div>`;
        const formHTML = `<div id="page1" class="form-page active"><div class="form-content"><h2>Contact Information</h2><div class="input-group"><label for="Name">Name</label><input type="text" id="name" name="Name" required></div><div class="input-group"><label for="ProjectName">Project Name</label><input type="text" id="projectName" name="ProjectName" required></div></div></div><div id="page2" class="form-page"><div class="form-content"><h2>Project Description</h2><div class="input-group"><label for="Description">Provide a detailed description.</label><textarea id="description" name="Description" required></textarea></div></div></div><div id="page3" class="form-page"><div class="form-content"><h2>Your Script</h2><div class="input-group"><label for="Script">Please provide the script.</label><textarea id="script-textarea" name="Script" required></textarea></div></div></div><div id="page4" class="form-page"><div class="form-content"><h2>Instructions</h2><div class="input-group"><label for="Instructions">Any specific instructions?</label><textarea id="instructions-textarea" name="Instructions" required></textarea></div></div></div><div id="page5" class="form-page"><div class="form-content"><h2>Delivery Date</h2><div class="input-group"><label for="DeliveryDate">Expected delivery date?</label><input type="date" id="deliveryDate" name="DeliveryDate" required></div></div></div><div id="page6" class="form-page"><div class="form-content"><h2>Email for Invoice</h2><div class="input-group"><label for="Email">Your Email</label><input type="email" id="email" name="Email" required></div></div></div><div class="button-group"><button class="btn" id="prevBtn" style="visibility: hidden;">Previous</button><button class="btn" id="nextBtn">Next</button><button class="btn" id="sendBtn" style="display: none;">Send Request</button></div><div id="page-indicator">Page 1 of 6</div>`;

        popups = {
            'Portfolio': { title: 'Portfolio', contentHTML: portfolioHTML, onOpen: initSwiper, onClose: stopAllPortfolioAudio },
            'Hire Me': { title: 'Hire Me', contentHTML: hireMeHTML, onOpen: (el) => {
                el.querySelector('#order-here-btn').addEventListener('click', () => {
                    const btn = el.querySelector('#order-here-btn');
                    const msg = el.querySelector('#coming-soon-msg');
                    btn.classList.add('shake');
                    gsap.to(msg, {opacity: 1, duration: 0.3, onComplete: () => {
                        gsap.to(msg, {opacity: 0, duration: 0.3, delay: 1.5});
                    }});
                    setTimeout(() => btn.classList.remove('shake'), 500);
                });
                el.querySelector('#contra-btn').addEventListener('click', () => switchPopup('Contact Form'));
            }},
            'Reviews': { title: 'Reviews', contentHTML: reviewsHTML, 
                onOpen: (el) => {
                    const reviewsData = popups['Reviews'];
                    reviewsData.reviewCards = el.querySelectorAll('.review-card');
                    reviewsData.reviewIndex = 0;
                    if (!reviewsData.reviewCards || reviewsData.reviewCards.length === 0) return;
                    reviewsData.reviewCards.forEach(card => card.classList.remove('active'));
                    reviewsData.reviewCards[reviewsData.reviewIndex].classList.add('active');
                    reviewsData.reviewInterval = setInterval(() => {
                        reviewsData.reviewCards[reviewsData.reviewIndex].classList.remove('active');
                        setTimeout(() => {
                            reviewsData.reviewIndex = (reviewsData.reviewIndex + 1) % reviewsData.reviewCards.length;
                            reviewsData.reviewCards[reviewsData.reviewIndex].classList.add('active');
                        }, 1000);
                    }, 6000);
                },
                onClose: () => {
                    const reviewsData = popups['Reviews'];
                    if (reviewsData.reviewInterval) {
                       clearInterval(reviewsData.reviewInterval);
                    }
                }
            },
            'Contact Me': { title: 'Contact Me', contentHTML: contactMeHTML, onOpen: (el) => {
                 el.querySelector('#email-copy-btn').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const successMsg = el.querySelector('.copy-success-msg');
                    const email = 'scripten.agency@gmail.com';
                    navigator.clipboard.writeText(email).then(() => {
                        gsap.to(successMsg, { opacity: 1, duration: 0.3, onComplete: () => {
                            gsap.to(successMsg, { opacity: 0, duration: 0.3, delay: 1.5 });
                        }});
                    });
                });
            }},
            'Contact Form': { title: 'Contact Form', contentHTML: formHTML, onOpen: setupFormNavigation }
        };

        updateCarouselOpacities();
        startScriptenTimer();
    });

    camera.position.z = 10;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const mousePosition3D = new THREE.Vector3();

    function startInactivityTimer() { clearTimeout(inactivityTimer); inactivityTimer = setTimeout(transformToInitial, 15000); }
    function resetInactivityTimer() { if (!isInitialState) { startInactivityTimer(); } }
    function startScriptenTimer() { clearTimeout(scriptenInactivityTimer); if (isInitialState) { scriptenInactivityTimer = setTimeout(() => { if (isInitialState) { gsap.to(initialButtonGroup.scale, { x: 0, y: 0, z: 0, duration: 0.5, ease: 'power2.in' }); isScriptenButtonVisible = false; } }, 6000); } }
    function resetScriptenTimer() { clearTimeout(scriptenInactivityTimer); if (isInitialState) { if (!isScriptenButtonVisible) { gsap.to(initialButtonGroup.scale, { x: 1, y: 1, z: 1, duration: 0.5, ease: 'power2.out' }); isScriptenButtonVisible = true; } startScriptenTimer(); } }
    
    function updateCarouselOpacities(duration = 0) {
        carouselElements.forEach((el, i) => {
            const textMesh = el.textMesh;
            const rectMesh = el.rectMesh;
            let targetOpacity = 0.55; 
            let textOpacity = 0;   
            const pos_offset = (i - currentIndex + numOptions) % numOptions;
            if (pos_offset === 0) { targetOpacity = 1.0; textOpacity = 1.0; } 
            gsap.to(rectMesh.material, { opacity: targetOpacity, duration });
            gsap.to(textMesh.material, { opacity: textOpacity, duration });
        });
    }

    function transformToCarousel() {
        if (isAnimating) return;
        transitionTheme(true);
        isAnimating = true; isInitialState = false; clearTimeout(scriptenInactivityTimer);
        const w = 2.2 / 4;
        transitionRects[0].position.set(-w, w, 0); transitionRects[1].position.set(w, w, 0); transitionRects[2].position.set(-w, -w, 0); transitionRects[3].position.set(w, -w, 0);
        transitionRects.forEach(r => { r.scale.set(1,1,1); r.rotation.set(0,0,0); r.visible = true; });
        initialButtonGroup.visible = false;
        const tl = gsap.timeline({ onComplete: () => { isAnimating = false; startInactivityTimer(); transitionRects.forEach(r => r.visible = false); }});
        transitionRects.forEach((rect, i) => {
            const targetElement = carouselElements[i];
            tl.to(rect.position, { x: targetElement.group.position.x, y: targetElement.group.position.y, z: targetElement.group.position.z, duration: 0.8, ease: 'power2.inOut' }, 0);
            tl.to(rect.rotation, { x: targetElement.group.rotation.x, y: targetElement.group.rotation.y, z: targetElement.group.rotation.z, duration: 0.8, ease: 'power2.inOut' }, 0);
            tl.to(rect.scale, { x: 3 / (2.2/2), y: 1 / (2.2/2), duration: 0.8, ease: 'power2.inOut' }, 0)
        });
        tl.add(() => { carouselUIGroup.visible = true; leftArrow.scale.set(0,0,0); rightArrow.scale.set(0,0,0); flatCarouselParent.visible = false; }, 0.7);
        tl.to([leftArrow.scale, rightArrow.scale], { x: 1, y: 1, z: 1, duration: 0.5, ease: 'elastic.out(1, 0.75)' });
        tl.add(() => { 
            flatCarouselParent.visible = true; 
            transitionRects.forEach(r => r.visible = false); 
            updateCarouselOpacities(0.3);
            leftArrow.material.color.set(redColor);
            rightArrow.material.color.set(redColor);
            carouselElements.forEach(el => {
                el.textMesh.material.color.set(redColor);
            });
        }, "-=0.2");
    }

    function transformToInitial() {
        if (isAnimating || currentPopupName) return;
        transitionTheme(false); 
        isAnimating = true; isInitialState = true; clearTimeout(inactivityTimer);
        currentIndex = 0; flatCarouselParent.rotation.y = 0; updateCarouselOpacities(); 
        carouselElements.forEach((el, i) => { const rect = transitionRects[i]; rect.position.copy(el.group.position); rect.rotation.copy(el.group.rotation); rect.scale.set(3 / (2.2/2), 1 / (2.2/2), 1); rect.visible = true; });
        carouselUIGroup.visible = false;
        const tl = gsap.timeline({ onComplete: () => { isAnimating = false; transitionRects.forEach(r => r.visible = false); startScriptenTimer(); } });
        const w = 2.2 / 4;
        const targets = [ {x: -w, y: w, z: 0}, {x: w, y: w, z: 0}, {x: -w, y: -w, z: 0}, {x: w, y: -w, z: 0} ];
        transitionRects.forEach((rect, i) => {
            tl.to(rect.position, { ...targets[i], duration: 0.8, ease: 'power2.inOut' }, 0);
            tl.to(rect.rotation, { x: 0, y: 0, z: 0, duration: 0.8, ease: 'power2.inOut' }, 0);
            tl.to(rect.scale, { x: 1, y: 1, z: 1, duration: 0.8, ease: 'power2.inOut' }, 0);
        });
        tl.add(() => { initialButtonGroup.visible = true; initialButtonTextMesh.material.opacity = 0; }, 0.7);
        tl.to(initialButtonTextMesh.material, { opacity: 1, duration: 0.5 });
    }

    function rotateFlatCarousel(direction) {
        if (isAnimating || currentPopupName) return;
        isAnimating = true; resetInactivityTimer(); hoveredIndex = -1;
        const oldIndex = currentIndex;
        currentIndex = (currentIndex + direction + numOptions) % numOptions;
        const rotationAngle = -(Math.PI * 2) / numOptions * direction;
        const rotationDuration = 1.2; const fadeDuration = 0.5;
        const tl = gsap.timeline({ onComplete: () => { isAnimating = false; } });
        tl.to(carouselElements[oldIndex].textMesh.material, { opacity: 0, duration: fadeDuration, ease: "power2.in" }, 0);
        tl.to(flatCarouselParent.rotation, { y: `+=${rotationAngle}`, duration: rotationDuration, ease: "power4.inOut" }, 0);
        tl.to(carouselElements[oldIndex].rectMesh.material, { opacity: 0.55, duration: rotationDuration, ease: "power2.inOut" }, 0);
        tl.to(carouselElements[currentIndex].rectMesh.material, { opacity: 1.0, duration: rotationDuration, ease: "power2.inOut" }, 0);
        const fadeInStartTime = rotationDuration - fadeDuration;
        tl.to(carouselElements[currentIndex].textMesh.material, { opacity: 1.0, duration: fadeDuration, ease: "power2.out" }, fadeInStartTime);
    }

    function onCanvasClick(event) {
        if (!bg_isMobile) {
            const rippleMaterial = new THREE.MeshBasicMaterial({ color: 0xFFFFFF, transparent: true, opacity: 0.8 });
            const rippleGeometry = new THREE.RingGeometry(0.01, 0.02, 64);
            const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial);
            ripple.position.copy(mousePosition3D);
            ripple.rotation.copy(camera.rotation);
            cursorScene.add(ripple);

            gsap.timeline({ onComplete: () => {
                cursorScene.remove(ripple);
                rippleGeometry.dispose();
                rippleMaterial.dispose();
            }})
            .to(ripple.scale, { x: 20, y: 20, duration: 0.7, ease: 'power2.out' })
            .to(ripple.material, { opacity: 0, duration: 0.6, ease: 'power2.out' }, "-=0.5");
        }

        if (isAnimating || htmlPopupOverlay.classList.contains('visible')) {
            return;
        }

        resetScriptenTimer();
        raycaster.setFromCamera(mouse, camera);

        if (isInitialState) {
            if (!initialButtonMesh) return;
            const intersects = raycaster.intersectObject(initialButtonMesh);
            if (intersects.length > 0) transformToCarousel();
        } else {
            if (carouselElements.length === 0) return;
            const activeElement = carouselElements[currentIndex];
            const carouselMeshes = carouselElements.map(el => el.rectMesh);
            const intersects = raycaster.intersectObjects([leftArrow, rightArrow, ...carouselMeshes, activeElement.textMesh]);
            if (intersects.length > 0) {
                const clickedObject = intersects[0].object;
                if (clickedObject === leftArrow) rotateFlatCarousel(-1);
                else if (clickedObject === rightArrow) rotateFlatCarousel(1);
                else if (clickedObject === activeElement.rectMesh || clickedObject === activeElement.textMesh) {
                    openPopup(carouselOptions[currentIndex]);
                }
            }
        }
    }

    function onMouseMove(event) { 
        resetScriptenTimer();
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1; 
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1; 
        const vector = new THREE.Vector3(mouse.x, mouse.y, 0.5); 
        vector.unproject(camera); 
        const dir = vector.sub(camera.position).normalize(); 
        const distance = -camera.position.z / dir.z; 
        mousePosition3D.copy(camera.position).add(dir.multiplyScalar(distance)); 
        raycaster.setFromCamera(mouse, camera); 

        if (!isInitialState && !currentPopupName && !isAnimating) {
            const intersects = raycaster.intersectObjects(carouselElements.map(el => el.rectMesh));
            hoveredIndex = intersects.length > 0 ? carouselElements.findIndex(el => el.rectMesh === intersects[0].object) : -1;
            const arrowIntersects = raycaster.intersectObjects([leftArrow, rightArrow]);
            hoveredArrow = arrowIntersects.length > 0 ? arrowIntersects[0].object : null;
        } else {
            hoveredIndex = -1;
            hoveredArrow = null;
        }
    }
    
    document.addEventListener('click', onCanvasClick);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchstart', (e) => {
        if (e.target.closest("#html-popup-overlay")) return;
        mouse.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        resetScriptenTimer();
    }, { passive: true });


    function updateHoverState() {
        if (isAnimating || bg_isMobile) return;

        const isCurrentlyHoveringInitial = isInitialState && initialButtonMesh && raycaster.intersectObject(initialButtonMesh).length > 0;
        
        const isHovering = hoveredArrow || hoveredIndex !== -1 || isCurrentlyHoveringInitial || isHoveringHTML;
        
        if (isHovering) {
            gsap.to(pointerCursor.scale, { x: 0.7, y: 0.7, z: 0.7, duration: 0.3, ease: 'power2.out' });
        } else {
            gsap.to(pointerCursor.scale, { x: 1, y: 1, z: 1, duration: 0.3, ease: 'back.out(1.7)' });
        }

        if (!isInitialState && carouselElements.length > 0) {
            carouselElements.forEach((el, i) => {
                el.textMesh.material.color.lerp((i === hoveredIndex) ? whiteColor : redColor, 0.1);
            });
        }
        if (leftArrow && rightArrow && !isInitialState) {
            leftArrow.material.color.lerp(hoveredArrow === leftArrow ? whiteColor : redColor, 0.1);
            rightArrow.material.color.lerp(hoveredArrow === rightArrow ? whiteColor : redColor, 0.1);
        }
    }

    function animateCarousel() {
        requestAnimationFrame(animateCarousel);
        updateHoverState(); 
        const time = Date.now() * 0.0005;
        
        const floatAmplitude = 0.02;
        if (isInitialState) {
            initialButtonGroup.position.y = Math.sin(time * 0.8) * floatAmplitude;
            initialButtonGroup.rotation.y = Math.sin(time * 0.3) * floatAmplitude;
        } else {
            carouselUIGroup.position.y = Math.sin(time * 0.8) * floatAmplitude;
            carouselUIGroup.rotation.y = Math.sin(time * 0.3) * floatAmplitude;
        }
        
        renderer.clear();
        renderer.render(webglScene, camera); 
        
        if (!bg_isMobile) {
            const targetPosition = new THREE.Vector3(mousePosition3D.x, mousePosition3D.y, mousePosition3D.z);
            cursorGroup.position.lerp(targetPosition, 0.2);
            cursorGroup.rotation.z = Math.PI / 12;
            cursorRenderer.render(cursorScene, camera);
        }
    }
    animateCarousel();

    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        if(!bg_isMobile) cursorRenderer.setSize(width, height);
        bg_onWindowResize();
    });

    function transitionTheme(toBlue) {
        const endTheme = toBlue ? themes.blue : themes.red;
        activeColor = endTheme.mainNeon;
        const duration = 1.5;

        gsap.to(bg_scene.background, { r: endTheme.bg.r, g: endTheme.bg.g, b: endTheme.bg.b, duration });
        gsap.to(bg_scene.fog.color, { r: endTheme.fog.r, g: endTheme.fog.g, b: endTheme.fog.b, duration });
        gsap.to(bg_suitMaterial.color, { r: endTheme.suit.r, g: endTheme.suit.g, b: endTheme.suit.b, duration });
        gsap.to(bg_rimLight1.color, { r: endTheme.mainNeon.r, g: endTheme.mainNeon.g, b: endTheme.mainNeon.b, duration });
        gsap.to(bg_rimLight2.color, { r: endTheme.mainNeon.r, g: endTheme.mainNeon.g, b: endTheme.mainNeon.b, duration });
        
        const newWindowsTexture = bg_createWindowsTexture(endTheme.mainNeon.getStyle());
        bg_scene.traverse(child => {
            if(child.isMesh && child.material.map && child.material.map.image === bg_windowsTextureCanvas) {
                child.material.map.dispose(); child.material.map = newWindowsTexture; child.material.needsUpdate = true;
            }
        });
        const newCloudTexture = bg_createCloudTexture(endTheme.cloud);
        if (bg_cloudParticles) {
            bg_cloudParticles.material.map.dispose(); bg_cloudParticles.material.map = newCloudTexture; bg_cloudParticles.material.needsUpdate = true;
        }
        const root = document.documentElement;
        const startColor = new THREE.Color(getComputedStyle(root).getPropertyValue('--main-neon-color').trim());
        const proxy = { color: startColor.getHex() };
        gsap.to(proxy, {
            color: endTheme.mainNeon.getHex(),
            duration,
            onUpdate: () => {
                const currentColor = new THREE.Color(proxy.color);
                const lighterColor = currentColor.clone().lerp(new THREE.Color(0xffffff), 0.3);
                const lightestColor = currentColor.clone().lerp(new THREE.Color(0xffffff), 0.6);
                root.style.setProperty('--main-neon-color', currentColor.getStyle());
                root.style.setProperty('--main-neon-color-rgb', `${Math.round(currentColor.r*255)}, ${Math.round(currentColor.g*255)}, ${Math.round(currentColor.b*255)}`);
                root.style.setProperty('--light-neon-color', lighterColor.getStyle());
                root.style.setProperty('--lighter-neon-color', lightestColor.getStyle());
            }
        });
    }
}
        
function stopAllPortfolioAudio() {
    document.querySelectorAll('#html-popup-overlay .demo-audio').forEach(audioEl => {
        if (audioEl) {
            audioEl.pause();
        }
    });
    document.querySelectorAll('#html-popup-overlay .play-button-v2').forEach(b => {
        b.classList.remove('playing');
    });
}
        
function setupFormNavigation(formContext) {
    const pages = formContext.querySelectorAll('.form-page');
    const prevBtn = formContext.querySelector('#prevBtn');
    const nextBtn = formContext.querySelector('#nextBtn');
    const sendBtn = formContext.querySelector('#sendBtn');
    const messageBox = document.getElementById('message-box');

    function showMessage(msg) {
        messageBox.textContent = msg;
        messageBox.style.top = '20px';
        setTimeout(() => {
            messageBox.style.top = '-100px';
        }, 3000);
    }

    let currentPage = 1;
    
    function updateButtons() {
        prevBtn.style.visibility = currentPage > 1 ? 'visible' : 'hidden';
        if (currentPage === pages.length) {
            nextBtn.style.display = 'none'; sendBtn.style.display = 'inline-block';
        } else {
            nextBtn.style.display = 'inline-block'; sendBtn.style.display = 'none';
        }
    }
    function showPage(pageNumber) {
        const activePage = formContext.querySelector(`.form-page.active`);
        if(activePage) activePage.classList.remove('active');
        formContext.querySelector(`#page${pageNumber}`).classList.add('active');
        currentPage = pageNumber;
        updateButtons();
    }
    function validatePage(pageNumber) {
        const page = formContext.querySelector(`#page${pageNumber}`);
        const inputs = page.querySelectorAll('[required]');
        for (let input of inputs) {
            if (!input.value.trim()) { showMessage(`Please fill out the ${input.name} field.`); return false; }
            if (input.type === 'email' && !/^\S+@\S+\.\S+$/.test(input.value)) { showMessage('Please enter a valid email address.'); return false; }
        }
        return true;
    }
    nextBtn.addEventListener('click', (e) => { e.stopPropagation(); if (validatePage(currentPage) && currentPage < pages.length) showPage(currentPage + 1); });
    prevBtn.addEventListener('click', (e) => { e.stopPropagation(); if (currentPage > 1) showPage(currentPage - 1); });
    sendBtn.addEventListener('click', (e) => { e.stopPropagation(); if (validatePage(pages.length)) { showMessage('This is a demo. Form submission is not active.'); } });
    updateButtons();
}

function initSwiper(context) {
    const swiperContainer = context.querySelector('.swiper-container');
    if (!swiperContainer) return;

    new Swiper(swiperContainer, {
        effect: 'coverflow', grabCursor: true, centeredSlides: true, slidesPerView: 'auto',
        coverflowEffect: { rotate: 50, stretch: 0, depth: 100, modifier: 1, slideShadows: true },
        pagination: { el: '.swiper-pagination', clickable: true },
        navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
        loop: false,
        on: { slideChange: stopAllPortfolioAudio }
    });
    
    swiperContainer.addEventListener('click', function(event) {
        event.stopPropagation();
        
        const playButton = event.target.closest('.play-button-v2');
        if (!playButton) return;

        const slide = playButton.closest('.swiper-slide');
        if (!slide) return;
        
        const audioToPlay = slide.querySelector('.demo-audio');
        if (!audioToPlay) return;

        const wasPlaying = !audioToPlay.paused;
        
        document.querySelectorAll('.demo-audio').forEach(audio => {
            if (audio !== audioToPlay) {
               audio.pause();
               audio.currentTime = 0;
            }
        });
        document.querySelectorAll('.play-button-v2').forEach(button => {
            if (button !== playButton) {
               button.classList.remove('playing');
            }
        });

        if (wasPlaying) {
            audioToPlay.pause();
            playButton.classList.remove('playing');
        } else {
            audioToPlay.play().catch(e => console.error("Audio playback error:", e));
            playButton.classList.add('playing');
        }
    });
}
        
document.fonts.ready.then(() => {
    bg_init(); 
    initCarousel(); 
});
