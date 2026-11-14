import { useEffect, useState } from 'react'
import { fetchArConfig, fetchArModels, type ArModel } from './api'

// Cache de módulo: Feed inteiro faz 1 única consulta, e só se a feature estiver ligada.
let cache: Promise<Record<string, ArModel>> | null = null
function load() {
  if (!cache) cache = fetchArConfig().then((on) => (on ? fetchArModels() : {}))
  return cache
}

export function useArModels(): Record<string, ArModel> {
  const [models, setModels] = useState<Record<string, ArModel>>({})
  useEffect(() => {
    let alive = true
    load().then((m) => { if (alive) setModels(m) })
    return () => { alive = false }
  }, [])
  return models
}

export function useArEnabled(): boolean | null {
  const [on, setOn] = useState<boolean | null>(null)
  useEffect(() => { fetchArConfig().then(setOn) }, [])
  return on
}
