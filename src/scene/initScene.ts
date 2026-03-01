import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { createShaderCanvas, createTerrain } from './createTerrain'
import { createPane } from './createPane'

export function initScene(canvas: HTMLCanvasElement): () => void {

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(devicePixelRatio)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping


  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x111111)

  const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  )
  camera.position.set(0, 12, 20)
  camera.lookAt(0, 0, 0)

  const shaderMesh = createShaderCanvas()

  camera.add(shaderMesh)
  shaderMesh.position.set(0, 0, -2)
  shaderMesh.scale.set(1, 1, 1)
  scene.add(camera)

  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 5
  controls.maxDistance = 60

  // const { mesh, uniforms } = createTerrain()
  // scene.add(mesh)

  // const pane = createPane(uniforms, mesh.material as THREE.MeshBasicNodeMaterial)

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  // render loop
  renderer.setAnimationLoop(() => {
    controls.update()
    renderer.render(scene, camera)
  })


  return () => {
    renderer.setAnimationLoop(null)
    window.removeEventListener('resize', onResize)
    controls.dispose()
    // pane.dispose()
    renderer.dispose()
  }
}