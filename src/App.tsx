import { useEffect, useRef } from 'react'
import { initScene } from './scene/initScene'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const cleanup = initScene(canvasRef.current)
    return cleanup
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100vw', height: '100vh', display: 'block' }}
    />
  )
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    window.location.reload()
  })
}