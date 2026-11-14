// AR próprio com WebXR (Android/Chrome): detecta a superfície, deixa tocar para posicionar e prende o
// prato a uma ÂNCORA do ARCore — o aparelho corrige a posição sozinho, então o prato não "anda"
// enquanto você move o celular, chega perto ou se afasta. O tamanho é o real do GLB (já ajustado em cm).
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

const modelCache = new Map<string, Promise<THREE.Group>>()
/** Baixa o GLB antecipadamente (ao abrir o 3D), para o AR abrir na hora do toque. */
export function preloadModel(src: string): Promise<THREE.Group> {
  let p = modelCache.get(src)
  if (!p) {
    p = new GLTFLoader().loadAsync(src).then((g) => g.scene)
    p.catch(() => modelCache.delete(src))
    modelCache.set(src, p)
  }
  return p
}

type State = 'loading' | 'scanning' | 'ready' | 'placed'

export async function startArSession({ src, title }: { src: string; title: string }): Promise<void> {
  const xr = (navigator as any).xr
  if (!xr) throw new Error('WebXR indisponível')

  // ---------- overlay (interface sobre a câmera) ----------
  const overlay = document.createElement('div')
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;color:#fff;'
  const btnCss = 'pointer-events:auto;height:44px;padding:0 18px;border-radius:999px;border:1px solid rgba(255,255,255,.45);background:rgba(20,14,9,.62);color:#fff;font-size:14px;font-weight:600;backdrop-filter:blur(10px);'
  const mkBtn = (label: string) => {
    const b = document.createElement('button')
    b.textContent = label
    b.style.cssText = btnCss
    b.addEventListener('beforexrselect', (e) => e.preventDefault()) // toque no botão não conta como "posicionar"
    return b
  }
  const top = document.createElement('div')
  top.style.cssText = 'position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top,0px) + 14px) 14px 0;display:flex;align-items:center;gap:12px;'
  const closeBtn = mkBtn('✕  Fechar')
  const titleEl = document.createElement('div')
  titleEl.textContent = title
  titleEl.style.cssText = 'font-weight:700;font-size:15px;text-shadow:0 1px 6px rgba(0,0,0,.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'
  top.append(closeBtn, titleEl)
  const bottom = document.createElement('div')
  bottom.style.cssText = 'position:absolute;left:0;right:0;bottom:0;padding:14px 16px calc(env(safe-area-inset-bottom,0px) + 22px);display:flex;flex-direction:column;align-items:center;gap:12px;'
  const hint = document.createElement('div')
  hint.style.cssText = 'max-width:340px;text-align:center;font-size:13.5px;line-height:1.35;padding:10px 16px;border-radius:18px;background:rgba(20,14,9,.62);backdrop-filter:blur(10px);'
  const actions = document.createElement('div')
  actions.style.cssText = 'display:none;gap:10px;'
  const rotateBtn = mkBtn('↻  Girar')
  const moveBtn = mkBtn('Reposicionar')
  actions.append(rotateBtn, moveBtn)
  bottom.append(hint, actions)
  overlay.append(top, bottom)
  document.body.appendChild(overlay)

  let state: State = 'loading'
  let sizeLabel = ''
  const setState = (s: State) => {
    state = s
    actions.style.display = s === 'placed' ? 'flex' : 'none'
    hint.textContent =
      s === 'loading' ? 'Carregando o modelo…'
      : s === 'scanning' ? 'Mova o celular devagar sobre a mesa para ela ser reconhecida'
      : s === 'ready' ? 'Toque na mesa para colocar o prato aqui'
      : `Prato fixado${sizeLabel ? ` · ${sizeLabel}` : ''}. Pode andar, chegar perto ou se afastar.`
  }
  setState('loading')

  // ---------- sessão (precisa ser a 1ª coisa assíncrona: o toque do usuário ainda está "válido") ----------
  let session: any
  try {
    session = await xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test'],
      optionalFeatures: ['anchors', 'dom-overlay'],
      domOverlay: { root: overlay },
    })
  } catch (e) { overlay.remove(); throw e }

  // ---------- cena ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(window.devicePixelRatio)
  renderer.xr.enabled = true
  renderer.xr.setReferenceSpaceType('local')
  renderer.shadowMap.enabled = true
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.domElement.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;'
  document.body.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera()
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a68, 0.9))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(0.6, 2, 0.8)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 5 })
  scene.add(sun, sun.target)

  const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
  )
  reticle.matrixAutoUpdate = false
  reticle.visible = false
  scene.add(reticle)

  const root = new THREE.Group()      // posição = âncora
  root.matrixAutoUpdate = false
  root.visible = false
  const spinner = new THREE.Group()   // giro feito pelo usuário
  root.add(spinner)
  scene.add(root)
  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.28 }))
  shadowCatcher.receiveShadow = true
  spinner.add(shadowCatcher)

  // ---------- estado de posicionamento ----------
  let hitSource: any = null
  let lastHit: any = null
  let anchor: any = null
  let anchorSpace: any = null
  let placed = false
  let repositioning = false
  let ended = false

  function cleanup() {
    if (ended) return
    ended = true
    renderer.setAnimationLoop(null)
    try { anchor?.delete?.() } catch { /* noop */ }
    try { hitSource?.cancel?.() } catch { /* noop */ }
    pmrem.dispose()
    renderer.dispose()
    renderer.domElement.remove()
    overlay.remove()
  }
  session.addEventListener('end', cleanup)
  closeBtn.addEventListener('click', () => session.end())
  rotateBtn.addEventListener('click', () => { spinner.rotation.y += Math.PI / 4 })
  moveBtn.addEventListener('click', () => { repositioning = true; reticle.visible = false; setState('ready') })

  await renderer.xr.setSession(session)

  try {
    const model = (await preloadModel(src)).clone(true)
    const box = new THREE.Box3().setFromObject(model)
    const c = box.getCenter(new THREE.Vector3())
    model.position.set(-c.x, -box.min.y, -c.z) // centraliza e apoia a base no chão (y = 0)
    model.traverse((o: any) => { if (o.isMesh) o.castShadow = true })
    spinner.add(model)
    const size = box.getSize(new THREE.Vector3())
    sizeLabel = `${Math.round(Math.max(size.x, size.z) * 100)} cm`
  } catch {
    hint.textContent = 'Não foi possível carregar o modelo 3D.'
    setTimeout(() => session.end(), 2500)
    return
  }

  const viewerSpace = await session.requestReferenceSpace('viewer')
  hitSource = await session.requestHitTestSource({ space: viewerSpace })
  setState('scanning')
  const slowTimer = setTimeout(() => {
    if (state === 'scanning') hint.textContent = 'Ainda procurando… aponte para uma parte da mesa com mais luz e textura (toalha, desenho, objetos).'
  }, 9000)
  session.addEventListener('end', () => clearTimeout(slowTimer))

  session.addEventListener('select', async () => {
    if (ended || (placed && !repositioning) || !lastHit) return
    const hit = lastHit
    const refSpace = renderer.xr.getReferenceSpace()
    const pose = hit.getPose(refSpace)
    if (!pose) return
    const matrix = pose.transform.matrix
    let ok = false
    if (typeof hit.createAnchor === 'function' && session.enabledFeatures?.includes('anchors')) {
      try {
        const a = await hit.createAnchor()
        try { anchor?.delete?.() } catch { /* noop */ }
        anchor = a
        anchorSpace = a.anchorSpace
        ok = true
      } catch { /* cai para posição estática */ }
    }
    if (!ok) {
      anchorSpace = null
      root.matrix.fromArray(matrix)
      root.matrixWorldNeedsUpdate = true
    }
    root.visible = true
    placed = true
    repositioning = false
    reticle.visible = false
    setState('placed')
  })

  renderer.setAnimationLoop((_t: number, frame: any) => {
    if (frame) {
      const refSpace = renderer.xr.getReferenceSpace()
      if ((!placed || repositioning) && hitSource) {
        const results = frame.getHitTestResults(hitSource)
        const pose = results.length ? results[0].getPose(refSpace) : null
        if (pose) {
          lastHit = results[0]
          reticle.visible = true
          reticle.matrix.fromArray(pose.transform.matrix)
          reticle.matrixWorldNeedsUpdate = true
          if (state === 'scanning') setState('ready')
        } else {
          lastHit = null
          reticle.visible = false
        }
      }
      if (anchorSpace) {
        const pose = frame.getPose(anchorSpace, refSpace)
        if (pose) {
          root.visible = true
          root.matrix.fromArray(pose.transform.matrix)
          root.matrixWorldNeedsUpdate = true
        } else {
          root.visible = false // âncora perdida momentaneamente (rastreamento)
        }
      }
    }
    renderer.render(scene, camera)
  })
}
