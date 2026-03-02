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
  fract,
  floor,
  uv,
  distance,
  min,
  max,
  atan,
  viewportResolution
} from 'three/tsl'

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

    const stepVec2 = Fn(({filter, value}: {filter: any, value: any}) => {
      return vec2(
        step(filter.x, value.x),
        step(filter.y, value.y)
      )
    })

    const drawSquare = Fn(({
      limBottomLeft, limTopRight, colorOut, colorIn}: {
        limBottomLeft: any, 
        limTopRight: any, 
        colorOut: any, 
        colorIn: any
    }) => {
      const bl = stepVec2({filter: vec2(limBottomLeft), value: st})
      const tr = stepVec2({filter: vec2(limTopRight), value: vec2(1.0).sub(st)})
      let pct = bl.x.mul(bl.y).mul(tr.x).mul(tr.y)
      let fillColor = mix(colorOut, colorIn, pct)
      return fillColor
    })

    const plot = Fn(({ st, pct }: {st: any, pct: any}) => {
        return smoothstep(pct.sub(float(0.01)), pct, st.y).sub(smoothstep(pct, pct.add(float(0.01)), st.y))
    })

    // three.js screenUV Y axis is flipped compared to GLSL's gl_FragCoord
    // const st = vec2(screenUV.x, float(1.0).sub(screenUV.y))
    // this is simply the coords of the actual viewed mesh
    const st = vec2(
      uv().x,
      uv().y
    )

    let stRemapped = st.mul(2.0).sub(1)

    let N = 3

    let a = atan(stRemapped.x, stRemapped.y).add(PI)
    let r = PI.mul(2.0).div(float(N))

    let d = cos(
      floor(float(.5).add(a.div(r))).mul(r).sub(a)
    ).mul(length(stRemapped))

    let color = vec3(float(1.).sub(smoothstep(.4, .41, d)))

    material.colorNode = vec4(color, 1.)

    const mesh = new THREE.Mesh(geometry, material)
    return mesh
}