import * as THREE from 'three/webgpu'
import {
  uniform,
  float,
  vec2,
  vec3,
  vec4,
  mat2,
  mat3,
  mat4,
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
  viewportResolution,
  mod,
  select
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

    const smoothstepVec2 = Fn(({edge0, edge1, x}: {edge0: any, edge1: any, x:any}) => {
        return vec2(
          smoothstep(edge0.x, edge1.x, x.x),
          smoothstep(edge0.y, edge1.y, x.y)
        )
    })

    const box = Fn(({st, size}: {st: any, size: any}) => {
        const s = vec2(0.5).sub(size.mul(0.5))
        const sEdge = s.add(vec2(0.001))
        
        let uv: any = smoothstepVec2({edge0: s, edge1: sEdge, x:st})
        uv = uv.mul(
          smoothstepVec2({edge0: s, edge1: sEdge, x: vec2(1.0).sub(st)})
        )

        return uv.x.mul(uv.y)
    })

    const cross = Fn(({st, size}: {st:any, size:any}) => {
        return box({st, size: vec2(size, size.div(4.))}).add(
              box({st, size: vec2(size.div(4.), size)})
        )
    })

    const rotate2D = Fn(({st, angle}: {st: any, angle:any}) => {
        st = st.sub(vec2(0.5))
        st = (mat2 as any)(
          cos(angle), sin(angle).negate(), 
          sin(angle), cos(angle)
        ).mul(st)
        st = st.add(vec2(0.5))
        return st
    })

    const scale2D = Fn(({scale}: {scale: any}) => {
        return (mat2 as any)( scale.x, 0.0,
                              0.0, scale.y
        )
    })

    const tile2D = Fn(({st, x, y}: {st: any, x: any, y: any}) => {
        return fract(
          st.mul(vec2(x, y))
        )
    })

    const brickTile = Fn(({st, zoom}: {st: any, zoom: any}) => {
        st = st.mul(zoom)
        st = st.add(vec2(
            step(1., mod(st.y, 2.0)).mul(time.mul(2.0)).sub(time),
            0.0
        ))
        return fract(st)
    })

    const rotateTilePattern = Fn(({st}: {st: any}) => {
        
        st = st.mul(2.)

        // index for each cell
        let index: any = float(0.0)
        index = index.add(
            step(1.0, mod(st.x, 2.0))
        )
        index = index.add(
            step(1.0, mod(st.y, 2.0)).mul(2.0)
        )

        //  2 | 3
        //--------
        //  0 | 1

        // each cell between 0.0 - 1.0
        st = fract(st)

        // rotate each according to index
        // select (cond, ifTrue, ifFalse) instead of if
        // if also works tho
        const st1 = rotate2D({st, angle: PI.mul(0.5)})
        const st2 = rotate2D({st, angle: PI.mul(-0.5)})
        const st3 = rotate2D({st, angle: PI})

        st =  select(index.equal(1.0), st1,
              select(index.equal(2.0), st2,
              select(index.equal(3.0), st3,
              st)))

        return st
    })

    // three.js screenUV Y axis is flipped compared to GLSL's gl_FragCoord
    // const st = vec2(screenUV.x, float(1.0).sub(screenUV.y))
    // this is simply the coords of the actual viewed mesh
    let st: any = vec2(
      uv().x,
      uv().y
    )
    let col: any = vec3(0.0)

    st = tile2D({st, x: 3.0, y: 3.0})
    st = rotateTilePattern({st})

    st = tile2D({st, x: 2.0, y: 2.0})
    st = rotate2D({st, angle: PI.negate().mul(time).mul(.25)})
    st = rotateTilePattern({st: st.mul(2.0)})
    st = rotate2D({st, angle: PI.mul(time).mul(.25)})

    col = vec3(step(st.x, st.y))

    material.colorNode = vec4(col, 1.)

    const mesh = new THREE.Mesh(geometry, material)
    return mesh
}