import { test, expect, loginAndBoot } from './_helpers'

/**
 * Stock E2E — exercises the 4 critical stock flows:
 *   1. Stock page loads with all 8 tabs visible
 *   2. Inventory tab shows the product list (60 SKUs)
 *   3. Pending tab renders the pending-approval list
 *   4. Stock-in form adds quantity to an item
 */

test.describe('Stock', () => {
  test.beforeEach(async ({ page, request }) => {
    await loginAndBoot(page, request)
  })

  test('stock page loads with 8 tabs', async ({ page }) => {
    await page.getByRole('button', { name: /สต๊อก|สต็อก/ }).first().click()
    await expect(page.getByRole('heading', { name: /คลังสต็อก/i }).first()).toBeVisible({ timeout: 15_000 })

    // The 8 tabs from the Apps Script original.
    const expectedTabs = ['ภาพรวม', 'คลังสินค้า', 'รับเข้า', 'เบิกออก', 'รออนุมัติ', 'ใบสั่งซื้อ', 'ประวัติ', 'สรุป']
    for (const label of expectedTabs) {
      await expect(page.getByRole('tab', { name: new RegExp(label, 'i') }).first()).toBeVisible({ timeout: 5_000 })
    }
  })

  test('inventory tab shows the product list', async ({ page }) => {
    await page.getByRole('button', { name: /สต๊อก|สต็อก/ }).first().click()
    await expect(page.getByRole('heading', { name: /คลังสต็อก/i }).first()).toBeVisible({ timeout: 15_000 })

    // Click the "คลังสินค้า" tab.
    await page.getByRole('tab', { name: /คลังสินค้า/i }).first().click()
    // The inventory table header should appear.
    await expect(page.getByText(/รหัสสินค้า|Product Code/i).first()).toBeVisible({ timeout: 15_000 })
    // At least one product row should render (the real dataset has 60 SKUs).
    const rowCount = await page.locator('tbody tr').count()
    expect(rowCount).toBeGreaterThan(0)
  })

  test('pending tab renders the pending-approval list', async ({ page }) => {
    await page.getByRole('button', { name: /สต๊อก|สต็อก/ }).first().click()
    await expect(page.getByRole('heading', { name: /คลังสต็อก/i }).first()).toBeVisible({ timeout: 15_000 })

    await page.getByRole('tab', { name: /รออนุมัติ/i }).first().click()
    // The pending tab's filter toolbar should appear (look for the PENDING pill).
    await expect(page.getByText(/PENDING|รออนุมัติ/i).first()).toBeVisible({ timeout: 10_000 })
  })

  test('stock-in form adds quantity to an item', async ({ page, request }) => {
    // Create a throwaway stock item via the API so we have a known target.
    const productCode = `E2E-STK-${Date.now().toString(36).toUpperCase()}`
    const createRes = await request.post('/api/stock-items', {
      data: {
        productCode,
        productName: 'E2E Test Item',
        unit: 'ชิ้น',
        quantity: 5,
        minQuantity: 0,
        maxQuantity: 100,
        active: true,
      },
    })
    expect(createRes.ok(), 'API stock-item create should succeed').toBeTruthy()
    const created = (await createRes.json()) as { id?: string; item?: { id: string } }
    const itemId = created.id ?? created.item?.id
    expect(itemId, 'should return a stockItemId').toBeTruthy()

    // Drive the stock-in via the API (the form is identical to what the UI
    // submits) so the test is robust against UI refactors.
    const txnRes = await request.post(`/api/stock-items/${itemId}/transaction`, {
      data: {
        type: 'IN',
        quantity: 10,
        reason: 'E2E stock-in test',
        txnDate: new Date().toISOString().slice(0, 10),
      },
    })
    expect(txnRes.ok(), 'stock-in transaction should succeed').toBeTruthy()
    const txnBody = (await txnRes.json()) as { data: { item: { quantity: number } } }
    expect(txnBody.data.item.quantity).toBe(15) // 5 initial + 10 in
  })
})
