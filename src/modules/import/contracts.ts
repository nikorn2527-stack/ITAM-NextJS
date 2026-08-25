/** Public DTOs for the import module. */
export interface ImportJobRecord {
  id: string
  jobType: string
  fileName: string
  fileType: string
  status: string
  totalRows: number
  processedRows: number
  errorRows: number
  errors: string | null
  uploadedBy: string | null
  createdAt: Date
  completedAt: Date | null
}

export interface ImportJobRepository {
  listRecent(limit: number): Promise<ImportJobRecord[]>
  findById(id: string): Promise<ImportJobRecord | null>
  create(input: Partial<ImportJobRecord>): Promise<ImportJobRecord>
  update(id: string, data: Partial<ImportJobRecord>): Promise<ImportJobRecord>
}
