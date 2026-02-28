import * as THREE from 'three/webgpu'
import {
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  sin,
  cos,
  length,
  mix,
  color,
  positionLocal,
  screenUV,
  time,
  abs,
  Fn,
  smoothstep,
  step,
  pow,
  exp,
  log,
  sqrt,
  PI,
  fract
} from 'three/tsl'
import { Sequence } from 'three/examples/jsm/libs/tween.module.js'

export interface TerrainUniforms {
  uFrequency: ReturnType<typeof uniform>
  uAmplitude: ReturnType<typeof uniform>
  uSpeed:     ReturnType<typeof uniform>
}

export function createTerrain(): { mesh: THREE.Mesh; uniforms: TerrainUniforms } {
  // uniforms
  const uFrequency = uniform(float(1.0))
  const uAmplitude = uniform(float(2.0))
  const uSpeed     = uniform(float(1.0))

  const x = positionLocal.x
  const z = positionLocal.z

  const dist = length(vec3(x, float(0), z))

  const wave = sin(
    dist.mul(uFrequency).sub(time.mul(uSpeed))
  ).mul(uAmplitude)

  const displacedPosition = vec3(x, wave, z)

  const t01 = wave.div(uAmplitude).mul(0.5).add(0.5)
  const finalColor = vec4(screenUV.x, t01, screenUV.y, 1.0)
  
  // material
  const material = new THREE.MeshBasicNodeMaterial({ wireframe: false })
  material.positionNode = displacedPosition
  material.colorNode    = finalColor

  // geometry
  const geometry = new THREE.PlaneGeometry(30, 30, 200, 200)
  geometry.rotateX(-Math.PI / 2)

  const mesh = new THREE.Mesh(geometry, material)

  return { mesh, uniforms: { uFrequency, uAmplitude, uSpeed } }
}

export function createShaderCanvas(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.MeshBasicNodeMaterial()

    const mixVec3 = Fn(({a, b, t}: {a: any, b:any, t:any}) => {
      return vec3(
        mix(a.r, b.r, t.r),
        mix(a.g, b.g, t.g),
        mix(a.b, b.b, t.b)
      )
    })

    const plot = Fn(({ st, pct }: {st: any, pct: any}) => {
        return smoothstep(pct.sub(float(0.01)), pct, st.y).sub(smoothstep(pct, pct.add(float(0.01)), st.y))
    })

    // three.js screenUV Y axis is flipped compared to GLSL's gl_FragCoord
    const st = vec2(screenUV.x, float(1.0).sub(screenUV.y))

    const x = st.x //.sub(0.5).mul(2.0)

    const pct = vec3(
      smoothstep(0.0, 1.0, x),  // red
      sin(x.mul(PI)),           // green
      float(1.0).sub(pow(x, 0.5))               // blue
    )

    const colorA = vec3(0.0, 0.0, 0.0)
    const colorB = vec3(1.0,1.0,1.0)

    let colorFinal =  mixVec3({a: colorA, b: colorB, t: pct})

    colorFinal = mix(colorFinal, vec3(1.0, 0.0, 0.0), plot({st, pct: pct.x}))
    colorFinal = mix(colorFinal, vec3(0.0, 1.0, 0.0), plot({st, pct: pct.y}))
    colorFinal = mix(colorFinal, vec3(0.0, 0.0, 1.0), plot({st, pct: pct.z}))

    material.colorNode = vec4(colorFinal, 1.0)

    const mesh = new THREE.Mesh(geometry, material)
    return mesh
}