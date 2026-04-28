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
    transformDirection,
    modelWorldMatrix,
    texture
} from 'three/tsl'

export const TERRAIN_SIZE = 30
export const TERRAIN_SEGMENTS = 1024
export const TERRAIN_RESOLUTION = TERRAIN_SEGMENTS + 1
export const TERRAIN_WORLD_STEP = TERRAIN_SIZE / TERRAIN_SEGMENTS

export interface TerrainUniforms {
    uFrequency: any
    uAmplitude: any
    uOctaves: any
    uLacunarity: any
    uGain: any
    uTerrainMode: any
    uSunDir: any
}

interface CreateTerrainOptions {
    uniforms?: TerrainUniforms
    heightTexture?: THREE.Texture
    heightResolution?: number
}

export function createTerrainUniforms(): TerrainUniforms {
    return {
        uFrequency: uniform(float(.2)),
        uAmplitude: uniform(float(6.)),
        uOctaves: uniform(int(5)),
        uLacunarity: uniform(float(2.)),
        uGain: uniform(float(.5)),
        uTerrainMode: uniform(int(0)),
        uSunDir: uniform(vec3(8, 8, -12))
    }
}

export function createTerrain(options: CreateTerrainOptions = {}): { mesh: THREE.Mesh; uniforms: TerrainUniforms } {

    const uniforms = options.uniforms ?? createTerrainUniforms()
    const { uFrequency, uAmplitude, uOctaves, uLacunarity, uGain, uTerrainMode, uSunDir } = uniforms

    const hasHeightTexture = options.heightTexture !== undefined
    const heightTexture = options.heightTexture
    const heightResolution = options.heightResolution ?? TERRAIN_RESOLUTION

    // coords of the plane I want to displace
    const xz = vec2(positionLocal.x, positionLocal.z)
    const terrainUV = uv()
    const worldStep = float(TERRAIN_WORLD_STEP)
    const texelStep = float(1.0 / Math.max(heightResolution - 1, 1))

    const terrainHeight = Fn(({p}: {p: any }) => {
        const noiseHeight = fbm({
            st: p,
            uFrequency,
            uOctaves,
            uLacunarity,
            uGain,
            uTerrainMode
        }).mul(uAmplitude)

        return noiseHeight
    })


    const sampleHeight = hasHeightTexture && heightTexture
        ? Fn(({p}: {p: any}) => {
            const clampedUV = min(max(p, vec2(0.0, 0.0)), vec2(1.0, 1.0))
            return texture(heightTexture, clampedUV).r
        })
        : Fn(({p}: {p: any}) => terrainHeight({p}))

    let finalHeight: any
    let terrainNormal: any

    if (hasHeightTexture) {
        finalHeight = sampleHeight({p: terrainUV})

        const hXp = sampleHeight({p: terrainUV.add(vec2(texelStep, 0.0))})
        const hXm = sampleHeight({p: terrainUV.sub(vec2(texelStep, 0.0))})
        const hZp = sampleHeight({p: terrainUV.add(vec2(0.0, texelStep))})
        const hZm = sampleHeight({p: terrainUV.sub(vec2(0.0, texelStep))})

        const pXp = vec3(positionLocal.x.add(worldStep), hXp, positionLocal.z)
        const pXm = vec3(positionLocal.x.sub(worldStep), hXm, positionLocal.z)
        const pZp = vec3(positionLocal.x, hZp, positionLocal.z.add(worldStep))
        const pZm = vec3(positionLocal.x, hZm, positionLocal.z.sub(worldStep))

        terrainNormal = normalize(cross(pZp.sub(pZm), pXp.sub(pXm)))
    } else {
        finalHeight = sampleHeight({p: xz})

        const hXp = sampleHeight({p: xz.add(vec2(worldStep, 0.0))})
        const hXm = sampleHeight({p: xz.sub(vec2(worldStep, 0.0))})
        const hZp = sampleHeight({p: xz.add(vec2(0.0, worldStep))})
        const hZm = sampleHeight({p: xz.sub(vec2(0.0, worldStep))})

        const pXp = vec3(positionLocal.x.add(worldStep), hXp, positionLocal.z)
        const pXm = vec3(positionLocal.x.sub(worldStep), hXm, positionLocal.z)
        const pZp = vec3(positionLocal.x, hZp, positionLocal.z.add(worldStep))
        const pZm = vec3(positionLocal.x, hZm, positionLocal.z.sub(worldStep))

        terrainNormal = normalize(cross(pZp.sub(pZm), pXp.sub(pXm)))
    }

    const displacedPosition = vec3(positionLocal.x, finalHeight, positionLocal.z)

    // lambert diffuse in world space keeps lighting camera-invariant
    const lightDirWorld = vec3(uSunDir).normalize()
    const N = transformDirection(terrainNormal, modelWorldMatrix).normalize()
    const L = lightDirWorld

    const diffuse = dot(N, L).max(0.0)
    const specular = float(0.0)

    const baseColor = color('#644427')
    const uAmbient = float(0.1)
    const uDiffuse = float(1.0)
    const uSpecular = float(.0)

    const litColor = baseColor
        .mul(uAmbient.add(diffuse.mul(uDiffuse)))
        .add(vec3(specular.mul(uSpecular)))


    // material
    const material = new THREE.MeshBasicNodeMaterial({ wireframe: false})
    material.positionNode = displacedPosition
    material.colorNode    = litColor
    material.side         = THREE.DoubleSide

    // plane in the right orientation
    const geometry = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEGMENTS, TERRAIN_SEGMENTS)
    geometry.rotateX(-Math.PI / 2)

    const mesh = new THREE.Mesh(geometry, material)
    return { mesh, uniforms }
}