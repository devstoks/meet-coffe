// Feature 3D/AR — configuração. Tudo desta feature é controlado por UMA chave:
//   FEATURE_3D=true no server/.env  (desligada por padrão)
// Para remover a feature por completo: apague esta pasta, a pasta client/src/features/ar3d
// e as linhas marcadas com "ar3d" em index.ts, App.tsx, AdminLayout.tsx e Feed.tsx.
import path from 'path'

export const ar3dEnabled = () => process.env.FEATURE_3D === 'true'
export const providerName = () => (process.env.AR3D_PROVIDER || 'mock').toLowerCase()

export const MODELS_ROOT = path.resolve(process.cwd(), '..', 'uploads', 'models3d')
export const MAX_GLB_BYTES = 8 * 1024 * 1024 // padrão "leve" para o celular: recusa modelo acima de 8 MB
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024
