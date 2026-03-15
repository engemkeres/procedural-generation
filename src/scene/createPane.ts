import { Pane } from 'tweakpane'
import * as THREE from 'three/webgpu'
import { TerrainUniforms } from './createTerrain'

export function createPane(
    uniforms: TerrainUniforms,
    material: THREE.MeshBasicNodeMaterial
): Pane {
    const { uFrequency, uAmplitude, uOctaves, uLacunarity, uGain, uSunDir } = uniforms

    const params = {
        frequency: uFrequency.value as number,
        amplitude: uAmplitude.value as number,
        octaves:   uOctaves.value as number,
        lacunarity:uLacunarity.value as number,
        gain:      uGain.value as number,
        wireframe: false,
        sundir: {
            x: (uSunDir.value as THREE.Vector3).x,
            y: (uSunDir.value as THREE.Vector3).y,
            z: (uSunDir.value as THREE.Vector3).z,
        }
    }

    const pane = new Pane({ title: 'Wave Controls' })

    pane.addBinding(params, 'frequency', { min: 0.01, max: 5.0, step: 0.01 })
        .on('change', ({ value }) => { uFrequency.value = value })

    pane.addBinding(params, 'amplitude', { min: 0.0, max: 8.0, step: 0.01 })
        .on('change', ({ value }) => { uAmplitude.value = value })

    pane.addBinding(params, 'octaves', { min: 1, max: 10, step: 1 })
        .on('change', ({ value }) => { uOctaves.value = value })

    pane.addBinding(params, 'lacunarity', { min: 0.0, max: 10.0, step: 0.01 })
            .on('change', ({ value }) => { uLacunarity.value = value })

    pane.addBinding(params, 'gain', { min: 0.0, max: 1.0, step: 0.001 })
            .on('change', ({ value }) => { uGain.value = value })

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

    return pane
}