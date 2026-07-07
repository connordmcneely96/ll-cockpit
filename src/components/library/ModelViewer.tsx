'use client'

import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

/**
 * Self-contained interactive GLB viewer. Receives a ready-to-use content URL as
 * `src` and renders it with orbit controls. Manages its own loading/error state
 * and fully tears down its Three.js resources on unmount.
 */
export default function ModelViewer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    setLoading(true)
    setError(null)

    let width = container.clientWidth || 1
    let height = container.clientHeight || 1

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 10000)
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height)
    renderer.setClearColor(0x000000, 0) // transparent — inherit the modal background
    container.appendChild(renderer.domElement)

    scene.add(new THREE.AmbientLight(0xffffff, 0.8))
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
    dirLight.position.set(1, 1, 1)
    scene.add(dirLight)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true

    let frameId = 0
    let disposed = false

    new GLTFLoader().load(
      src,
      (gltf) => {
        if (disposed) return
        const model = gltf.scene
        // Auto-frame: recenter the model at the origin and back the camera off
        // to fit its bounding box — models vary in size, so no fixed distance.
        const box = new THREE.Box3().setFromObject(model)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3())
        model.position.sub(center)
        scene.add(model)
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const dist = maxDim / 2 / Math.tan((camera.fov * Math.PI) / 360)
        camera.position.set(0, 0, dist * 1.6)
        camera.near = Math.max(dist / 100, 0.01)
        camera.far = dist * 100
        camera.updateProjectionMatrix()
        controls.target.set(0, 0, 0)
        controls.update()
        setLoading(false)
      },
      undefined,
      (err) => {
        if (disposed) return
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      },
    )

    const renderLoop = () => {
      frameId = requestAnimationFrame(renderLoop)
      controls.update()
      renderer.render(scene, camera)
    }
    renderLoop()

    const onResize = () => {
      if (!containerRef.current) return
      width = containerRef.current.clientWidth || 1
      height = containerRef.current.clientHeight || 1
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    window.addEventListener('resize', onResize)

    return () => {
      disposed = true
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else if (mat) mat.dispose()
      })
      renderer.dispose()
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement)
      }
    }
  }, [src])

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />
      {loading && !error && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none font-mono text-xs text-text3">
          Loading model…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center px-4 text-center pointer-events-none font-mono text-xs text-red">
          Failed to load model: {error}
        </div>
      )}
    </div>
  )
}
