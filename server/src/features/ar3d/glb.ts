// Utilitários de GLB sem dependências: valida o arquivo e "assa" o tamanho real do prato.
// O tamanho é aplicado envolvendo a cena num nó com escala — funciona no 3D, no Scene Viewer e no Quick Look.

type Json = any

export function isGlb(buf: Buffer): boolean {
  return buf.length > 20 && buf.readUInt32LE(0) === 0x46546c67 && buf.readUInt32LE(4) === 2 && buf.readUInt32LE(8) === buf.length
}

function split(buf: Buffer) {
  const jl = buf.readUInt32LE(12)
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('GLB inválido')
  const json: Json = JSON.parse(buf.subarray(20, 20 + jl).toString('utf8'))
  return { json, rest: buf.subarray(20 + jl) } // rest = chunks seguintes (BIN)
}

function join(json: Json, rest: Buffer): Buffer {
  let jb = Buffer.from(JSON.stringify(json), 'utf8')
  if (jb.length % 4) jb = Buffer.concat([jb, Buffer.alloc(4 - (jb.length % 4), 0x20)])
  const head = Buffer.alloc(20)
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4)
  head.writeUInt32LE(20 + jb.length + rest.length, 8)
  head.writeUInt32LE(jb.length, 12); head.writeUInt32LE(0x4e4f534a, 16)
  return Buffer.concat([head, jb, rest])
}

type M = number[] // 4x4 column-major
const mul = (a: M, b: M): M => {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}
const ident = (): M => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function local(n: Json): M {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1]
  const [sx, sy, sz] = n.scale ?? [1, 1, 1]
  const [tx, ty, tz] = n.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}

/** Caixa envolvente do modelo no espaço do mundo (metros) ou null se não der para calcular. */
function worldBounds(json: Json) {
  const scene = json.scenes?.[json.scene ?? 0]
  if (!scene?.nodes) return null
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  const visit = (idx: number, parent: M, depth: number) => {
    const n = json.nodes?.[idx]
    if (!n || depth > 64) return
    const w = mul(parent, local(n))
    if (n.mesh !== undefined) {
      for (const prim of json.meshes?.[n.mesh]?.primitives ?? []) {
        const acc = json.accessors?.[prim.attributes?.POSITION]
        if (!acc?.min || !acc?.max) continue
        for (let i = 0; i < 8; i++) {
          const p = [i & 1 ? acc.max[0] : acc.min[0], i & 2 ? acc.max[1] : acc.min[1], i & 4 ? acc.max[2] : acc.min[2]]
          for (let k = 0; k < 3; k++) {
            const v = w[0 + k] * p[0] + w[4 + k] * p[1] + w[8 + k] * p[2] + w[12 + k]
            if (v < min[k]) min[k] = v
            if (v > max[k]) max[k] = v
          }
        }
      }
    }
    for (const c of n.children ?? []) visit(c, w, depth + 1)
  }
  for (const n of scene.nodes) visit(n, ident(), 0)
  return min.every(Number.isFinite) ? { min, max } : null
}

/** Maior dimensão horizontal do modelo, em cm (ou null). */
export function horizontalSizeCm(buf: Buffer): number | null {
  try {
    const b = worldBounds(split(buf).json)
    if (!b) return null
    return Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2]) * 100
  } catch { return null }
}

/** Ajusta o modelo para que a maior dimensão horizontal (diâmetro do prato) tenha `targetCm`. */
export function bakeRealSize(buf: Buffer, targetCm: number): Buffer {
  if (!isGlb(buf) || !(targetCm >= 5 && targetCm <= 100)) return buf
  const { json, rest } = split(buf)
  const b = worldBounds(json)
  if (!b) return buf
  const extent = Math.max(b.max[0] - b.min[0], b.max[2] - b.min[2])
  if (!(extent > 0)) return buf
  const s = targetCm / 100 / extent
  if (Math.abs(s - 1) < 1e-3) return buf
  const scene = json.scenes[json.scene ?? 0]
  json.nodes.push({ name: 'tamanho-real', children: scene.nodes, scale: [s, s, s] })
  scene.nodes = [json.nodes.length - 1]
  return join(json, rest)
}
