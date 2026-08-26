/** Public DTOs for the meters module. */
export interface MeterReadingRecord {
  id: string
  readingId: string | null
  deviceId: string
  assetCode: string | null
  readingDate: string
  readingMonth: string | null
  meterBw: number
  meterColor: number
  pagesBw: number
  pagesColor: number
  prevMeterBw: number
  prevMeterColor: number
  readingType: string | null
  readBy: string | null
  remark: string | null
  locationAtReading: string | null
  siteAtReading: string | null
  buildingAtReading: string | null
  floorAtReading: string | null
  departmentAtReading: string | null
  departmentCodeAtReading: string | null
  eventType: string | null
  eventId: string | null
  isDemo: boolean
  createdAt: Date
}

export interface MeterReadingRepository {
  findByDeviceId(deviceId: string, limit?: number): Promise<MeterReadingRecord[]>
  findLatestByAssetCode(assetCode: string): Promise<MeterReadingRecord | null>
  create(data: Partial<MeterReadingRecord>): Promise<MeterReadingRecord>
  update(id: string, data: Partial<MeterReadingRecord>): Promise<MeterReadingRecord>
  findUnreadDevices(activeCycleId?: string): Promise<unknown[]>
}
