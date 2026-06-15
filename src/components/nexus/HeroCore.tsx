'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

export default function HeroCore() {
  const mountRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    const canvas = canvasRef.current
    if (!mount || !canvas) return

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isMobile = window.innerWidth < 768
    const HOLO = 0x5cc8ff, ICE = 0x9fe8ff, GOLD = 0xf5c842, AMBER = 0xe0a838
    let W = mount.clientWidth || 1100, H = mount.clientHeight || 460

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2))
    renderer.setSize(W, H)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 100)
    camera.position.set(0, 0.4, 6.6)
    const rig = new THREE.Group()
    scene.add(rig)

    const addBlend = (o: any) => { o.material.transparent = true; o.material.depthWrite = false; o.material.blending = THREE.AdditiveBlending; return o }

    // network globe (intelligence)
    const icosa = new THREE.IcosahedronGeometry(1.55, 2)
    const globe = addBlend(new THREE.LineSegments(new THREE.WireframeGeometry(icosa), new THREE.LineBasicMaterial({ color: HOLO, transparent: true, opacity: 0.18 })))
    rig.add(globe)
    const nodes = addBlend(new THREE.Points(icosa, new THREE.PointsMaterial({ color: ICE, size: 0.05, transparent: true, opacity: 0.9 })))
    rig.add(nodes)

    // holographic gear (edges + faint glass body)
    const holoGear = (teeth: number, rOut: number, rIn: number, holeR: number, depth: number, color: number) => {
      const shape = new THREE.Shape(), step = (Math.PI * 2) / teeth
      const p = (a: number, r: number): [number, number] => [Math.cos(a) * r, Math.sin(a) * r]
      shape.moveTo(...p(0, rIn))
      for (let i = 0; i < teeth; i++) {
        const a = i * step
        shape.lineTo(...p(a + step * 0.30, rIn)); shape.lineTo(...p(a + step * 0.40, rOut))
        shape.lineTo(...p(a + step * 0.55, rOut)); shape.lineTo(...p(a + step * 0.66, rIn)); shape.lineTo(...p(a + step, rIn))
      }
      const hole = new THREE.Path(); hole.absarc(0, 0, holeR, 0, Math.PI * 2, true); shape.holes.push(hole)
      const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.3, bevelSegments: 1, steps: 1 })
      geo.center()
      const g = new THREE.Group()
      g.add(addBlend(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05 }))))
      g.add(addBlend(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 }))))
      return g
    }
    const gearA = holoGear(46, 2.45, 2.14, 1.7, 0.10, HOLO); rig.add(gearA)
    const gearB = holoGear(30, 1.7, 1.45, 0.95, 0.09, GOLD); gearB.position.z = 0.05; rig.add(gearB)
    const gearC = holoGear(20, 1.05, 0.85, 0.42, 0.08, HOLO); gearC.position.z = 0.10; rig.add(gearC)
    const gearD = holoGear(34, 2.0, 1.74, 1.2, 0.08, AMBER); gearD.rotation.set(Math.PI / 2.1, 0.3, 0); rig.add(gearD)

    // gimbal rings
    const ring = (r: number, tube: number, color: number, op: number) => addBlend(new THREE.Mesh(new THREE.TorusGeometry(r, tube, 12, 160), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op })))
    const g1 = ring(2.8, 0.012, HOLO, 0.8); g1.rotation.set(Math.PI / 2, 0, 0); rig.add(g1)
    const g2 = ring(3.0, 0.01, GOLD, 0.6); g2.rotation.set(Math.PI / 2 - 0.6, 0.5, 0); rig.add(g2)
    const g3 = ring(3.2, 0.008, HOLO, 0.6); g3.rotation.set(0.4, 0.2, 0.7); rig.add(g3)

    // arc reactor core
    const coreGrp = new THREE.Group(); rig.add(coreGrp)
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.24, 24, 24), new THREE.MeshBasicMaterial({ color: ICE })); coreGrp.add(core)
    const reactor = addBlend(new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.04, 12, 48), new THREE.MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0.95 }))); coreGrp.add(reactor)
    for (let i = 0; i < 3; i++) {
      const bar = addBlend(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.03, 0.03), new THREE.MeshBasicMaterial({ color: ICE, transparent: true, opacity: 0.8 })))
      const a = (i / 3) * Math.PI * 2; bar.position.set(Math.cos(a) * 0.28, Math.sin(a) * 0.28, 0); bar.rotation.z = a + Math.PI / 2; coreGrp.add(bar)
    }

    // HUD reticle arcs
    const hud = new THREE.Group(); rig.add(hud)
    const carc = (r: number, len: number, start: number, color: number, op: number) => { const m = addBlend(new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 8, 80, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op }))); m.rotation.z = start; return m }
    hud.add(carc(1.3, 2.0, 0, HOLO, 0.8), carc(1.3, 1.2, 3.6, HOLO, 0.55), carc(1.5, 1.6, 1.5, ICE, 0.5), carc(1.5, 1.0, 4.2, GOLD, 0.55))

    // tick dial
    const dial = new THREE.Group(); rig.add(dial)
    const tg = new THREE.BoxGeometry(0.012, 0.08, 0.012)
    const tm = new THREE.MeshBasicMaterial({ color: HOLO, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; const t = new THREE.Mesh(tg, tm); t.position.set(Math.cos(a) * 2.3, Math.sin(a) * 2.3, 0); t.rotation.z = a; dial.add(t) }
    dial.rotation.x = Math.PI / 2 - 0.15

    // filaments
    const trace = (color: number, r: number, seed: number) => {
      const pts: THREE.Vector3[] = []
      for (let i = 0; i <= 70; i++) { const t = (i / 70) * Math.PI * 2, w = 0.16 * Math.sin(t * 3 + seed); pts.push(new THREE.Vector3(Math.cos(t) * (r + w), 0.4 * Math.sin(t * 2 + seed), Math.sin(t) * (r + w))) }
      return addBlend(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.007, 6, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45 })))
    }
    const fA = trace(HOLO, 1.9, 0); fA.rotation.x = 0.5; rig.add(fA)
    const fB = trace(GOLD, 1.74, 2); fB.rotation.z = 0.7; rig.add(fB)

    // dust (fewer on mobile)
    const N = isMobile ? 280 : 750
    const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), cH = new THREE.Color(HOLO), cG = new THREE.Color(GOLD)
    for (let i = 0; i < N; i++) {
      const b = 2.1 + Math.random() * 0.95, a = Math.random() * Math.PI * 2, tl = (Math.random() - 0.5) * 1.0
      pos[i * 3] = Math.cos(a) * b + (Math.random() - 0.5) * 0.15
      pos[i * 3 + 1] = Math.sin(a) * b * Math.cos(tl) + (Math.random() - 0.5) * 0.15
      pos[i * 3 + 2] = Math.sin(a) * b * Math.sin(tl) + (Math.random() - 0.5) * 0.15
      const c = Math.random() > 0.5 ? cH : cG; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b
    }
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    pg.setAttribute('color', new THREE.BufferAttribute(col, 3))
    const dust = addBlend(new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.026, vertexColors: true, transparent: true, opacity: 0.7 })))
    rig.add(dust)

    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 1.4, 0.55, 0.12)
    composer.addPass(bloom)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true; controls.dampingFactor = 0.06; controls.enableZoom = false; controls.enablePan = false
    controls.autoRotate = true; controls.autoRotateSpeed = 0.5
    controls.minPolarAngle = Math.PI * 0.34; controls.maxPolarAngle = Math.PI * 0.66

    const clock = new THREE.Clock()
    let raf = 0
    const renderFrame = () => {
      const t = clock.getElapsedTime()
      if (!reduce) {
        gearA.rotation.z += 0.0032; gearB.rotation.z -= 0.005; gearC.rotation.z += 0.0075; gearD.rotation.z -= 0.0038
        g1.rotation.z += 0.003; g2.rotation.y += 0.004; g3.rotation.x += 0.0035
        hud.rotation.z -= 0.006; dial.rotation.z += 0.0018; fA.rotation.y += 0.0018; fB.rotation.y -= 0.0014; dust.rotation.y += 0.0008
        reactor.rotation.z += 0.02; core.scale.setScalar(1 + Math.sin(t * 2.2) * 0.12)
        ;(nodes.material as THREE.PointsMaterial).opacity = 0.7 + Math.sin(t * 1.4) * 0.2
      }
      controls.update()
      composer.render()
    }
    const animate = () => { raf = requestAnimationFrame(animate); renderFrame() }
    if (reduce) { controls.update(); composer.render() } else { animate() }

    const onResize = () => {
      W = mount.clientWidth; H = mount.clientHeight
      camera.aspect = W / H; camera.updateProjectionMatrix()
      renderer.setSize(W, H); composer.setSize(W, H)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      controls.dispose()
      scene.traverse((obj) => {
        const m = obj as THREE.Mesh
        if (m.geometry) m.geometry.dispose()
        const mat = (m as any).material
        if (mat) { Array.isArray(mat) ? mat.forEach((x: THREE.Material) => x.dispose()) : (mat as THREE.Material).dispose() }
      })
      bloom.dispose()
      composer.dispose()
      renderer.dispose()
    }
  }, [])

  return (
    <div ref={mountRef} className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block" style={{ width: '100%', height: '100%' }} />
      <div className="hero-holo" />
      <div className="hero-scan" />
      <div className="hero-vig" />
      <div className="hero-copy">
        <div className="hero-eyebrow">Leadership Legacy Digital</div>
        <h1 className="hero-title">NEXUS PRIME</h1>
        <p className="hero-sub">The AI operating system for engineering</p>
      </div>
    </div>
  )
}
