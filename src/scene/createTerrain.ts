import * as THREE from 'three/webgpu'
import {
  uniform,
  int,
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
  select,
  dot,
  notEqual, greaterThanEqual, greaterThan, equal, lessThanEqual, lessThan,
  If,
  rand,
  array,
  Loop,
  TWO_PI
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

export interface CanvasUniforms {
  uOctaves: ReturnType <typeof uniform>
}

export function createShaderCanvas(): { shaderMesh: THREE.Mesh; uniforms: CanvasUniforms} {
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

    const uMouse = uniform(new THREE.Vector2(0, 0))

    window.addEventListener('mousemove', (e) => {
        uMouse.value.x = e.clientX / window.innerWidth
        uMouse.value.y = 1.0 - (e.clientY / window.innerHeight)
    })

    const myRandom = Fn(({st}: {st: any}) => {
        return fract(
            sin(dot(st.xy, vec2(12.9898,78.233))).mul(43758.5453123)
        )
    })

    const myRandom2 = Fn(({st}: {st: any}) => {
        st = vec2(
            dot(st, vec2(127.1, 311.7)),
            dot(st, vec2(269.5, 183.3))
        )

        return fract(sin(st).mul(43758.5453123))
    })

    const truchetPattern = Fn(({st, index}: {st: any, index: any}) => {
        index = fract((index.sub(.5).mul(time)))
        
        // .toVar() for mutable GPU variable
        const result = vec2(st).toVar()

        // () => {} means this is builder for GPU branch, not JS logic
        If(index.greaterThan(0.75), () => {
            result.assign(vec2(1.0).sub(st))
        }) // if returns node so I can chain them
        .ElseIf(index.greaterThan(.5), () => {
            result.assign(vec2(float(1.0).sub(st.x), st.y))
        })
        .ElseIf(index.greaterThan(.25), () => {
            result.assign(vec2(st.x, float(1.0).sub(st.y)))
        })

        return result
    })

    const myFirstSmoothNoise = Fn(({x}: {x: any}) => {
        const i = floor(x)
        const f = fract(x)
        // fake hash random
        const y = fract(sin(i).mul(43758.5453123))
        const y1 = fract(sin(i.add(1.)).mul(43758.5453123))
        // made up cubic curve
        const u = f.mul(f).mul( float(3.0).sub(f.mul(2.0)) )

        return mix(y, y1, u)
    })

    const noise2D = Fn(({st}: {st: any}) => {
        const i = floor(st)
        const f = fract(st)

        // four corners of tile
        const a = myRandom({st: i})
        const b = myRandom({st: i.add(vec2(1.0, 0.0))})
        const c = myRandom({st: i.add(vec2(0.0, 1.0))})
        const d = myRandom({st: i.add(vec2(1.0, 1.0))})

        const u: any = f.mul(f).mul(f.mul(2.).negate().add(3.))

        return mix(a, b, u.x).add(
                c.sub(a).mul(u.y).mul(float(1.0).sub(u.x)).add(
                d.sub(b).mul(u.x).mul(u.y)
                ))
    })

    const gradientNoise = Fn(({st}: {st: any}) => {
        const i = floor(st)
        const f = fract(st)

        const u: any = f.mul(f).mul(f.mul(2.).negate().add(3.))

        const a: any = myRandom2({st: i})
        const b: any = myRandom2({st: i.add(vec2(1.0, 0.0))})
        const c: any = myRandom2({st: i.add(vec2(0.0, 1.0))})
        const d: any = myRandom2({st: i.add(vec2(1.0, 1.0))})

        return mix(
            mix( dot( a, f.sub(vec2(0.0, 0.0))),
                 dot( b, f.sub(vec2(1.0, 0.0))), u.x),
            mix( dot( c, f.sub(vec2(0.0, 1.0))),
                 dot( d, f.sub(vec2(1.0, 1.0))), u.x), u.y
        )
    })

    const lines = Fn(({pos, b}: {pos: any, b: any}) => {
        const scale = float(10.0)
        pos = pos.mul(scale)
        return smoothstep(  0.0, 
                            b.mul(.5).add(.5),
                            abs( (sin(pos.x.mul(PI)).add(b.mul(2.))).mul(.5) )
                         )
    })

    const uOctaves = uniform(int(5))

    const voronoi = Fn(({ st }: { st: any }) => {
        const points = array([
            vec2(0.83, 0.75),
            vec2(0.60, 0.07),
            vec2(0.28, 0.64),
            vec2(0.31, 0.26),
            uMouse
        ])

        const mDist = float(1.0).toVar()

        Loop({ start: int(0), end: uOctaves, type: 'int', condition: '<' }, ({ i }) => {
            mDist.assign(min(mDist, distance(st, points.element(i) as any)))
        })

        return mDist
    })

    const cellVoronoi = Fn(({st}: {st: any}) => {
        const iSt = floor(st)
        const fSt: any = fract(st)

        const mDist = float(1.0).toVar()

        Loop(
            { start: int(-1), end: int(1), type: 'int', condition: '<='},
            { start: int(-1), end: int(1), type: 'int', condition: '<='},
            ({ i, j }) => {
                // neighbor place in the grid
                const neighbor = vec2(float(j), float(i))

                // rand pos from current and the neighbor place in the grid
                let point: any = myRandom2({st: iSt.add(neighbor)})

                // animation
                point = sin(point.mul(TWO_PI).add(time)).mul(.5).add(.5)

                // vector between pixel and the point
                const diff = neighbor.add(point).sub(fSt)

                // distance to the point
                const dist = length(diff)
                mDist.assign(min(mDist, dist))
            }
        )

        // draw min dist
        let col: any = vec3(mDist)

        // draw cell center
        col = col.add(1.0).sub(step(.02, mDist))

        // draw grid
        // col = col.add(vec3(1.0, 0.0, 0.0).mul(step(.98, fSt.x).add(step(.98, fSt.y))))

        // iso circles
        col = col.sub(step(.7, abs(sin(mDist.mul(27.))))).mul(.5)

        return col
    })

    const coloredVoronoi = Fn(({st}: {st: any}) => {
        const point = array([
            vec2(0.83, 0.75),
            vec2(0.60, 0.07),
            vec2(0.28, 0.64),
            vec2(0.31, 0.26),
            uMouse
        ])

        let col: any = vec3(0.0)

        let mDist: any = float(1.).toVar()
        let mPoint: any = vec2(0.).toVec2()

        Loop(
            {start: int(0), end: uOctaves, condition: '<'},
            ({i}) => {
                const dist = distance(st, point.element(i) as any)
                If( dist.lessThan(mDist), () => {
                    mDist.assign(dist)
                    mPoint.assign(point.element(i))
                })
            }
        )

        // dist field to closest point
        col = vec3(mDist.mul(2.))

        // tint by closest
        col = vec3(mPoint.r, mPoint.g, col.b)

        // isolines
        col = col.sub(abs(sin(mDist.mul(80.))).mul(.07))

        // draw point center
        col = col.add(float(1.).sub(step(.02, mDist)))

        return col
    })

    const fbm = Fn(({st}: {st: any}) => {
        const value = float(0.).toVar()
        const amplitude = float(.5).toVar()
        const frequency = float(1.0).toVar()
        const stVar: any = vec2(st).toVar()

        Loop(
            {start: int(0), end: uOctaves, type:'int', condition: '<'},
            ({i}) => {
                value.addAssign(amplitude.mul(noise2D({st: stVar.mul(frequency)})))
                frequency.mulAssign(2.)
                amplitude.mulAssign(.5)
            }
        )

        return value
    })

    const mainColor = Fn(() => {
        const col: any = vec3(0.0)
        col.addAssign(fbm({st: st.mul(3.)}))
        return vec4(col, 1.)
    })

    // three.js screenUV Y axis is flipped compared to GLSL's gl_FragCoord
    // const st = vec2(screenUV.x, float(1.0).sub(screenUV.y))
    // this is simply the coords of the actual viewed mesh
    let st: any = vec2(
      uv().x,
      uv().y
    )

    material.colorNode = mainColor()

    const mesh = new THREE.Mesh(geometry, material)
    return {shaderMesh: mesh, uniforms: {uOctaves}}
}