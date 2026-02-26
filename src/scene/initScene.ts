import * as THREE from 'three/webgpu'
import {
  uniform,
  sin,
  time,
  mix,
  color,
  vec3,
  positionLocal,
  length,
  float,
} from 'three/tsl'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { Pane } from 'tweakpane'

export function initScene(canvas: HTMLCanvasElement): () => void {

  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(devicePixelRatio)


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


  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.minDistance = 5
  controls.maxDistance = 60

  // tsl uniforms
  const uFrequency = uniform(float(1.0))
  const uAmplitude = uniform(float(2.0))
  const uSpeed     = uniform(float(1.0))

  const x = positionLocal.x
  const z = positionLocal.z

  const dist = length(vec3(x, float(0), z))

  const wave = sin(
    dist.mul(uFrequency).sub(time.mul(uSpeed))
  ).mul(uAmplitude)

  const displacedPosition = vec3(x, wave, z)

  const colorLow  = color(0x0033aa)  // deep blue  (troughs)
  const colorHigh = color(0x00ffcc)  // cyan        (peaks)
  const t01 = wave.div(uAmplitude).mul(0.5).add(0.5)
  const finalColor = mix(colorLow, colorHigh, t01)

  const material = new THREE.MeshBasicNodeMaterial({ wireframe: false })
  material.positionNode = displacedPosition
  material.colorNode    = finalColor

  const geometry = new THREE.PlaneGeometry(30, 30, 200, 200)
  // rotate plane so it lies flat on XZ
  geometry.rotateX(-Math.PI / 2)

  const mesh = new THREE.Mesh(geometry, material)
  scene.add(mesh)

  // tweakpane UI
  const params = {
    frequency: uFrequency.value as number,
    amplitude: uAmplitude.value as number,
    speed:     uSpeed.value as number,
    wireframe: false,
  }

  const pane = new Pane({ title: 'Wave Controls' })
  pane.addBinding(params, 'frequency', { min: 0.01, max: 5.0, step: 0.01 })
    .on('change', ({ value }) => { uFrequency.value = value })
  pane.addBinding(params, 'amplitude', { min: 0.0, max: 8.0, step: 0.1 })
    .on('change', ({ value }) => { uAmplitude.value = value })
  pane.addBinding(params, 'speed', { min: 0.0, max: 5.0, step: 0.1 })
    .on('change', ({ value }) => { uSpeed.value = value })
  pane.addBinding(params, 'wireframe')
    .on('change', ({ value }) => { material.wireframe = value })


  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight
    camera.updateProjectionMatrix()
    renderer.setSize(window.innerWidth, window.innerHeight)
  }
  window.addEventListener('resize', onResize)

  // render loop
  let animId: number
  const animate = () => {
    animId = requestAnimationFrame(animate)
    controls.update()
    renderer.render(scene, camera)
  }

  renderer.init().then(() => animate())


  return () => {
    cancelAnimationFrame(animId)
    window.removeEventListener('resize', onResize)
    controls.dispose()
    pane.dispose()
    renderer.dispose()
    geometry.dispose()
    material.dispose()
  }
}