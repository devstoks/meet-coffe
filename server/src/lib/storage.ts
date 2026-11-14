import multer from 'multer'
import { randomBytes } from 'crypto'
import path from 'path'
import fs from 'fs'
import { spawn } from 'child_process'

const UPLOAD_ROOT = path.resolve(process.cwd(), '..', 'uploads')

export const IMAGES_DIR = path.join(UPLOAD_ROOT, 'products', 'images')
export const VIDEOS_DIR = path.join(UPLOAD_ROOT, 'products', 'videos')

for (const dir of [IMAGES_DIR, VIDEOS_DIR]) {
  fs.mkdirSync(dir, { recursive: true })
}

const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp']
const VIDEO_MIMES = ['video/mp4']

function makeStorage(destination: string, extFromMime: Record<string, string>) {
  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, destination),
    filename: (_req, file, cb) => {
      const ext = extFromMime[file.mimetype] ?? path.extname(file.originalname)
      const unique = randomBytes(8).toString('hex')
      const ts = Date.now()
      cb(null, `${ts}-${unique}${ext}`)
    },
  })
}

const imageExtByMime: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}

const videoExtByMime: Record<string, string> = {
  'video/mp4': '.mp4',
}

export const uploadImage = multer({
  storage: makeStorage(IMAGES_DIR, imageExtByMime),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!IMAGE_MIMES.includes(file.mimetype)) {
      return cb(new Error('Formato de imagem inválido. Use JPG, PNG ou WebP.'))
    }
    cb(null, true)
  },
})

export const uploadVideo = multer({
  storage: makeStorage(VIDEOS_DIR, videoExtByMime),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!VIDEO_MIMES.includes(file.mimetype)) {
      return cb(new Error('Formato de vídeo inválido. Use MP4.'))
    }
    cb(null, true)
  },
})

export function pathToUrl(absPath: string | null): string | null {
  if (!absPath) return null
  const rel = path.relative(UPLOAD_ROOT, absPath).replace(/\\/g, '/')
  return `/uploads/${rel}`
}

export function urlToAbsPath(urlPath: string | null): string | null {
  if (!urlPath) return null
  if (!urlPath.startsWith('/uploads/')) return null
  const rel = urlPath.slice('/uploads/'.length)
  return path.join(UPLOAD_ROOT, rel)
}

export function safeUnlink(urlPath: string | null) {
  const abs = urlToAbsPath(urlPath)
  if (!abs) return
  fs.unlink(abs, (err) => {
    if (err && err.code !== 'ENOENT') {
      console.warn(`Falha ao remover ${abs}:`, err.message)
    }
  })
}
/**
 * Move o índice (moov atom) do MP4 para o começo do arquivo, para o vídeo começar a tocar
 * antes de baixar tudo. Usa o ffmpeg do sistema SEM recodificar (-c copy: leva segundos).
 * Melhor esforço: se o ffmpeg não existir ou falhar, o arquivo original é mantido.
 */
export function faststartMp4(absPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tmp = `${absPath}.fast.mp4`
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      if (ok) {
        try { fs.renameSync(tmp, absPath) } catch { ok = false }
      }
      if (!ok) { try { fs.unlinkSync(tmp) } catch { /* nada a limpar */ } }
      resolve(ok)
    }
    try {
      const p = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-i', absPath, '-c', 'copy', '-movflags', '+faststart', '-f', 'mp4', tmp], { stdio: 'ignore' })
      const timer = setTimeout(() => { p.kill('SIGKILL'); finish(false) }, 60_000)
      p.on('error', () => { clearTimeout(timer); finish(false) }) // ffmpeg não instalado
      p.on('close', (code) => { clearTimeout(timer); finish(code === 0) })
    } catch { finish(false) }
  })
}
