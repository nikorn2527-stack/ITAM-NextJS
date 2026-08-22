import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getLifecycleReadingType } from '@/lib/lifecycle-reading-type'

const activeTransferSource = readFileSync(
  'src/app/api/devices/[id]/transfer/route.ts',
  'utf8',
)
const canonicalTransferSource = readFileSync(
  'src/app/api/itam/devices/[id]/transfer/route.ts',
  'utf8',
)
const activeLifecycleSource = readFileSync(
  'src/app/api/devices/[id]/lifecycle/route.ts',
  'utf8',
)
const canonicalLifecycleSource = readFileSync(
  'src/app/api/itam/devices/[id]/lifecycle/route.ts',
  'utf8',
)
const deviceSheetSource = readFileSync(
  'src/components/itam/device-detail-sheet.tsx',
  'utf8',
)
const meterKeyboardSource = readFileSync(
  'src/components/itam/itam-meter-keyboard.tsx',
  'utf8',
)

describe('Meter/Lifecycle active runtime boundary', () => {
  it('preserves the legacy transfer payload and response aliases through the active facade', () => {
    expect(activeTransferSource).toContain('postCanonicalTransfer')
    expect(activeTransferSource).toContain('body.toDepartment ?? body.toDept')
    expect(activeTransferSource).toContain('body.toDepartmentCode ?? body.toDeptCode')
    expect(activeTransferSource).toContain('transfer: locationHistory')
    expect(activeTransferSource).not.toContain('db.device.update({')
  })

  it('requires a meter id or an explicit acknowledgement, not a reason alone', () => {
    expect(canonicalTransferSource).toContain('device.meterRequired && !meterReadingId && !meterSkipAcknowledged')
    expect(canonicalTransferSource).toContain("code: 'METER_REQUIRED'")
    expect(canonicalLifecycleSource).toContain('meterRequired && !meterReadingId && !meterSkipAcknowledged')
    expect(canonicalLifecycleSource).toContain('body.meterSkipAcknowledged === true')
  })

  it('uses one transaction for device, history, and meter event linkage', () => {
    expect(canonicalTransferSource).toContain('db.$transaction(async (tx) =>')
    expect(canonicalTransferSource).toContain('tx.device.update({')
    expect(canonicalTransferSource).toContain('tx.deviceTransfer.create({')
    expect(canonicalTransferSource).toContain('tx.meterReading.update({')
    expect(canonicalTransferSource).toContain('reading.deviceId !== device.id || reading.assetCode !== device.assetCode')
    expect(canonicalTransferSource).toContain("eventType: 'LIFECYCLE_METER_INCOMPLETE'")
    expect(canonicalTransferSource).toContain('body.transferDate ?? body.actionDate ?? body.moveDate')
    expect(canonicalLifecycleSource).toContain('db.$transaction(async (tx) =>')
    expect(canonicalLifecycleSource).toContain('tx.device.update({')
    expect(canonicalLifecycleSource).toContain('tx.deviceTransfer.create({')
    expect(canonicalLifecycleSource).toContain('tx.meterReading.update({')
  })

  it('records the complete location snapshot and server-derived lifecycle type', () => {
    for (const field of [
      'fromSite',
      'fromAssetSiteCode',
      'fromBuilding',
      'fromFloor',
      'fromDepartment',
      'fromDepartmentCode',
      'fromLocation',
      'toSite',
      'toAssetSiteCode',
      'toBuilding',
      'toFloor',
      'toDepartment',
      'toDepartmentCode',
      'toLocation',
    ]) {
      expect(canonicalLifecycleSource).toMatch(new RegExp(`${field}\\s*(?::|,)`))
    }
    expect(canonicalLifecycleSource).toContain('getLifecycleReadingType(device.status, toStatus)')
    expect(canonicalTransferSource).toContain('getLifecycleReadingType(device.status, toStatus)')
  })

  it('uses the active lifecycle endpoint for status actions and passes back meter id/color', () => {
    expect(deviceSheetSource).toContain("fetch(`/api/devices/${deviceId}/lifecycle`")
    expect(deviceSheetSource).toContain('meterReadingId = meterPayload.reading?.id ?? null')
    expect(deviceSheetSource).toContain('meterColor: actMeterColor.trim() === \'\' ? 0 : Number(actMeterColor)')
    expect(deviceSheetSource).toContain('meterSkipAcknowledged: meterRequired && !meterReadingId && actMeterSkipAcknowledged')
    expect(deviceSheetSource).not.toContain('// 3. Status change → PUT /api/devices/[id]')
  })

  it('keeps the historical facade argument order while matching protected mapping', () => {
    expect(getLifecycleReadingType('Active', 'Disposed')).toBe('FINAL')
    expect(getLifecycleReadingType('Active', 'In Repair')).toBe('SEND_REPAIR')
    expect(getLifecycleReadingType('In Stock', 'Inactive')).toBe('CHECKOUT')
    expect(getLifecycleReadingType('Inactive', 'Active')).toBe('RETURN')
    expect(getLifecycleReadingType('Active', 'Active')).toBe('MONTHLY')
  })

  it('renders the successful reading in the primary visible area with the required fields', () => {
    for (const field of [
      'บันทึกล่าสุดสำเร็จ',
      'latest.assetCode',
      'latest.meterBw',
      'latest.meterColor',
      'latest.delta',
      'fmtDateTime(latest.at)',
      "latest.reset ? 'RESET'",
      'role="status"',
      'aria-live="polite"',
    ]) {
      expect(meterKeyboardSource).toContain(field)
    }
    expect(meterKeyboardSource).toContain('Secondary history: retained for review; primary confirmation is above.')
    expect(meterKeyboardSource).toContain('setRecent((prev) => [savedReading, ...prev].slice(0, 5))')
    expect(meterKeyboardSource.indexOf('{latest && (')).toBeLessThan(meterKeyboardSource.indexOf('<AnimatePresence mode="wait">'))
  })

  it('publishes latest and recent only after the meter API confirms success', () => {
    const responseGuard = meterKeyboardSource.indexOf("if (!res.ok)")
    const latestUpdate = meterKeyboardSource.indexOf('setLatest(savedReading)')
    const historyUpdate = meterKeyboardSource.indexOf('setRecent((prev) => [savedReading, ...prev].slice(0, 5))')
    expect(responseGuard).toBeGreaterThan(-1)
    expect(latestUpdate).toBeGreaterThan(responseGuard)
    expect(historyUpdate).toBeGreaterThan(latestUpdate)
    expect(meterKeyboardSource).toContain("throw new Error(j.error || 'Save failed')")
  })
})
