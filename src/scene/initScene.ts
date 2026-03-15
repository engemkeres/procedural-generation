import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/Addons.js'
import { FlyControls } from 'three/examples/jsm/Addons.js'
import { createTerrain } from './createTerrain'
import { createPane } from './createPane'
import {
    positionWorldDirection,
    color,
    mix,
    smoothstep,
    float,
    max
} from 'three/tsl'

export function initScene(canvas: HTMLCanvasElement): () => void {
    const timer = new THREE.Timer()

    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(devicePixelRatio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap

    const scene = new THREE.Scene()

    const horizon = color('#b8d7ff')
    const zenith = color('#3f5f9a')
    const groundTint = color('#d9c7b0')

    const dirY = positionWorldDirection.y
    const skyT = smoothstep(float(0.0), float(0.9), max(dirY, float(0.0)))
    const groundT = smoothstep(float(-0.9), float(0.0), dirY)

    const skyColor = mix(horizon, zenith, skyT)
    const fullBg = mix(groundTint, skyColor, groundT)

    scene.backgroundNode = fullBg

    const sun = new THREE.DirectionalLight(0xFFFFFF, 2.00)
    sun.position.set(30, 40, 20)
    // sun.castShadow = true
    // sun.shadow.mapSize.set(2048, 2048)
    // sun.shadow.camera.left = -30
    // sun.shadow.camera.right = 30
    // sun.shadow.camera.top = 30
    // sun.shadow.camera.bottom = -30
    // sun.shadow.camera.near = 1
    // sun.shadow.camera.far = 120

    // sun.shadow.bias = -0.001
    // sun.shadow.normalBias = 0.05

    scene.add(sun)
    scene.add(new THREE.AmbientLight(0x8899aa, 0.25))

    const camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    )
    camera.position.set(15, 2, 15)
    camera.lookAt(0, 0, 0)

    const controls = new PointerLockControls(camera, canvas)

    canvas.addEventListener('click', () => controls.lock())

    const keys: Record<string, boolean> = {}
    const onKeyDown = (e: KeyboardEvent) => {keys[e.code] = true}
    const onKeyUp = (e: KeyboardEvent) => {keys[e.code] = false}
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)

    const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.02, 20, 90)
        camera.updateProjectionMatrix()
    }

    canvas.addEventListener('wheel', onWheel)

    const { mesh, uniforms } = createTerrain()
    // mesh.castShadow = true
    // mesh.receiveShadow = true
    scene.add(mesh)

    const pane = createPane(uniforms, mesh.material as THREE.MeshBasicNodeMaterial)

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)


    renderer.setAnimationLoop(() => {
        timer.update()
        const delta = timer.getDelta()
        const speed = 4 * delta

        if (controls.isLocked) {
            if (keys['KeyW']) controls.moveForward(speed)
            if (keys['KeyS']) controls.moveForward(-speed)
            if (keys['KeyA']) controls.moveRight(-speed/2)
            if (keys['KeyD']) controls.moveRight(speed/2)

            if (keys['ShiftLeft'] || keys['ShiftRight']) camera.position.y += speed/4
            if (keys['Space']) camera.position.y -= speed/4
        }

        renderer.render(scene, camera)
    })

    return () => {
        renderer.setAnimationLoop(null)
        window.removeEventListener('resize', onResize)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        canvas.removeEventListener('wheel', onWheel)
        controls.dispose()
        pane.dispose()
        renderer.dispose()
    }
}