import { Pane } from 'tweakpane'
import * as THREE from 'three/webgpu'
import { TerrainUniforms } from './createTerrain'

export function createPane(
  uniforms: TerrainUniforms,
  material: THREE.MeshBasicNodeMaterial
): Pane {
  const { uFrequency, uAmplitude, uSpeed } = uniforms

  const params = {
    frequency: uFrequency.value as number,
    amplitude: uAmplitude.value as number,
    speed:     uSpeed.value as number,
    wireframe: false,
  }

  const pane = new Pane({ title: 'Wave Controls' })

  pane.addBinding(params, 'frequency', { min: 0.01, max: 5.0, step: 0.01 })
    .on('change', ({ value }) => { uFrequency.value = value })

  pane.addBinding(params, 'amplitude', { min: 0.0, max: 8.0, step: 0.1 })
    .on('change', ({ value }) => { uAmplitude.value = value })

  pane.addBinding(params, 'speed', { min: 0.0, max: 5.0, step: 0.1 })
    .on('change', ({ value }) => { uSpeed.value = value })

  pane.addBinding(params, 'wireframe')
    .on('change', ({ value }) => { material.wireframe = value })

  return pane
}