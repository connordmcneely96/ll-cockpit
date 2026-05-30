'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

interface ModelViewerProps {
  url: string | null
  wireframe: boolean
  autoRotate: boolean
  bgColor: string
  onError?: (msg: string) => void
  onLoaded?: () => void
}

function applyWireframe(obj: THREE.Object3D, on: boolean) {
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (mesh.isMesh) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => { (m as THREE.MeshStandardMaterial).wireframe = on })
    }
  })
}

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((c) => {
    const mesh = c as THREE.Mesh
    if (mesh.isMesh) {
      mesh.geometry?.dispose()
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      mats.forEach((m) => m?.dispose())
    }
  })
}

export function ModelViewer({ url, wireframe, autoRotate, bgColor, onError, onLoaded }: ModelViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const frameRef = useRef<number>(0)
  const modelRef = useRef<THREE.Object3D | null>(null)
  const wireframeRef = useRef(wireframe)
  wireframeRef.current = wireframe

  // ── one-time scene setup ──
  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(bgColor)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(50, mount.clientWidth / Math.max(1, mount.clientHeight), 0.1, 1000)
    camera.position.set(4, 3, 5)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(mount.clientWidth, Math.max(1, mount.clientHeight))
    mount.appendChild(renderer.domElement)
    rendererRef.current = renderer

    const hemi = new THREE.HemisphereLight(0xffffff, 0x202830, 0.9)
    scene.add(hemi)
    const dir = new THREE.DirectionalLight(0xffffff, 1.1)
    dir.position.set(5, 10, 7)
    scene.add(dir)
    scene.add(new THREE.AmbientLight(0xffffff, 0.3))

    scene.add(new THREE.GridHelper(20, 20, 0x1e2d3d, 0x111827))
    scene.add(new THREE.AxesHelper(2))

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.autoRotate = autoRotate
    controlsRef.current = controls

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

    const ro = new ResizeObserver(() => {
      const w = mount.clientWidth, h = Math.max(1, mount.clientHeight)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    })
    ro.observe(mount)

    return () => {
      cancelAnimationFrame(frameRef.current)
      ro.disconnect()
      controls.dispose()
      if (modelRef.current) { disposeObject(modelRef.current); modelRef.current = null }
      renderer.dispose()
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement)
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── load / swap model when url changes ──
  useEffect(() => {
    const scene = sceneRef.current, camera = cameraRef.current, controls = controlsRef.current
    if (!scene || !camera || !controls) return

    if (modelRef.current) {
      scene.remove(modelRef.current)
      disposeObject(modelRef.current)
      modelRef.current = null
    }

    const frameToObject = (obj: THREE.Object3D) => {
      const box = new THREE.Box3().setFromObject(obj)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z) || 1
      const dist = maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))
      camera.position.copy(center).add(new THREE.Vector3(1, 0.8, 1).normalize().multiplyScalar(dist * 1.6))
      camera.near = maxDim / 100
      camera.far = maxDim * 100
      camera.updateProjectionMatrix()
      controls.target.copy(center)
      controls.update()
    }

    if (!url) {
      const geo = new THREE.TorusKnotGeometry(1, 0.32, 160, 24)
      const mat = new THREE.MeshStandardMaterial({ color: 0x00d4ff, metalness: 0.3, roughness: 0.4, wireframe: wireframeRef.current })
      const mesh = new THREE.Mesh(geo, mat)
      scene.add(mesh)
      modelRef.current = mesh
      frameToObject(mesh)
      return
    }

    const loader = new GLTFLoader()
    let cancelled = false
    loader.load(
      url,
      (gltf) => {
        if (cancelled) return
        const root = gltf.scene
        applyWireframe(root, wireframeRef.current)
        scene.add(root)
        modelRef.current = root
        frameToObject(root)
        onLoaded?.()
      },
      undefined,
      (err) => { if (!cancelled) onError?.(err instanceof Error ? err.message : 'Failed to load GLB') },
    )
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url])

  useEffect(() => { if (modelRef.current) applyWireframe(modelRef.current, wireframe) }, [wireframe])
  useEffect(() => { if (controlsRef.current) controlsRef.current.autoRotate = autoRotate }, [autoRotate])
  useEffect(() => { if (sceneRef.current) sceneRef.current.background = new THREE.Color(bgColor) }, [bgColor])

  return <div ref={mountRef} className="w-full h-full" style={{ minHeight: 0 }} />
}
