export type TaskState = 'PROCESSING' | 'READY' | 'FAILED'

export interface TaskResult {
  state: TaskState
  progress: number // 0-100
  glb?: Buffer
  usdz?: Buffer
  error?: string
}

/** Contrato que qualquer provedor de IA 3D (Meshy, Tripo, Rodin...) precisa cumprir. */
export interface Ar3dProvider {
  name: string
  /** Custo estimado (em créditos do provedor) de uma geração a partir de imagem. */
  estimateCost(): number
  /** Saldo atual de créditos no provedor. */
  getBalance(): Promise<number>
  /** Inicia a geração. Devolve o id da tarefa e os créditos realmente gastos. */
  createTask(input: { image: Buffer; mime: string; description?: string }): Promise<{ taskId: string; credits: number }>
  /** Consulta a tarefa; quando pronta devolve o GLB (já no padrão leve). */
  getTask(taskId: string): Promise<TaskResult>
}
