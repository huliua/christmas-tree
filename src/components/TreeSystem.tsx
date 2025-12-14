import React, { useRef, useMemo, useContext, useState, useEffect } from 'react';
import { useFrame, extend, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { shaderMaterial, Text, Line, Sparkles } from '@react-three/drei';
import * as random from 'maath/random/dist/maath-random.esm';
import { TreeContext, ParticleData, TreeContextType } from '../types';

// ... (FoliageMaterial shader 代码保持不变) ...
const FoliageMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color('#004225'), uColorAccent: new THREE.Color('#00fa9a'), uPixelRatio: 1 },
  ` uniform float uTime; uniform float uPixelRatio; attribute float size; varying vec3 vPosition; varying float vBlink; vec3 curl(float x, float y, float z) { float eps=1.,n1,n2,a,b;x/=eps;y/=eps;z/=eps;vec3 curl=vec3(0.);n1=sin(y+cos(z+uTime));n2=cos(x+sin(z+uTime));curl.x=n1-n2;n1=sin(z+cos(x+uTime));n2=cos(y+sin(x+uTime));curl.z=n1-n2;n1=sin(x+cos(y+uTime));n2=cos(z+sin(y+uTime));curl.z=n1-n2;return curl*0.1; } void main() { vPosition=position; vec3 distortedPosition=position+curl(position.x,position.y,position.z); vec4 mvPosition=modelViewMatrix*vec4(distortedPosition,1.0); gl_Position=projectionMatrix*mvPosition; gl_PointSize=size*uPixelRatio*(60.0/-mvPosition.z); vBlink=sin(uTime*2.0+position.y*5.0+position.x); } `,
  ` uniform vec3 uColor; uniform vec3 uColorAccent; varying float vBlink; void main() { vec2 xy=gl_PointCoord.xy-vec2(0.5); float ll=length(xy); if(ll>0.5) discard; float strength=pow(1.0-ll*2.0,3.0); vec3 color=mix(uColor,uColorAccent,smoothstep(-0.8,0.8,vBlink)); gl_FragColor=vec4(color,strength); } `
);
extend({ FoliageMaterial });

declare module '@react-three/fiber' {
  interface ThreeElements {
    foliageMaterial: any
    shimmerMaterial: any
  }
}

// --- Shimmer Material ---
const ShimmerMaterial = shaderMaterial(
  { uTime: 0, uColor: new THREE.Color('#ffffff') },
  // Vertex Shader
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // Fragment Shader
  `
    uniform float uTime;
    uniform vec3 uColor;
    varying vec2 vUv;
    void main() {
      // 扫光条纹位置，周期性移动
      float pos = mod(uTime * 0.8, 2.5) - 0.5;
      // 计算条纹强度 (倾斜)
      float bar = smoothstep(0.0, 0.2, 0.2 - abs(vUv.x + vUv.y * 0.5 - pos));

      // 基础透明度 0，扫光处透明度降低以减少对照片的影响
      float alpha = bar * 0.05;

      gl_FragColor = vec4(uColor, alpha);
    }
  `
);
extend({ ShimmerMaterial });

// --- Photo Component ---
const PolaroidPhoto: React.FC<{ url: string; position: THREE.Vector3; rotation: THREE.Euler; scale: number; id: string; shouldLoad: boolean; year: number }> = ({ url, position, rotation, scale, id, shouldLoad, year }) => {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [loadStatus, setLoadStatus] = useState<'pending' | 'loading' | 'local' | 'fallback'>('pending');


  useEffect(() => {
    if (!shouldLoad || loadStatus !== 'pending') return;

    setLoadStatus('loading');
    const loader = new THREE.TextureLoader();

    // 先尝试加载本地照片
    loader.load(
      url,
      (tex) => {
        // 本地照片加载成功
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.ClampToEdgeWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.needsUpdate = true;
        setTexture(tex);
        setLoadStatus('local');
        console.log(`✅ Successfully loaded local image: ${url}`, {
          width: tex.image?.width,
          height: tex.image?.height,
          format: tex.format,
          type: tex.type
        });
      },
      undefined, // onProgress
      (error) => {
        // 本地照片加载失败，使用 Picsum 随机照片
        console.warn(`⚠️ Local image not found: ${url}, loading random photo...`);
        const seed = id.split('-')[1] || '55';
        const fallbackUrl = `https://picsum.photos/seed/${parseInt(seed) + 100}/400/500`;

        loader.load(
          fallbackUrl,
          (fbTex) => {
            fbTex.colorSpace = THREE.SRGBColorSpace;
            fbTex.wrapS = THREE.ClampToEdgeWrapping;
            fbTex.wrapT = THREE.ClampToEdgeWrapping;
            fbTex.needsUpdate = true;
            setTexture(fbTex);
            setLoadStatus('fallback');
            console.log(`✅ Loaded fallback image for ${url}`);
          },
          undefined,
          (fallbackError) => {
            console.error(`❌ Failed to load both local and fallback images for ${url}`, fallbackError);
          }
        );
      }
    );
  }, [url, id, shouldLoad, loadStatus]);

  return (
    <group position={position} rotation={rotation} scale={scale * 1.2}>
      {/* 相框边框 - 白色边框 */}
      <mesh position={[0, 0, 0]} userData={{ photoId: id, photoUrl: url }}>
        <boxGeometry args={[1, 1.25, 0.02]} />
        <meshStandardMaterial
          color="#ffffff"
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
      {/* 照片内容 - 方案1: meshStandardMaterial */}
      <mesh position={[0, 0.15, 0.015]} userData={{ photoId: id, photoUrl: url }}>
        <planeGeometry args={[0.9, 0.9]} />
        {texture ? (
          <meshStandardMaterial
            key={texture.uuid}
            map={texture}
            roughness={0.5}
            metalness={0.0}
          />
        ) : (
          <meshStandardMaterial color="#333" />
        )}
      </mesh>
      {/* 扫光效果覆盖层 */}
      <mesh position={[0, 0.15, 0.02]} scale={[0.9, 0.9, 1]}>
        <planeGeometry args={[1, 1]} />
        <shimmerMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  );
};

// --- Main Tree System ---
const TreeSystem: React.FC = () => {
  const { state, rotationSpeed, rotationBoost, pointer, clickTrigger, setSelectedPhotoUrl, selectedPhotoUrl, panOffset, lastCloseTime, hoveredPhotoId, setHoveredPhotoId } = useContext(TreeContext) as TreeContextType;
  const { camera, raycaster } = useThree();
  const pointsRef = useRef<THREE.Points>(null);
  const lightsRef = useRef<THREE.InstancedMesh>(null);
  const trunkRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<any>(null);
  const starRef = useRef<THREE.Group>(null);

  const progress = useRef(0);
  const treeRotation = useRef(0);

  // 用于平滑过渡 Pan
  const currentPan = useRef({ x: 0, y: 0 });

  // Staggered Loading State
  const [loadedCount, setLoadedCount] = useState(0);

  const [photoObjects, setPhotoObjects] = useState<{ id: string; url: string; ref: React.MutableRefObject<THREE.Group | null>; data: ParticleData; pos: THREE.Vector3; rot: THREE.Euler; scale: number; }[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLoadedCount(prev => {
        if (prev >= photoObjects.length) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1; // Load 1 photo per tick (smoother)
      });
    }, 100); // 100ms interval
    return () => clearInterval(interval);
  }, [photoObjects.length]);

  // --- Data Generation ---
  const { foliageData, photosData, lightsData } = useMemo(() => {
    const particleCount = 8000; // Increased for more impact
    const foliage = new Float32Array(particleCount * 3); const foliageChaos = new Float32Array(particleCount * 3); const foliageTree = new Float32Array(particleCount * 3); const sizes = new Float32Array(particleCount);
    // Chaos radius increased to 30 for "Explosion" effect
    const sphere = random.inSphere(new Float32Array(particleCount * 3), { radius: 30 }); for (let i = 0; i < particleCount * 3; i++) foliageChaos[i] = sphere[i];
    for (let i = 0; i < particleCount; i++) { const i3 = i * 3; const h = Math.random() * 14; const coneRadius = (14 - h) * 0.45; const angle = h * 3.0 + Math.random() * Math.PI * 2; foliageTree[i3] = Math.cos(angle) * coneRadius; foliageTree[i3 + 1] = h - 6; foliageTree[i3 + 2] = Math.sin(angle) * coneRadius; sizes[i] = Math.random() * 1.5 + 0.5; }

    const lightCount = 500; // Increased lights
    const lightChaos = new Float32Array(lightCount * 3); const lightTree = new Float32Array(lightCount * 3); const lSphere = random.inSphere(new Float32Array(lightCount * 3), { radius: 35 });
    for (let i = 0; i < lightCount * 3; i++) lightChaos[i] = lSphere[i];
    for (let i = 0; i < lightCount; i++) { const i3 = i * 3; const t = i / lightCount; const h = t * 13; const coneRadius = (14 - h) * 0.48; const angle = t * Math.PI * 25; lightTree[i3] = Math.cos(angle) * coneRadius; lightTree[i3 + 1] = h - 6; lightTree[i3 + 2] = Math.sin(angle) * coneRadius; }

    // 实际存在的照片文件列表
    const photoFiles = [
      "1.jpg", "2.jpg", "3.jpg",
      "4.jpg", "5.jpg", "6.heic",
      "7.jpg", "8.jpg", "9.jpg",
      "10.jpg", "11.jpg", "12.jpg",
      "13.png", "14.heic", "15.png",
      "16.jpg", "17.jpg", "18.jpg",
      "19.jpg", "20.jpg", "21.jpg",
      "22.jpg", "23.png", "24.jpg",
      "25.png", "16.jpg", "27.jpg",
      "28.jpg", "29.png", "30.jpg",
      "31.heic"
    ];

    // 按时间排序
    photoFiles.sort();

    const photoCount = photoFiles.length;
    const photos: ParticleData[] = [];

    for (let i = 0; i < photoCount; i++) {
      const fileName = photoFiles[i];
      // 解析文件名: YYYY_MM_ID.jpg
      const parts = fileName.split('_');
      const year = parseInt(parts[0]);
      const month = parts[1]; // Keep as string "02"

      // --- FORMED: Time Spiral Layout ---
      // 螺旋上升: i 越大 (越新)，h 越高
      const t = i / (photoCount - 1);
      const h = t * 14 - 7; // 高度范围 -7 到 7
      const radius = (7 - (h + 7)) * 0.4 + 1.5; // 树锥形半径
      const angle = t * Math.PI * 10; // 螺旋圈数 (5圈)

      const treeX = Math.cos(angle) * radius;
      const treeY = h;
      const treeZ = Math.sin(angle) * radius;

      // --- CHAOS: Fibonacci Sphere Layout (Even Distribution) ---
      // 使用斐波那契球体分布，确保照片均匀分布，减少重叠

      // 黄金角度
      const phi = Math.acos(1 - 2 * (i + 0.5) / photoCount);
      const theta = Math.PI * (1 + Math.sqrt(5)) * (i + 0.5);

      // 基础半径 (稍微随机化一点，避免完全在一个球面上)
      const r = 12 + Math.random() * 4;

      const chaosX = r * Math.sin(phi) * Math.cos(theta);
      const chaosY = r * Math.sin(phi) * Math.sin(theta) * 0.6; // Y轴压扁一点，形成椭球
      const chaosZ = r * Math.cos(phi);

      const imageUrl = `/photos/${fileName}`;

      photos.push({
        id: `photo-${i}`,
        type: 'PHOTO',
        year: year,
        month: month,
        chaosPos: [chaosX, chaosY, chaosZ],
        treePos: [treeX, treeY, treeZ],
        chaosRot: [
          (Math.random() - 0.5) * 0.2, // X: 微小随机倾斜
          0 + (Math.random() - 0.5) * 0.2, // Y: 正面朝向 (0) + 微扰
          (Math.random() - 0.5) * 0.1 // Z: 微小倾斜
        ],
        treeRot: [0, -angle + Math.PI / 2, 0], // 面向外
        scale: 0.9 + Math.random() * 0.3,
        image: imageUrl,
        color: 'white'
      });
    }
    return { foliageData: { current: foliage, chaos: foliageChaos, tree: foliageTree, sizes }, photosData: photos, lightsData: { chaos: lightChaos, tree: lightTree, count: lightCount } };
  }, []);

  useEffect(() => {
    setPhotoObjects(photosData.map(p => ({ id: p.id, url: p.image!, ref: React.createRef(), data: p, pos: new THREE.Vector3(), rot: new THREE.Euler(), scale: p.scale })));
  }, [photosData]);

  // --- 处理悬停 (Hover) ---
  // 更新全局 hoveredPhotoId，让 App.tsx 处理点击逻辑
  useEffect(() => {
    if (state !== 'CHAOS' || !pointer) {
       if (hoveredPhotoId !== null) setHoveredPhotoId(null);
       return;
    }

    const ndcX = pointer.x * 2 - 1;
    const ndcY = -(pointer.y * 2) + 1;

    let closestPhotoId: string | null = null;
    let minDistance = Infinity;
    const SELECTION_THRESHOLD = 0.15;

    photoObjects.forEach(obj => {
      if (!obj.ref.current) return;
      const worldPos = new THREE.Vector3();
      obj.ref.current.getWorldPosition(worldPos);
      const screenPos = worldPos.clone().project(camera);

      if (screenPos.z < 1) {
        const dist = Math.hypot(screenPos.x - ndcX, screenPos.y - ndcY);
        if (dist < SELECTION_THRESHOLD && dist < minDistance) {
          minDistance = dist;
          closestPhotoId = obj.data.image!;
        }
      }
    });

    if (closestPhotoId !== hoveredPhotoId) {
       setHoveredPhotoId(closestPhotoId);
    }
  }, [pointer, state, hoveredPhotoId, photoObjects]); 

  // --- Animation Loop ---
  useFrame((state3d, delta) => {
    const targetProgress = state === 'FORMED' ? 1 : 0;
    progress.current = THREE.MathUtils.damp(progress.current, targetProgress, 2.0, delta);
    const ease = progress.current * progress.current * (3 - 2 * progress.current);
    
    // Rotation Logic: Allow boost in all states
    const baseSpeed = state === 'FORMED' ? rotationSpeed : 0.05;
    treeRotation.current += (baseSpeed + rotationBoost) * delta;

    // Line Opacity Animation
    if (lineRef.current && lineRef.current.material) {
       // Smoothly fade in line only when mostly formed (late fade-in)
       // ease goes from 0 (Chaos) to 1 (Formed). We fade in from 0.6 to 1.0
       const lineFade = THREE.MathUtils.smoothstep(ease, 0.6, 1.0);
       lineRef.current.material.opacity = lineFade * 0.15;
       lineRef.current.visible = lineFade > 0.01;
    }

    // Star Scale Animation
    if (starRef.current) {
        const starScale = THREE.MathUtils.smoothstep(ease, 0.8, 1.0);
        starRef.current.scale.setScalar(starScale);
    }

    // 应用平移 (带阻尼)
    // 允许在任何状态下平移，使用较快的跟随速度
    const targetPanX = panOffset.x;
    const targetPanY = panOffset.y;

    currentPan.current.x = THREE.MathUtils.lerp(currentPan.current.x, targetPanX, 0.2);
    currentPan.current.y = THREE.MathUtils.lerp(currentPan.current.y, targetPanY, 0.2);

    if (groupRef.current) {
      groupRef.current.position.x = currentPan.current.x;
      groupRef.current.position.y = currentPan.current.y;
    }

    if (pointsRef.current) {
      // @ts-ignore
      pointsRef.current.material.uniforms.uTime.value = state3d.clock.getElapsedTime();
      const positions = pointsRef.current.geometry.attributes.position.array as Float32Array;
      for (let i = 0; i < positions.length / 3; i++) {
        const i3 = i * 3; const cx = foliageData.chaos[i3]; const cy = foliageData.chaos[i3 + 1]; const cz = foliageData.chaos[i3 + 2]; const tx = foliageData.tree[i3]; const ty = foliageData.tree[i3 + 1]; const tz = foliageData.tree[i3 + 2];
        const y = THREE.MathUtils.lerp(cy, ty, ease); const tr = Math.sqrt(tx * tx + tz * tz); const tAngle = Math.atan2(tz, tx); const cr = Math.sqrt(cx * cx + cz * cz); const r = THREE.MathUtils.lerp(cr, tr, ease);
        const vortexTwist = (1 - ease) * 15.0; const currentAngle = tAngle + vortexTwist + treeRotation.current; const formedX = r * Math.cos(currentAngle); const formedZ = r * Math.sin(currentAngle);
        const cAngle = Math.atan2(cz, cx); const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.5); const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.5);
        positions[i3] = THREE.MathUtils.lerp(cRotatedX, formedX, ease); positions[i3 + 1] = y; positions[i3 + 2] = THREE.MathUtils.lerp(cRotatedZ, formedZ, ease);
      }
      pointsRef.current.geometry.attributes.position.needsUpdate = true;
    }
    if (lightsRef.current) {
      const dummy = new THREE.Object3D();
      for (let i = 0; i < lightsData.count; i++) {
        const i3 = i * 3; const cx = lightsData.chaos[i3]; const cy = lightsData.chaos[i3 + 1]; const cz = lightsData.chaos[i3 + 2]; const tx = lightsData.tree[i3]; const ty = lightsData.tree[i3 + 1]; const tz = lightsData.tree[i3 + 2];
        const y = THREE.MathUtils.lerp(cy, ty, ease); const tr = Math.sqrt(tx * tx + tz * tz); const tAngle = Math.atan2(tz, tx); const cr = Math.sqrt(cx * cx + cz * cz); const r = THREE.MathUtils.lerp(cr, tr, ease);
        const vortexTwist = (1 - ease) * 12.0; const currentAngle = tAngle + vortexTwist + treeRotation.current;
        const cAngle = Math.atan2(cz, cx); const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.3); const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.3);
        const fx = THREE.MathUtils.lerp(cRotatedX, r * Math.cos(currentAngle), ease); const fz = THREE.MathUtils.lerp(cRotatedZ, r * Math.sin(currentAngle), ease);
        dummy.position.set(fx, y, fz); dummy.scale.setScalar(1); dummy.updateMatrix(); lightsRef.current.setMatrixAt(i, dummy.matrix);
      }
      lightsRef.current.instanceMatrix.needsUpdate = true;
    }
    // 更新所有照片的扫光时间
    photoObjects.forEach(obj => {
      if (obj.ref.current) {
        // 查找 shimmerMaterial 并更新 uTime
        obj.ref.current.traverse((child) => {
          // @ts-ignore
          if (child.material && child.material.uniforms && child.material.uniforms.uTime) {
            // @ts-ignore
            child.material.uniforms.uTime.value = state3d.clock.getElapsedTime() + parseInt(obj.id.split('-')[1] || '0');
          }
        });
      }
    });
    if (trunkRef.current) {
      const trunkScale = THREE.MathUtils.smoothstep(ease, 0.3, 1.0); trunkRef.current.scale.set(trunkScale, ease, trunkScale); trunkRef.current.position.y = 1; trunkRef.current.rotation.y = treeRotation.current;
    }
    photoObjects.forEach((obj) => {
      if (!obj.ref.current) return;
      const { chaosPos, treePos, chaosRot, treeRot } = obj.data;
      const [cx, cy, cz] = chaosPos; const [tx, ty, tz] = treePos;
      const y = THREE.MathUtils.lerp(cy, ty, ease); const cr = Math.sqrt(cx * cx + cz * cz); const tr = Math.sqrt(tx * tx + tz * tz); const r = THREE.MathUtils.lerp(cr, tr, ease);
      const tAngle = Math.atan2(tz, tx); const vortexTwist = (1 - ease) * 10.0; const currentAngle = tAngle + vortexTwist + treeRotation.current;
      const cAngle = Math.atan2(cz, cx); const cRotatedX = cr * Math.cos(cAngle + treeRotation.current * 0.2); const cRotatedZ = cr * Math.sin(cAngle + treeRotation.current * 0.2);
      const targetX = r * Math.cos(currentAngle); const targetZ = r * Math.sin(currentAngle);
      obj.ref.current.position.set(THREE.MathUtils.lerp(cRotatedX, targetX, ease), y, THREE.MathUtils.lerp(cRotatedZ, targetZ, ease));
      const lookAtAngle = -currentAngle + Math.PI / 2;
      obj.ref.current.rotation.x = THREE.MathUtils.lerp(chaosRot[0], treeRot[0], ease); obj.ref.current.rotation.y = THREE.MathUtils.lerp(chaosRot[1], lookAtAngle, ease); obj.ref.current.rotation.z = THREE.MathUtils.lerp(chaosRot[2], treeRot[2], ease);
    });
  });

  return (
    <group ref={groupRef}>
      <mesh ref={trunkRef} position={[0, 0, 0]}><cylinderGeometry args={[0.2, 0.8, 14, 8]} /><meshStandardMaterial color="#3E2723" roughness={0.9} metalness={0.1} /></mesh>
      <points ref={pointsRef}> <bufferGeometry> <bufferAttribute attach="attributes-position" count={foliageData.current.length / 3} array={foliageData.current} itemSize={3} /> <bufferAttribute attach="attributes-size" count={foliageData.sizes.length} array={foliageData.sizes} itemSize={1} /> </bufferGeometry> <foliageMaterial transparent depthWrite={false} blending={THREE.AdditiveBlending} /> </points>
      <instancedMesh ref={lightsRef} args={[undefined, undefined, lightsData.count]}><sphereGeometry args={[0.05, 8, 8]} /><meshStandardMaterial color="#ffddaa" emissive="#ffbb00" emissiveIntensity={3} toneMapped={false} /></instancedMesh>
      {photoObjects.map((obj, index) => (
        <group key={obj.id} ref={(el) => { obj.ref.current = el; }}>
          <PolaroidPhoto
            url={obj.url}
            position={obj.pos}
            rotation={obj.rot}
            scale={obj.scale}
            id={obj.id}
            shouldLoad={index < loadedCount}
            year={obj.data.year}
          />

          {/* Year Label - Only show for the first photo of each year */}
          {obj.data.year && (index === 0 || photoObjects[index - 1].data.year !== obj.data.year) && (
            <group position={[0, 0.65, 0.05]}>
              {/* Shadow Layer */}
              <Text
                position={[0.01, -0.01, -0.01]} // Slight offset for drop shadow
                fontSize={0.18}
                maxWidth={1.2} // Allow full width
                color="#000000"
                font="/fonts/Cinzel-Bold.ttf"
                characters="0123456789-"
                anchorX="center"
                anchorY="bottom"
                fillOpacity={0.5}
              >
                {`${obj.data.year}-${obj.data.month}`}
              </Text>
              {/* Main Text Layer */}
              <Text
                fontSize={0.18} // Very small
                maxWidth={1.2}
                color="#ffd700" // Gold
                font="/fonts/Cinzel-Bold.ttf"
                characters="0123456789-"
                anchorX="center"
                anchorY="bottom"
                fillOpacity={state === 'FORMED' ? 1 : 0.9}
                outlineWidth={0} // No outline
              >
                {`${obj.data.year}-${obj.data.month}`}
              </Text>
            </group>
          )
          }
        </group>
      ))}

      {/* Time Line Connection (Only visible in FORMED state, but we render always and control opacity via ref for smooth transition) */}
      {photoObjects.length > 0 && (
        <Line
          ref={lineRef}
          points={photoObjects.map(obj => new THREE.Vector3(...obj.data.treePos))}
          color="#ffd700"
          opacity={0} // Start invisible, controlled by useFrame
          transparent
          lineWidth={1}
        />
      )}

      {/* Top Star - Glowing Octahedron */}
      <group ref={starRef} position={[0, 7.8, 0]} scale={[0, 0, 0]}>
        <mesh>
          <octahedronGeometry args={[0.6, 0]} />
          <meshStandardMaterial color="#ffd700" emissive="#ffaa00" emissiveIntensity={3} toneMapped={false} />
        </mesh>
        <pointLight color="#ffaa00" intensity={2} distance={8} decay={2} />
        <Sparkles count={30} scale={2.5} size={5} speed={0.4} opacity={0.8} color="#ffffaa" />
      </group>
    </group>
  );
};

export default TreeSystem;