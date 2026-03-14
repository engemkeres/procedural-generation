import * as THREE from 'three/webgpu'
import {noise2D, fbm, myRandom} from './tslHelpers'
import {
    uniform,
    int, float, vec2, vec3, vec4, mat2, mat3, mat4,
    sin, cos, PI, TWO_PI, atan,
    length,
    mix, color,
    positionLocal,
    cross, dot, normalize,
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
    notEqual, greaterThanEqual, greaterThan, equal, lessThanEqual, lessThan,
    If, Loop,
    rand,
    array,
    EPSILON,
    transformNormalToView, transformDirection,
    normalView, positionView, cameraViewMatrix
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
    const uSunDir       = uniform(vec3(30, 40, 20))

    // coords of the plane I want to displace
    const xz = vec2(positionLocal.x, positionLocal.z)

    const terrainHeight = Fn(({p}: {p: any }) => {
        const h: any = fbm({st: p, uFrequency, uOctaves, uLacunarity, uGain})
        const noiseHeight = h.mul(uAmplitude)

        return noiseHeight
    })

    const finalHeight = terrainHeight({p: xz})
    const displacedPosition = vec3(positionLocal.x, finalHeight, positionLocal.z)

    // normal calculation
    const eps = float(0.05)
    const hC = finalHeight
    const hX = terrainHeight({p: xz.add(vec2(eps, 0.0))})
    const hZ = terrainHeight({p: xz.add(vec2(0.0, eps))})

    const pC = vec3(positionLocal.x, hC, positionLocal.z)
    const pX = vec3(positionLocal.x.add(eps), hX, positionLocal.z)
    const pZ = vec3(positionLocal.x, hZ, positionLocal.z.add(eps))

    const terrainNormal = normalize(cross(pZ.sub(pC), pX.sub(pC)))

    // blinn-phong
    const lightDirWorld = normalize(uSunDir)
    const N = transformNormalToView(terrainNormal).normalize()
    const L = transformNormalToView(lightDirWorld).normalize()
    const V = positionView.negate().normalize()
    const H = L.add(V).normalize()

    const diffuse = dot(N, L).max(0.0)
    const specular = float(0.0) //dot(N, H).max(0.0).pow(float(32.0))

    const baseColor = color('#462f1c')
    const uAmbient = float(0.1)
    const uDiffuse = float(1.0)
    const uSpecular = float(.0)

    const litColor = baseColor.mul(uAmbient.add(diffuse.mul(uDiffuse)))
        .add(vec3(specular.mul(uSpecular)))


    // material
    const material = new THREE.MeshBasicNodeMaterial({ wireframe: false})
    material.positionNode = displacedPosition
    // material.normalNode   = transformNormalToView(terrainNormal)
    material.colorNode    = litColor
    material.side         = THREE.DoubleSide

    // plane in the right orientation
    const geometry = new THREE.PlaneGeometry(30, 30, 512, 512)
    geometry.rotateX(-Math.PI / 2)

    const mesh = new THREE.Mesh(geometry, material)
    return { mesh, uniforms: { uFrequency, uAmplitude, uOctaves, uLacunarity, uGain } }
}