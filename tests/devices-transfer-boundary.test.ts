import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const routeSource = readFileSync(
  'src/app/api/itam/devices/[id]/transfer/route.ts',
  'utf8',
)

describe('Devices transfer persistence boundary', () => {
  it('resolves the route identifier by Device id or canonical assetCode', () => {
    expect(routeSource).toContain('where: { OR: [{ id }, { assetCode: id }] }')
    expect(routeSource).toContain('where: { id: device.id }')
    expect(routeSource).not.toContain('where: { assetNo: id }')
    expect(routeSource).not.toContain('where: { assetNo: device.assetNo }')
  })

  it('writes DeviceTransfer fields that exist in the current Prisma schema', () => {
    expect(routeSource).toContain('db.deviceTransfer.create({')
    expect(routeSource).toContain('deviceId: device.id')
    expect(routeSource).toContain('assetCode: device.assetCode')
    expect(routeSource).toContain('transferDate: moveDate')
    expect(routeSource).not.toContain('db.locationHistory.create({')
    expect(routeSource).not.toContain('assetNo: device.assetNo,\n          moveDate')
  })

  it('links a supplied meter reading through the canonical assetCode', () => {
    expect(routeSource).toContain('reading.assetCode !== device.assetCode')
  })
})
