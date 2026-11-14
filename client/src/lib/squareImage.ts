/**
 * Foto de opção de combo: recorta o CENTRO da imagem em quadrado (como os cards do cliente) e reduz para `size` px,
 * respeitando a orientação do celular (EXIF). Sai em JPEG leve; a original nunca é enviada.
 */
export async function squareImage(file: File, size = 640): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Não foi possível ler esta imagem.')
  }
  const side = Math.min(bitmap.width, bitmap.height)
  const out = Math.min(size, side)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Não foi possível preparar a imagem.')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out, out)
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out)
  bitmap.close?.()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
  if (!blob) throw new Error('Não foi possível preparar a imagem.')
  return new File([blob], 'opcao.jpg', { type: 'image/jpeg' })
}
