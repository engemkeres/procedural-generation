import { Pane } from 'tweakpane'
import * as THREE from 'three/webgpu'
import { TerrainUniforms } from './createTerrain'
import type { ErosionUniforms } from './createErosionCompute'

interface PaneHandlers {
    onTerrainParamsChange?: () => void
    onErosionStep?: (iterations: number) => void
    onErosionReset?: () => void
    onErosionContinuousChange?: (enabled: boolean) => void
    onErosionContinuousIterationsChange?: (iterationsPerFrame: number) => void
}

export function createPane(
    uniforms: TerrainUniforms,
    material: THREE.MeshBasicNodeMaterial,
    handlers: PaneHandlers = {},
    erosionUniforms?: ErosionUniforms
): Pane {
    const { uFrequency, uAmplitude, uOctaves, uLacunarity, uGain, uTerrainMode, uSunDir } = uniforms

    const params = {
        frequency: uFrequency.value as number,
        amplitude: uAmplitude.value as number,
        octaves:   uOctaves.value as number,
        lacunarity:uLacunarity.value as number,
        gain:      uGain.value as number,
        terrainMode: uTerrainMode.value as number,
        wireframe: false,
        sundir: {
            x: (uSunDir.value as THREE.Vector3).x,
            y: (uSunDir.value as THREE.Vector3).y,
            z: (uSunDir.value as THREE.Vector3).z,
        }
    }

    const pane = new Pane({ title: 'Wave Controls' })

    pane.addBinding(params, 'frequency', { min: 0.01, max: 5.0, step: 0.01 })
        .on('change', ({ value }) => {
            uFrequency.value = value
            handlers.onTerrainParamsChange?.()
        })

    pane.addBinding(params, 'amplitude', { min: 0.0, max: 8.0, step: 0.01 })
        .on('change', ({ value }) => {
            uAmplitude.value = value
            handlers.onTerrainParamsChange?.()
        })

    pane.addBinding(params, 'octaves', { min: 1, max: 10, step: 1 })
        .on('change', ({ value }) => {
            uOctaves.value = value
            handlers.onTerrainParamsChange?.()
        })

    pane.addBinding(params, 'lacunarity', { min: 0.0, max: 10.0, step: 0.01 })
            .on('change', ({ value }) => {
                uLacunarity.value = value
                handlers.onTerrainParamsChange?.()
            })

    pane.addBinding(params, 'gain', { min: 0.0, max: 1.0, step: 0.001 })
            .on('change', ({ value }) => {
                uGain.value = value
                handlers.onTerrainParamsChange?.()
            })

    pane.addBinding(params, 'terrainMode', {
        options: {
            Simple: 0,
            Billowy: 1,
            Ridged: 2
        }
    }).on('change', ({ value }) => {
        uTerrainMode.value = value
        handlers.onTerrainParamsChange?.()
    })

    pane.addBinding(params, 'wireframe')
        .on('change', ({ value }) => { material.wireframe = value })

    pane.addBinding(params, 'sundir', {
        picker: 'inline',
        expanded: 'true',
        x: {min: -50, max: 50},
        y: {min: 0, max: 80},
        z: {min: -50, max: 50},
    })
    .on('change', ({value}) => {
        (uSunDir.value as THREE.Vector3).set(value.x, value.y, value.z)
    })

    if (erosionUniforms) {
        const erosionFolder = pane.addFolder({ title: 'Erosion' })

        const erosionParams = {
            dt: erosionUniforms.uDt.value as number,
            gravity: erosionUniforms.uGravity.value as number,
            pipeArea: erosionUniforms.uPipeArea.value as number,
            rainRate: erosionUniforms.uRainRate.value as number,
            evaporation: erosionUniforms.uEvaporation.value as number,
            sedimentCapacity: erosionUniforms.uSedimentCapacity.value as number,
            erosionRate: erosionUniforms.uErosionRate.value as number,
            depositionRate: erosionUniforms.uDepositionRate.value as number,
            maxErosionDepth: erosionUniforms.uMaxErosionDepth.value as number,
            batchIterations: 30000,
            continuous: false,
            continuousIterationsPerFrame: 80
        }

        erosionFolder.addBinding(erosionParams, 'dt', { min: 0.005, max: 0.2, step: 0.001 })
            .on('change', ({ value }) => {
                erosionUniforms.uDt.value = value
            })

        erosionFolder.addBinding(erosionParams, 'gravity', { min: 0.1, max: 25.0, step: 0.1 })
            .on('change', ({ value }) => {
                erosionUniforms.uGravity.value = value
            })

        erosionFolder.addBinding(erosionParams, 'pipeArea', { min: 0.1, max: 4.0, step: 0.01 })
            .on('change', ({ value }) => {
                erosionUniforms.uPipeArea.value = value
            })

        erosionFolder.addBinding(erosionParams, 'rainRate', { min: 0.0, max: 0.02, step: 0.0001 })
            .on('change', ({ value }) => {
                erosionUniforms.uRainRate.value = value
            })

        erosionFolder.addBinding(erosionParams, 'evaporation', { min: 0.0, max: 1.0, step: 0.001 })
            .on('change', ({ value }) => {
                erosionUniforms.uEvaporation.value = value
            })


        erosionFolder.addBinding(erosionParams, 'sedimentCapacity', { min: 0.0, max: 8.0, step: 0.01 })
            .on('change', ({ value }) => {
                erosionUniforms.uSedimentCapacity.value = value
            })

        erosionFolder.addBinding(erosionParams, 'erosionRate', { min: 0.0, max: 1.0, step: 0.001 })
            .on('change', ({ value }) => {
                erosionUniforms.uErosionRate.value = value
            })

        erosionFolder.addBinding(erosionParams, 'depositionRate', { min: 0.0, max: 1.0, step: 0.001 })
            .on('change', ({ value }) => {
                erosionUniforms.uDepositionRate.value = value
            })

        erosionFolder.addBinding(erosionParams, 'maxErosionDepth', { min: 0.1, max: 8.0, step: 0.01 })
            .on('change', ({ value }) => {
                erosionUniforms.uMaxErosionDepth.value = value
            })

        erosionFolder.addBinding(erosionParams, 'batchIterations', {
            min: 1,
            max: 500000,
            step: 1
        })

        erosionFolder.addButton({ title: 'Step batch' })
            .on('click', () => handlers.onErosionStep?.(erosionParams.batchIterations))

        erosionFolder.addBinding(erosionParams, 'continuous')
            .on('change', ({ value }) => {
                handlers.onErosionContinuousChange?.(Boolean(value))
            })

        erosionFolder.addBinding(erosionParams, 'continuousIterationsPerFrame', {
            min: 1,
            max: 5000,
            step: 1
        }).on('change', ({ value }) => {
            handlers.onErosionContinuousIterationsChange?.(value)
        })

        erosionFolder.addButton({ title: 'Step x1' })
            .on('click', () => handlers.onErosionStep?.(1))

        erosionFolder.addButton({ title: 'Step x10' })
            .on('click', () => handlers.onErosionStep?.(10))

        erosionFolder.addButton({ title: 'Step x50' })
            .on('click', () => handlers.onErosionStep?.(50))

        erosionFolder.addButton({ title: 'Reset erosion' })
            .on('click', () => handlers.onErosionReset?.())
    }

    return pane
}