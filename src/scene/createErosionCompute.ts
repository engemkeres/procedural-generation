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
    const texelStepNode = float(texelStep) // simple var to node // rename later to cell-something?
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
        
        // min caps corners to one, flip it so 1 is interior and 0 is edge
        const keepMask = float(1.0).sub(min(float(1.0), boundaryMask))

        // rename to waterCurrent?
        const dCurrent = texture(waterIn, uvCoord).r

        // same constant rain everywhere r*Δt
        const rainAdd = erosionUniforms.uRainRate.mul(erosionUniforms.uDt)

        // change here, removed source stuff and minwater parameter
        const dAfterRain = dCurrent.add(rainAdd).mul(keepMask)

        // TODO: keep vec4 for these or change it to scalar?
        // boundaries act as open drains, so water does not pile up
        textureStore(waterOut, indexUV, vec4(dAfterRain, 0.0, 0.0, 1.0)).toWriteOnly()
    })

    // each cell has 4 virtual pipes, same with the neighbors.
    // water outflow flux is updated with the pressure diff between connected cells.
    // fL(t+Δt) = max(0, fL(t,x,y) + Δt*A*g*ΔhL(x,y)/l )
    // ΔhL(x,y) is the height diff between left and current cell
    // ΔhL(x,y) = bt(x,y) + d1(x,y) - bt(x-1, y) - d1(x-1,y)
    // where bt is current terrain height, and d1 is the intermediate water height
    const computeFlux = Fn(({
        bedIn,
        waterIn,
        fluxIn,
        fluxOut
    }: {
        bedIn: any
        waterIn: any
        fluxIn: any
        fluxOut: any
    }) => {
        const posX = instanceIndex.mod(resolution)
        const posY = instanceIndex.div(resolution)
        const indexUV = uvec2(posX, posY)

        const uvCoord = vec2(
            float(posX).div(float(resMinusOne)),
            float(posY).div(float(resMinusOne))
        )

        // get the uv coord of the neighboring cells
        // uvCoord is the current, texelStepNode is one sideway step
        // min, max is to prevent sampling outside the texture
        const uvL = min(
            max(
                uvCoord.sub(vec2(texelStepNode, 0.0)),
                vec2(0.0, 0.0)
            ),
            vec2(1.0, 1.0)
        )

        const uvR = min(
            max(
                uvCoord.add(vec2(texelStepNode, 0.0)),
                vec2(0.0, 0.0)
            ),
            vec2(1.0, 1.0)
        )

        const uvT = min(
            max(
                uvCoord.add(vec2(0.0, texelStepNode)),
                vec2(0.0, 0.0)
            ),
            vec2(1.0, 1.0)
        )

        const uvB = min(
            max(
                uvCoord.sub(vec2(0.0, texelStepNode)),
                vec2(0.0, 0.0)
            ),
            vec2(1.0, 1.0)
        )
        
        const b = texture(bedIn, uvCoord).r
        const d = texture(waterIn, uvCoord).r
        const h = b.add(d) // the water in of this has to be after the rain!

        // the neighbor heights
        const hL = texture(bedIn, uvL).r.add(texture(waterIn, uvL).r)
        const hR = texture(bedIn, uvR).r.add(texture(waterIn, uvR).r)
        const hT = texture(bedIn, uvT).r.add(texture(waterIn, uvT).r)
        const hB = texture(bedIn, uvB).r.add(texture(waterIn, uvB).r)

        // f as in flux, vec4 is the left-right-top-bottom
        const fPrev = texture(fluxIn, uvCoord)
        const dt = max(erosionUniforms.uDt, float(0.0001)) // there has to be a min
        const l = max(erosionUniforms.uPipeLength, float(0.0001))
        const A = erosionUniforms.uPipeArea
        const g = erosionUniforms.uGravity
        // fL(t+Δt) = max(0, fL(t,x,y) + Δt*A*g*ΔhL(x,y)/l )
        const k = dt.mul(A).mul(g).div(l)

        // fL(t+Δt) = max(0, fL(t,x,y) + Δt*A*g*ΔhL(x,y)/l )
        // ΔhL(x,y) is the height diff between left and current cell
        // middle(bed+water) - left(bed+water)
        let fL = max(float(0.0), fPrev.r.add(k.mul(h.sub(hL))))
        let fR = max(float(0.0), fPrev.g.add(k.mul(h.sub(hR))))
        let fT = max(float(0.0), fPrev.b.add(k.mul(h.sub(hT))))
        let fB = max(float(0.0), fPrev.a.add(k.mul(h.sub(hB))))

        // if our cell is boundary, there should be zero flux "leaving"
        const isLeftEdge = equal(posX, int(0))
        const isRightEdge = equal(posX, int(resolution - 1))
        const isBottomEdge = equal(posY, int(0))
        const isTopEdge = equal(posY, int(resolution - 1))

        const fLBounded = float(select(isLeftEdge, float(0.0), fL))
        const fRBounded = float(select(isRightEdge, float(0.0), fR))
        const fBBounded = float(select(isBottomEdge, float(0.0), fB))
        const fTBounded = float(select(isTopEdge, float(0.0), fT))

        // total outflow should not exceed the total amount of water in the given cell
        // if larger, must be scaled!
        // K = max(1, (waterlevel*x*y)/((fL+fR+fT+fB)*dt) ) scaling
        // fi(t+Δt, x, y) = K*f(t+Δt), where i = L, R, T, B
        const sumOut = fLBounded.add(fRBounded).add(fTBounded).add(fBBounded)
        const maxOut = d.mul(cellAreaNode).div(dt)
        const scale = max(float(1.0), maxOut.div(sumOut)) // TODO: this is diff then??
        // do I really need this?
        const flowRetention = max(float(0.0), float(1.0).sub(erosionUniforms.uFlowDamping.mul(dt)))

        // same as in addWater
        const boundaryMask = select(isLeftEdge, float(1.0), float(0.0))
            .add(select(isRightEdge, float(1.0), float(0.0)))
            .add(select(isBottomEdge, float(1.0), float(0.0)))
            .add(select(isTopEdge, float(1.0), float(0.0)))
        const keepMask = float(1.0).sub(min(float(1.0), boundaryMask))

        const fLScaled = fLBounded.mul(scale).mul(keepMask)
        const fRScaled = fRBounded.mul(scale).mul(keepMask)
        const fTScaled = fTBounded.mul(scale).mul(keepMask)
        const fBScaled = fBBounded.mul(scale).mul(keepMask)

        textureStore(fluxOut, indexUV, vec4(fLScaled, fRScaled, fTScaled, fBScaled)).toWriteOnly()
    })

    const updateState = Fn(({
        bedIn,
        bedBaseIn,
        waterIn,
        sedimentIn,
        fluxIn,
        bedOut,
        waterOut,
        sedimentOut,
        velocityOut
    }: {
        bedIn: any
        bedBaseIn: any
        waterIn: any
        sedimentIn: any
        fluxIn: any
        bedOut: any
        waterOut: any
        sedimentOut: any
        velocityOut: any
    }) => {
        // vótmá
        const posX = instanceIndex.mod(resolution)
        const posY = instanceIndex.div(resolution)
        const indexUV = uvec2(posX, posY)

        const uvCoord = vec2(
            float(posX).div(float(resMinusOne)),
            float(posY).div(float(resMinusOne))
        )

        // i should maybe store this once, this is the third time using these?
        const isLeftEdge = equal(posX, int(0))
        const isRightEdge = equal(posX, int(resolution - 1))
        const isBottomEdge = equal(posY, int(0))
        const isTopEdge = equal(posY, int(resolution - 1))

        const boundaryMask = select(isLeftEdge, float(1.0), float(0.0))
            .add(select(isRightEdge, float(1.0), float(0.0)))
            .add(select(isBottomEdge, float(1.0), float(0.0)))
            .add(select(isTopEdge, float(1.0), float(0.0)))
        const keepMask = float(1.0).sub(min(float(1.0), boundaryMask))

        // ez is vótmá, TODO: kiszedni az elejére
        const uvL = min(
            max(
                uvCoord.sub(vec2(texelStepNode, 0.0)),
                vec2(0.0, 0.0)
            ),
            vec2(1.0, 1.0)
        )

        const uvR = min(
            max(
                uvCoord.add(vec2(texelStepNode, 0.0)),
                vec2(0.0, 0.0)
            ),
            vec2(1.0, 1.0)
        )

        const uvT = min(
            max(
                uvCoord.add(vec2(0.0, texelStepNode)),
                vec2(0.0, 0.0)
            ),
            vec2(1.0, 1.0)
        )

        const uvB = min(
            max(
                uvCoord.sub(vec2(0.0, texelStepNode)),
                vec2(0.0, 0.0)
            ),
            vec2(1.0, 1.0)
        )

        // fluxIn, as flux that is input for the function
        // not necessarily inward flux
        const flow = texture(fluxIn, uvCoord)
        const fL = flow.r
        const fR = flow.g
        const fT = flow.b
        const fB = flow.a

        // my left is their right and so on
        const inFromL = select(isLeftEdge, float(0.0), texture(fluxIn, uvL).g)
        const inFromR = select(isRightEdge, float(0.0), texture(fluxIn, uvR).r)
        const inFromT = select(isTopEdge, float(0.0), texture(fluxIn, uvT).a)
        const inFromB = select(isBottomEdge, float(0.0), texture(fluxIn, uvB).b)

        // calculate the ΔV water height changes with
        // sum fout and fin flow values in each (x,y) cell
        // ΔV(x,y) = Δt*(Σfin-Σfout)
        // ΔV(x,y) = ( fR(x-1,y) + fL(x+1,y) + fT(x, y-1) + fB(x, y+1) )*Δt - Σfout
        // Σfout was calculated in computeFlux step

        const sumOut = fL.add(fR).add(fT).add(fB)
        const sumIn = inFromL.add(inFromR).add(inFromT).add(inFromB)

        const dCurrent = texture(waterIn, uvCoord).r
        const dUpdated = dCurrent.add(erosionUniforms.uDt.mul(sumIn.sub(sumOut)).div(cellAreaNode))

        // calculate velocity using the outflow flux
        // velocity needed for the hydraulic erosion and deposition calculation
        // ΔWx = 0.5 * (fR(x-1,y)-fL(x,y)+fR(x,y)-fL(x+1,y))
        // aka half of what leaves the left neighbor towards us,
        // what leaves our cell towards the left side, same for right
        const wx = float(0.5).mul(inFromL.sub(fL).add(fR).sub(inFromR))
        const wz = float(0.5).mul(inFromB.sub(fB).add(fT).sub(inFromT))

        // TODO: remove bed base later if not needed for a fix
        const bCurrent = texture(bedIn, uvCoord).r
        const bBase = texture(bedBaseIn, uvCoord).r

        const bL = texture(bedIn, uvL).r
        const bR = texture(bedIn, uvR).r
        const bT = texture(bedIn, uvT).r
        const bB = texture(bedIn, uvB).r

        // calculate C water sediment capacity
        // C(x,y) = Kc * sin(α(x,y))*|v(x,y)|*lmax(d1(x,y)), where:
        //      sin(α) is the local tilt angle
        //      v(x,y) is the fater flow vector in the cell
        //      Kc is a global simulation parameter
        // lmax is a limiting ramp function:
        // lmax(x) =
        //          0, if x <= 0
        //          1, if x >= Kdmax
        //          1-(Kdmax-x)/Kdmax, if 0 < x < Kdmax
        // where Kdmax is a global simulation parameter controlling erosion depth
        //
        // even better with true 3D collision
        // C(x,y) = Kc * (-N(x,y)*V) *|v(x,y)|*lmax(d1(x,y)), where:
        //      N(x,y) is the terrain surface normal
        //      V  is the 3D water flow vector calculated from the surface tangent
        //      and 2D velocity vector v
        //
        // this modification erodes more soil if the water collides with the surface
        // in angles closer to perpendicular.

        // fuhu, lets get to calculating the parts of this...

    })
}