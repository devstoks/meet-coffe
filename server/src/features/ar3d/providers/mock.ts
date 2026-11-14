// Provedor de TESTE: não chama IA nenhuma e não gasta dinheiro. Gera um GLB procedural (um prato
// com um "alimento" em cima) para validar todo o fluxo: admin -> geração -> Feed -> AR.
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import { MODELS_ROOT } from '../config.js'
import type { Ar3dProvider, TaskResult } from '../types.js'

const COST = 30
const DURATION_MS = 6000
const STATE_FILE = path.join(MODELS_ROOT, '_mock-state.json')

type MockState = { balance: number; tasks: Record<string, number> }
function readState(): MockState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return { balance: 1000, tasks: {} } }
}
function writeState(s: MockState) {
  fs.mkdirSync(MODELS_ROOT, { recursive: true })
  fs.writeFileSync(STATE_FILE, JSON.stringify(s))
}

/** Cilindro (tampa+lateral) com cor sólida, em metros, centrado em (cx, cz). */
function cylinder(radius: number, height: number, y0: number, seg: number, pos: number[], nor: number[], idx: number[], cx = 0, cz = 0) {
  const base = pos.length / 3
  const y1 = y0 + height
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a)
    pos.push(cx + c * radius, y0, cz + s * radius, cx + c * radius, y1, cz + s * radius)
    nor.push(c, 0, s, c, 0, s)
  }
  for (let i = 0; i < seg; i++) {
    const a = base + i * 2
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const cTop = pos.length / 3
  pos.push(cx, y1, cz); nor.push(0, 1, 0)
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2
    pos.push(cx + Math.cos(a) * radius, y1, cz + Math.sin(a) * radius); nor.push(0, 1, 0)
  }
  for (let i = 0; i < seg; i++) idx.push(cTop, cTop + 2 + i, cTop + 1 + i)
}

function buildMockGlb(): Buffer {
  const pos: number[] = [], nor: number[] = [], idx: number[] = []
  cylinder(0.15, 0.03, 0, 48, pos, nor, idx)        // travessa de 30 cm
  const split = idx.length
  cylinder(0.095, 0.06, 0.03, 40, pos, nor, idx)    // base de arroz/batata (19 cm)
  for (let i = 0; i < 14; i++) {                    // "camarões" em volta
    const a = (i / 14) * Math.PI * 2
    cylinder(0.02, 0.07, 0.03, 12, pos, nor, idx, Math.cos(a) * 0.12, Math.sin(a) * 0.12)
  }
  const positions = new Float32Array(pos), normals = new Float32Array(nor)
  // índices acima de 65535 não ocorrem aqui (< 2000 vértices)
  const indices = new Uint16Array(idx)
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], pos[i + k]); max[k] = Math.max(max[k], pos[i + k]) }

  const posBytes = Buffer.from(positions.buffer), norBytes = Buffer.from(normals.buffer)
  let idxBytes = Buffer.from(indices.buffer)
  if (idxBytes.length % 4) idxBytes = Buffer.concat([idxBytes, Buffer.alloc(4 - (idxBytes.length % 4))])
  const bin = Buffer.concat([posBytes, norBytes, idxBytes])

  const json = {
    asset: { version: '2.0', generator: 'meetcoffe-mock' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    materials: [
      { name: 'prato', pbrMetallicRoughness: { baseColorFactor: [0.93, 0.9, 0.84, 1], metallicFactor: 0, roughnessFactor: 0.6 } },
      { name: 'alimento', pbrMetallicRoughness: { baseColorFactor: [0.72, 0.45, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.8 } },
    ],
    meshes: [{ primitives: [
      { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
      { attributes: { POSITION: 0, NORMAL: 1 }, indices: 3, material: 1 },
    ] }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
      { bufferView: 2, byteOffset: 0, componentType: 5123, count: split, type: 'SCALAR' },
      { bufferView: 2, byteOffset: split * 2, componentType: 5123, count: idx.length - split, type: 'SCALAR' },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length, byteLength: norBytes.length, target: 34962 },
      { buffer: 0, byteOffset: posBytes.length + norBytes.length, byteLength: idx.length * 2, target: 34963 },
    ],
    buffers: [{ byteLength: bin.length }],
  }
  // O offset do 2º índice precisa ser múltiplo de 2 (uint16) — é, pois split*2.
  let jsonBytes = Buffer.from(JSON.stringify(json))
  if (jsonBytes.length % 4) jsonBytes = Buffer.concat([jsonBytes, Buffer.alloc(4 - (jsonBytes.length % 4), 0x20)])
  const total = 12 + 8 + jsonBytes.length + 8 + bin.length
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8)
  const jh = Buffer.alloc(8); jh.writeUInt32LE(jsonBytes.length, 0); jh.writeUInt32LE(0x4e4f534a, 4)
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([head, jh, jsonBytes, bh, bin])
}

export const mockProvider: Ar3dProvider = {
  name: 'mock',
  estimateCost: () => COST,
  async getBalance() { return readState().balance },
  async createTask() {
    const st = readState()
    if (st.balance < COST) throw new Error('Créditos insuficientes (modo de teste).')
    const taskId = `mock_${randomBytes(6).toString('hex')}`
    st.balance -= COST
    st.tasks[taskId] = Date.now()
    writeState(st)
    return { taskId, credits: COST }
  },
  async getTask(taskId): Promise<TaskResult> {
    const started = readState().tasks[taskId]
    if (!started) return { state: 'FAILED', progress: 0, error: 'Tarefa não encontrada' }
    const progress = Math.min(100, Math.round(((Date.now() - started) / DURATION_MS) * 100))
    if (progress < 100) return { state: 'PROCESSING', progress }
    return { state: 'READY', progress: 100, glb: buildMockGlb() }
  },
}
