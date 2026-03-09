import * as THREE from 'three/webgpu'
import {noise2D, fbm, myRandom} from './tslHelpers'
import {
    uniform,
    int, float, vec2, vec3, vec4, mat2, mat3, mat4,
    sin, cos, PI, TWO_PI, atan,
    length,
    mix, color,
    positionLocal,
    screenUV, uv,
    time,
    abs, pow, exp, log, sqrt,
    Fn,
    step, smoothstep,
    fract, floor, mod,
    distance,
    min, max,
    viewportResolution,
    select,
    dot,
    notEqual, greaterThanEqual, greaterThan, equal, lessThanEqual, lessThan,
    If, Loop,
    rand,
    array,
} from 'three/tsl'

export interface TerrainUniforms {
    uFrequency: ReturnType<typeof uniform>
    uAmplitude: ReturnType<typeof uniform>
    uOctaves:   ReturnType<typeof uniform>
    uLacunarity:ReturnType<typeof uniform>
    uGain:      ReturnType<typeof uniform>
}

export function createTerrain(): { mesh: THREE.Mesh; uniforms: TerrainUniforms } {

    // uniforms
    const uFrequency    = uniform(float(.5))
    const uAmplitude    = uniform(float(2.))
    const uOctaves      = uniform(int(5))
    const uLacunarity   = uniform(float(2.))
    const uGain         = uniform(float(.5))

    const uMouse = uniform(new THREE.Vector2(0, 0))

    window.addEventListener('mousemove', (e) => {
        uMouse.value.x = e.clientX / window.innerWidth
        uMouse.value.y = 1.0 - (e.clientY / window.innerHeight)
    })

    // coords of the plane I want to displace
    const xz = vec2(positionLocal.x, positionLocal.z)

    // basic fBM for basic terrain
    const h: any = fbm({st: xz, uFrequency, uOctaves, uLacunarity, uGain})
    const height = h.mul(uAmplitude)
    const displacedPosition = vec3(positionLocal.x, height, positionLocal.z)

    let col: any = vec3(h)

    // material
    const material = new THREE.MeshBasicNodeMaterial({ wireframe: false })
    material.positionNode = displacedPosition
    material.colorNode    = col
    material.side         = THREE.DoubleSide

    // plane in the right orientation
    const geometry = new THREE.PlaneGeometry(30, 30, 512, 512)
    geometry.rotateX(-Math.PI / 2)

    const mesh = new THREE.Mesh(geometry, material)
    return { mesh, uniforms: { uFrequency, uAmplitude, uOctaves, uLacunarity, uGain } }
}