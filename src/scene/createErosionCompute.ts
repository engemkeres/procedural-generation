import * as THREE from 'three/webgpu'
import {
    Fn,
    abs,
    distance,
    equal,
    float,
    instanceIndex,
    int,
    length,
    max,
    min,
    select,
    sqrt,
    texture,
    textureStore,
    uniform,
    uvec2,
    vec2,
    vec4,
    velocity
} from 'three/tsl'

import { fbm } from './tslHelpers'
import {
    TERRAIN_RESOLUTION,
    TERRAIN_SIZE,
    TERRAIN_WORLD_STEP,
    type TerrainUniforms
} from './createTerrain'

const TERRAIN_HALF_SIZE = TERRAIN_SIZE * 0.5

function createStorageTexture(
    name: string,
    resolution: number
): THREE.StorageTexture {
    const textureHandle = new THREE.StorageTexture(resolution, resolution)
    textureHandle.type = THREE.FloatType
    textureHandle.minFilter = THREE.NearestFilter // when texel covers less then one pixel
    textureHandle.magFilter = THREE.NearestFilter // when texel covers more then one pixel
    textureHandle.generateMipmaps = false
    textureHandle.name = name
    return textureHandle

}

export interface ErosionUniforms {
    uDt: any
    uGravity: any
    uPipeArea: any
    uPipeLength: any
    uRainRate: any
    uEvaporation: any
    uFlowDamping: any
    uSedimentCapacity: any
    uDepositionRate: any
    uErosionRate: any
    uMinWater: any
    uAdvection: any
    uSourceEnabled: any
    uSourcePos: any
    uSourceRadius: any
    uSourceAmount: any
    uMaxErosionDepth: any
    uMaxBedDelta: any
    uRainSplashRate: any
    uThermalEnabled: any
    uThermalRate: any
    uTalusSlope: any
    uTalusFade: any
}

export function createErosionUniforms(): ErosionUniforms {
    return {
        uDt: uniform(float(0.025)),
        uGravity: uniform(float(9.81)), // ofc
        uPipeArea: uniform(float(0.8)), // A
        uPipeLength: uniform(float(TERRAIN_WORLD_STEP)), // l
        uRainRate: uniform(float(0.0006)), // constant for each cell
        uEvaporation: uniform(float(0.05)),
        uFlowDamping: uniform(float(0.25)), //why tho?
        uSedimentCapacity: uniform(float(0.7)),
        uDepositionRate: uniform(float(0.12)),
        uErosionRate: uniform(float(0.08)),
        uMinWater: uniform(float(0.0)),
        uAdvection: uniform(float(0.3)),
        uSourceEnabled: uniform(int(0)),
        uSourcePos: uniform(vec2(0.5, 0.5)),
        uSourceRadius: uniform(float(0.12)),
        uSourceAmount: uniform(float(0.008)),
        uMaxErosionDepth: uniform(float(2.0)),
        uMaxBedDelta: uniform(float(TERRAIN_WORLD_STEP * 0.25)),
        uRainSplashRate: uniform(float(0.03)),
        uThermalEnabled: uniform(int(0)),
        uThermalRate: uniform(float(0.06)),
        uTalusSlope: uniform(float(0.45)),
        uTalusFade: uniform(float(0.25))
    }
}

interface ErosionState {
    bed: THREE.StorageTexture
    water: THREE.StorageTexture
    sediment: THREE.StorageTexture
    flux: THREE.StorageTexture
    velocity: THREE.StorageTexture
}

export interface ErosionComputeResources {
    bedTexture: THREE.StorageTexture
    resolution: number
    uniforms: ErosionUniforms
    resetFromNoise: () => void
    step: (iterations?: number) => void
    dispose: () => void
}

export function createErosionCompute(
    renderer: THREE.WebGPURenderer,
    terrainUniforms: TerrainUniforms,
    erosionUniforms: ErosionUniforms = createErosionUniforms(),
    resolution = TERRAIN_RESOLUTION 
): ErosionComputeResources {
    const texelStep = 1 / Math.max(resolution - 1, 1)
    const texelStepNode = float(texelStep) // simple var to node
    const cellAreaNode = float(TERRAIN_WORLD_STEP * TERRAIN_WORLD_STEP) // world step is just literally that, the square size
    const cellStep2Node = float (2 * TERRAIN_WORLD_STEP) // why exactly is this needed?
    const resMinusOne = Math.max(resolution - 1, 1)

    // why do I need both of these tho?
    const bedRenderTexture = createStorageTexture('erosion-bed-render', resolution)
    const bedBaseTexture = createStorageTexture('erosion-bed-base', resolution)

    const stateA: ErosionState = {
        bed: createStorageTexture('erosion-bed-a', resolution),
        water: createStorageTexture('erosion-water-a', resolution),
        sediment: createStorageTexture('erosion-sediment-a', resolution),
        flux: createStorageTexture('erosion-flux-a', resolution),
        velocity: createStorageTexture('erosion-velocity-a', resolution)
    }

    const stateB: ErosionState = {
        bed: createStorageTexture('erosion-bed-b', resolution),
        water: createStorageTexture('erosion-water-b', resolution),
        sediment: createStorageTexture('erosion-sediment-b', resolution),
        flux: createStorageTexture('erosion-flux-b', resolution),
        velocity: createStorageTexture('erosion-velocity-b', resolution)
    }

    const waterScratch = createStorageTexture('erosion-water-scratch', resolution)

    const initializeState = Fn(({
        bedOut,
        waterOut,
        sedimentOut,
        fluxOut
    }: {
        bedOut: any
        waterOut: any
        sedimentOut: any
        fluxOut: any
    }) => {
        // array into grid coords
        const posX = instanceIndex.mod(resolution)
        const posY = instanceIndex.div(resolution)
        const indexUV = uvec2(posX, posY) // uvec2 as in vec2 of unsigned integers

        // int coords into normalized coords [0,1]
        // TODO: kiszámolni hogy nem basztam-e el
        const uvCoord = vec2(
            float(posX).div(float(resMinusOne)),
            float(posY).div(float(resMinusOne))
        )

        // [0,1]*30-15: just recenters it in world space
        const worldXZ = uvCoord.mul(float(TERRAIN_SIZE)).sub(float(TERRAIN_HALF_SIZE))

        // straight copy from createHeightCompute
        const bed = fbm({
            st: worldXZ,
            uFrequency: terrainUniforms.uFrequency,
            uOctaves: terrainUniforms.uOctaves,
            uLacunarity: terrainUniforms.uLacunarity,
            uGain: terrainUniforms.uGain,
            uTerrainMode: terrainUniforms.uTerrainMode
        }).mul(terrainUniforms.uAmplitude)

        // there is a starter terrain, but no water or sediment in the beginning
        textureStore(bedOut, indexUV, vec4(bed, 0.0, 0.0, 1.0)).toWriteOnly
        textureStore(waterOut, indexUV, vec4(0.0, 0.0, 0.0, 1.0)).toWriteOnly
        textureStore(sedimentOut, indexUV, vec4(0.0, 0.0, 0.0, 1.0)).toWriteOnly
        // rgba is the 4 directions here
        textureStore(fluxOut, indexUV, vec4(0.0, 0.0, 0.0, 0.0)).toWriteOnly
    })

    // just a copy function boilerplate
    const copyBedToBase = Fn(({
        bedIn,
        bedBaseOut
    }: {
        bedIn: any
        bedBaseOut: any
    }) => {
        const posX = instanceIndex.mod(resolution)
        const posY = instanceIndex.div(resolution)
        const indexUV = uvec2(posX, posY)

        const uvCoord = vec2(
            float(posX).div(float(resMinusOne)),
            float(posY).div(float(resMinusOne))
        )

        const bed = texture(bedIn, uvCoord).r
        textureStore(bedBaseOut, indexUV, vec4(bed, 0.0, 0.0, 1.0)).toWriteOnly()
        // TODO: check why toWriteOnly changes actually
    })

    // as it says
    const clearVelocity = Fn(({
        velocityOut
    }: {
        velocityOut: any
    }) => {
        const posX = instanceIndex.mod(resolution)
        const posY = instanceIndex.div(resolution)
        const indexUV = uvec2(posX, posY)

        textureStore(velocityOut, indexUV, vec4(0.0, 0.0, 0.0, 1.0)).toWriteOnly()
    })

    // const copyBedToRender is literally the same as copyBedToBase, leave it out
    const copyBedToRender = Fn(({
        bedIn,
        bedRenderOut
    }: {
        bedIn: any
        bedRenderOut: any
    }) => {
        const posX = instanceIndex.mod(resolution)
        const posY = instanceIndex.div(resolution)
        const indexUV = uvec2(posX, posY)

        const uvCoord = vec2(
            float(posX).div(float(resMinusOne)),
            float(posY).div(float(resMinusOne))
        )

        const bed = texture(bedIn, uvCoord).r
        textureStore(bedRenderOut, indexUV, vec4(bed, 0.0, 0.0, 1.0)).toWriteOnly()
    })

    const addWater = Fn(({
        waterIn,
        waterOut
    }: {
        waterIn: any
        waterOut: any
    }) => {
        // same starter boilerplate
        const posX = instanceIndex.mod(resolution)
        const posY = instanceIndex.div(resolution)
        const indexUV = uvec2(posX, posY)

        const uvCoord = vec2(
            float(posX).div(float(resMinusOne)),
            float(posY).div(float(resMinusOne))
        )

        // be careful with the edge of the terrain
        const isLeftEdge = equal(posX, int(0))
        const isRightEdge = equal(posX, int(resolution - 1))
        const isBottomEdge = equal(posY, int(0))
        const isTopEdge = equal(posY, int(resolution - 1))

        // corners contribute twice, no problem tho
        const boundaryMask = select(isLeftEdge, float(1.0), float(0.0))
            .add(select(isRightEdge, float(1.0), float(0.0)))
            .add(select(isBottomEdge, float(1.0), float(0.0)))
            .add(select(isTopEdge, float(1.0), float(0.0)))
        
        //
        const keepMask = float(1.0).sub(min(float(1.0), boundaryMask))
    })
}