import * as THREE from 'three/webgpu'
import { PointerLockControls } from 'three/examples/jsm/Addons.js'
import { createTerrain, createTerrainUniforms, TERRAIN_RESOLUTION } from './createTerrain'
import { createPane } from './createPane'
import { createErosionCompute, createErosionUniforms } from './createErosionCompute'
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
    sun.position.set(8, 8, -12)

    scene.add(sun)
    scene.add(new THREE.AmbientLight(0x8899aa, 0.25))

    const camera = new THREE.PerspectiveCamera(
        50,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    )
    camera.position.set(15, 8, 15)
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

    const terrainUniforms = createTerrainUniforms()
    const erosionUniforms = createErosionUniforms()
    const erosionResolution = TERRAIN_RESOLUTION//Math.floor((TERRAIN_RESOLUTION - 1) * 0.75 ) + 1
    const erosionCompute = createErosionCompute(
        renderer,
        terrainUniforms,
        erosionUniforms,
        erosionResolution
    )

    const { mesh } = createTerrain({
        uniforms: terrainUniforms,
        heightTexture: erosionCompute.bedTexture,
        heightResolution: erosionCompute.resolution
    })
    scene.add(mesh)

    let erosionResetPending = true
    let pendingErosionIterations = 0
    let erosionContinuous = false
    let continuousIterationsPerFrame = 80

    const MAX_ITERATIONS_PER_FRAME = 2000

    let terrainRebuildTimeout: number | undefined

    const requestTerrainRebuild = () => {
        if (terrainRebuildTimeout !== undefined) {
            window.clearTimeout(terrainRebuildTimeout)
        }

        terrainRebuildTimeout = window.setTimeout(() => {
            erosionResetPending = true
            terrainRebuildTimeout = undefined
        }, 150)
    }

    const pane = createPane(
        terrainUniforms,
        mesh.material as THREE.MeshBasicNodeMaterial,
        {
            onTerrainParamsChange: requestTerrainRebuild,
            onErosionStep: (iterations) => {
                pendingErosionIterations += Math.max(1, Math.floor(iterations))
            },
            onErosionReset: () => {
                erosionResetPending = true
                pendingErosionIterations = 0
                erosionContinuous = false
            },
            onErosionContinuousChange: (enabled) => {
                erosionContinuous = enabled
            },
            onErosionContinuousIterationsChange: (iterationsPerFrame) => {
                continuousIterationsPerFrame = Math.max(1, Math.floor(iterationsPerFrame))
            }
        },
        erosionUniforms
    )

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)


    renderer.setAnimationLoop(() => {
        if (erosionResetPending) {
            erosionCompute.resetFromNoise()
            erosionResetPending = false
        }

        if (pendingErosionIterations > 0) {
            const iterationsThisFrame = Math.min(MAX_ITERATIONS_PER_FRAME, pendingErosionIterations)
            erosionCompute.step(iterationsThisFrame)
            pendingErosionIterations -= iterationsThisFrame
        }

        if (erosionContinuous) {
            const iterationsThisFrame = Math.min(
                MAX_ITERATIONS_PER_FRAME,
                Math.max(1, Math.floor(continuousIterationsPerFrame))
            )
            erosionCompute.step(iterationsThisFrame)
        }

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

        if (terrainRebuildTimeout !== undefined) {
            window.clearTimeout(terrainRebuildTimeout)
        }

        controls.dispose()
        pane.dispose()
        erosionCompute.dispose()
        renderer.dispose()
    }
}