import { providerName } from '../config.js'
import type { Ar3dProvider } from '../types.js'
import { mockProvider } from './mock.js'

// Para plugar um provedor real (Meshy, Tripo...): crie providers/meshy.ts implementando Ar3dProvider
// e registre aqui. Selecione com AR3D_PROVIDER=meshy no .env.
export function getProvider(): Ar3dProvider {
  switch (providerName()) {
    case 'mock': return mockProvider
    default: throw new Error(`Provedor 3D "${providerName()}" não implementado. Use AR3D_PROVIDER=mock.`)
  }
}
