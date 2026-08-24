import { logAudit } from '@/lib/audit'
import { reportsRepository } from './repository'
import { createReportsService } from './service'

/** The reports module's supported cross-module import boundary. */
export { createReportsService } from './service'

export const reportsService = createReportsService(reportsRepository, async (action, report) =>
  logAudit(action, 'Report', report.id, `${action === 'GENERATE' ? 'สร้าง' : 'ลบ'}รายงาน ${report.title}`, {
    type: report.type,
    rangeKey: report.rangeKey,
  }),
)

export type {
  CreateReportInput,
  ReportAuditLogger,
  ReportDetail,
  ReportRecord,
  ReportRepository,
} from './contracts'
