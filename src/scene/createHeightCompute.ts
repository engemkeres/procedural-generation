import * as THREE from 'three/webgpu'
import {
    Fn,
    float,
    instanceIndex,
    textureStore,
    uvec2,
    vec2,
    vec4
} from 'three/tsl'

import { fbm, shapeTerrainMode } from './tslHelpers'
import {
    TERRAIN_RESOLUTION,
    TERRAIN_SIZE,
    type TerrainUniforms
} from './createTerrain'

const TERRAIN_HALF_SIZE = TERRAIN_SIZE * 0.5

export interface HeightComputeResources {
    heightTexture: THREE.StorageTexture
    resolution: number
    markDirty: () => void
    runIfDirty: () => void
    dispose: () => void
}

export function createHeightCompute(
    renderer: THREE.WebGPURenderer,
    uniforms: TerrainUniforms,
    resolution = TERRAIN_RESOLUTION
): HeightComputeResources {
    const heightTexture = new THREE.StorageTexture(resolution, resolution)
    heightTexture.type = THREE.FloatType
    heightTexture.minFilter = THREE.LinearFilter
    heightTexture.magFilter = THREE.LinearFilter
    heightTexture.generateMipmaps = false
    heightTexture.name = 'terrain-height-map'

    const computeHeight = Fn(({ storageTexture }: { storageTexture: any }) => {
        // just unflattening an array
        const posX = instanceIndex.mod(resolution)
        const posY = instanceIndex.div(resolution)
        const indexUV = uvec2(posX, posY)

        // texel coord to terrain sample position
        const uvCoord = vec2(
            float(posX).div(float(resolution - 1)),
            float(posY).div(float(resolution - 1))
        )

        // map uv to world space
        const worldXZ = uvCoord.mul(float(TERRAIN_SIZE)).sub(float(TERRAIN_HALF_SIZE))

        const rawHeight = fbm({
            st: worldXZ,
            uFrequency: uniforms.uFrequency,
            uOctaves: uniforms.uOctaves,
            uLacunarity: uniforms.uLacunarity,
            uGain: uniforms.uGain
        })

        const shapedHeight = shapeTerrainMode({
            value: rawHeight,
            mode: uniforms.uTerrainMode
        })

        const height = shapedHeight.mul(uniforms.uAmplitude)

        textureStore(storageTexture, indexUV, vec4(height, 0.0, 0.0, 1.0)).toWriteOnly()
    })

    const computeNode: any = computeHeight({ storageTexture: heightTexture }).compute(
        resolution * resolution
    )

    let isDirty = true

    return {
        heightTexture,
        resolution,
        markDirty: () => {
            isDirty = true
        },
        runIfDirty: () => {
            if (!isDirty) {
                return
            }

            renderer.compute(computeNode)
            isDirty = false
        },
        dispose: () => {
            heightTexture.dispose()

            if (typeof computeNode.dispose === 'function') {
                computeNode.dispose()
            }
        }
    }
}
