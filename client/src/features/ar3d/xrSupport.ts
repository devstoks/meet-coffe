// Verificação leve (sem three.js) de suporte a AR via WebXR.
export async function isWebXrArSupported(): Promise<boolean> {
  try {
    const xr = (navigator as any).xr
    return !!xr && window.isSecureContext && (await xr.isSessionSupported('immersive-ar'))
  } catch { return false }
}
