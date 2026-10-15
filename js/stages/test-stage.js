// A small test stage (only used from the ?debug panel): a floating platform with Poppy and a
// few alien trees under a pastel sky. It exercises everything a real stage does: its own
// scene, camera, lights with a shadow map, buddy copies and per-frame updates.

import * as THREE from 'three';
import { alienTree } from '../world/alien.js';

export default {
  id: 'test',
  cast: ['poppy'],

  build(stage) {
    const { scene, camera, cast } = stage;
    scene.background = new THREE.Color('#cfe6ff');
    scene.fog = new THREE.Fog('#cfe6ff', 30, 90);
    stage.useSharedEnvironment();

    scene.add(new THREE.HemisphereLight('#f2f6ff', '#c7b3ea', 1.2));
    const sun = new THREE.DirectionalLight('#ffe2b8', 2);
    sun.position.set(6, 12, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    scene.add(sun);

    const ground = new THREE.Mesh(new THREE.CylinderGeometry(7, 5, 2, 48), new THREE.MeshStandardMaterial({ color: '#9ee6c8', roughness: 0.8 }));
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);
    stage.ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.08, 12, 64), new THREE.MeshStandardMaterial({ color: '#fff', emissive: '#ff9be6', emissiveIntensity: 1.4 }));
    stage.ring.rotation.x = Math.PI / 2;
    stage.ring.position.y = 0.05;
    scene.add(stage.ring);
    for (const [x, z, s, seed] of [[-4, -3, 0.8, 1], [4, -3.5, 0.9, 2], [-3.5, 2.5, 0.6, 3]]) scene.add(alienTree(x, z, s, null, seed));

    cast.poppy.place(0, 0).faceNow(0, 10);
    cast.poppy.state = 'wave';
    camera.position.set(0, 3.2, 9);
    camera.lookAt(0, 1, 0);
  },

  update(stage, dt) {
    stage.ring.rotation.z += dt * 0.8;
  },
};
