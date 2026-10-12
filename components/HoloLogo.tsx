"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Center, Bounds } from "@react-three/drei";
import { FBXLoader } from "three-stdlib";
import { BufferAttribute, Group, Mesh, MeshPhysicalMaterial } from "three";

// Model is Z-up locally: circle at bottom, D+lines middle, square on top.
const SQUARE_Z = 0.78; // above → navy square
const CIRCLE_Z = 0.18; // below → orange circle; middle → gold D/lines

const holo = (color: string) =>
  new MeshPhysicalMaterial({
    color,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    roughness: 0.1,
    metalness: 0.1,
    iridescence: 1,
    iridescenceIOR: 1.4,
    emissive: color,
    emissiveIntensity: 0.15,
  });

// Single welded mesh — rebuild as two material groups split by triangle height.
function Model() {
  const fbx = useLoader(FBXLoader, "/holo-logo.fbx");
  const ref = useRef<Group>(null);

  useMemo(() => {
    const navy = holo("#1E3A8A");
    const orange = holo("#F97316");
    const gold = holo("#d4a017");

    fbx.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;

      const geo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
      const pos = geo.attributes.position;
      const triCount = pos.count / 3;

      const bottom: number[] = [];
      const middle: number[] = [];
      const top: number[] = [];
      for (let t = 0; t < triCount; t++) {
        const z = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3;
        (z < CIRCLE_Z ? bottom : z > SQUARE_Z ? top : middle).push(t);
      }

      const order = [...bottom, ...middle, ...top];
      for (const name of Object.keys(geo.attributes)) {
        const src = geo.attributes[name] as BufferAttribute;
        const dst = new BufferAttribute(new Float32Array(src.count * src.itemSize), src.itemSize);
        order.forEach((tri, i) => {
          for (let v = 0; v < 3; v++) {
            for (let c = 0; c < src.itemSize; c++) {
              dst.setComponent(i * 3 + v, c, src.getComponent(tri * 3 + v, c));
            }
          }
        });
        geo.setAttribute(name, dst);
      }
      geo.clearGroups();
      geo.addGroup(0, bottom.length * 3, 0); // orange — bottom circle
      geo.addGroup(bottom.length * 3, middle.length * 3, 1); // gold — D + lines
      geo.addGroup((bottom.length + middle.length) * 3, top.length * 3, 2); // navy — upper square
      mesh.material = [orange, gold, navy];
      mesh.geometry = geo;
    });
  }, [fbx]);

  useFrame((_, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.9; // ~7s per 360°
  });

  return (
    <Center>
      <primitive ref={ref} object={fbx} scale={[1, 1, 0.3]} />
    </Center>
  );
}

export function HoloLogo() {
  return (
    <div className="pointer-events-none mx-auto h-24 w-24 sm:h-32 sm:w-32">
      <Canvas camera={{ fov: 40 }} gl={{ alpha: true, antialias: true }} dpr={[1, 2]}>
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 4, 5]} intensity={1.8} />
        <directionalLight position={[-3, -1, -4]} intensity={0.6} color="#7aa0e0" />
        <Bounds fit clip observe margin={1.15}>
          <Model />
        </Bounds>
      </Canvas>
    </div>
  );
}
