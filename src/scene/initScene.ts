import * as THREE from 'three/webgpu'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { PointerLockControls } from 'three/examples/jsm/Addons.js'
import { FlyControls } from 'three/examples/jsm/Addons.js'
import { createTerrain } from './createTerrain'
import { createPane } from './createPane'

export function initScene(canvas: HTMLCanvasElement): () => void {
    const timer = new THREE.Timer()

    const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight)
    renderer.setPixelRatio(devicePixelRatio)
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace
    renderer.toneMapping = THREE.NoToneMapping

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x111111)

    const camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    )
    camera.position.set(20, 10, 20)
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