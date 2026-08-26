/**
 * pm-schedule.ts — PM (Preventive Maintenance) schedule helpers.
 *
 * Computes the next run date based on a PMSchedule's frequency + config.
 * Also generates PMExecution rows for a given month (calendar view).
 */

const WEEKDAY_MAP: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

/**
 * Compute the next run date for a PMSchedule starting from `fromDate` (default: today).
 * Returns an ISO date string (YYYY-MM-DD).
 *
 * Rules:
 *   - daily: tomorrow
 *   - weekly: next occurrence of `weekday`
 *   - monthly: `dayOfMonth` of next month (or this month if not yet passed)
 *   - quarterly: `dayOfMonth` of next quarter month (every 3 months from startMonth)
 *   - half_yearly: `dayOfMonth` of next half-year month (every 6 months from startMonth)
 *   - yearly: `dayOfMonth` of next year's `startMonth`
 *   - custom: today + intervalDays
 */
export function computeNextRunDate(
  schedule: {
    frequency: string
    intervalDays?: number | null
    dayOfMonth?: number | null
    weekday?: string | null
    startMonth?: number | null
    startDate?: string | null
  },
  fromDate: Date = new Date(),
): string {
  const from = new Date(fromDate)
  from.setHours(0, 0, 0, 0)

  switch (schedule.frequency) {
    case 'daily':
      return addDays(from, 1)

    case 'weekly': {
      const targetDay = schedule.weekday ? WEEKDAY_MAP[schedule.weekday] : 1
      const today = from.getDay()
      let daysUntil = targetDay - today
      if (daysUntil <= 0) daysUntil += 7
      return addDays(from, daysUntil)
    }

    case 'monthly': {
      const day = schedule.dayOfMonth ?? 1
      return nextDayOfMonth(from, day, 1)
    }

    case 'quarterly': {
      const day = schedule.dayOfMonth ?? 1
      return nextQuarterlyDate(from, day, schedule.startMonth ?? 1)
    }

    case 'half_yearly': {
      const day = schedule.dayOfMonth ?? 1
      return nextHalfYearlyDate(from, day, schedule.startMonth ?? 1)
    }

    case 'yearly': {
      const day = schedule.dayOfMonth ?? 1
      const month = schedule.startMonth ?? 1
      return nextYearlyDate(from, day, month)
    }

    case 'custom': {
      const days = schedule.intervalDays ?? 30
      return addDays(from, days)
    }

    default:
      return addDays(from, 30) // fallback: monthly
  }
}

function addDays(date: Date, days: number): string {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return toISODate(d)
}

function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function nextDayOfMonth(from: Date, day: number, monthsAhead: number): string {
  let year = from.getFullYear()
  let month = from.getMonth() + monthsAhead

  while (month > 12) {
    month -= 12
    year += 1
  }

  // Clamp day to last day of month (e.g. day=31 but month has 30 days)
  const lastDayOfMonth = new Date(year, month, 0).getDate()
  const actualDay = Math.min(day, lastDayOfMonth)

  const target = new Date(year, month - 1, actualDay)
  // If target is in the past, move to next month
  if (target < from) {
    return nextDayOfMonth(from, day, monthsAhead + 1)
  }
  return toISODate(target)
}

function nextQuarterlyDate(
  from: Date,
  day: number,
  startMonth: number,
): string {
  // Quarters: startMonth, startMonth+3, startMonth+6, startMonth+9
  const quarterMonths = [
    startMonth,
    ((startMonth + 3 - 1) % 12) + 1,
    ((startMonth + 6 - 1) % 12) + 1,
    ((startMonth + 9 - 1) % 12) + 1,
  ]

  // Find the next quarter month (with year offset)
  for (let yearOffset = 0; yearOffset < 2; yearOffset++) {
    for (const m of quarterMonths) {
      const year = from.getFullYear() + yearOffset
      const lastDay = new Date(year, m, 0).getDate()
      const actualDay = Math.min(day, lastDay)
      const target = new Date(year, m - 1, actualDay)
      if (target >= from) {
        return toISODate(target)
      }
    }
  }
  // Fallback
  return addDays(from, 90)
}

function nextHalfYearlyDate(
  from: Date,
  day: number,
  startMonth: number,
): string {
  const months = [startMonth, ((startMonth + 6 - 1) % 12) + 1]
  for (let yearOffset = 0; yearOffset < 2; yearOffset++) {
    for (const m of months) {
      const year = from.getFullYear() + yearOffset
      const lastDay = new Date(year, m, 0).getDate()
      const actualDay = Math.min(day, lastDay)
      const target = new Date(year, m - 1, actualDay)
      if (target >= from) {
        return toISODate(target)
      }
    }
  }
  return addDays(from, 180)
}

function nextYearlyDate(from: Date, day: number, month: number): string {
  let year = from.getFullYear()
  const lastDay = new Date(year, month, 0).getDate()
  const actualDay = Math.min(day, lastDay)
  let target = new Date(year, month - 1, actualDay)
  if (target < from) {
    year += 1
    const lastDay2 = new Date(year, month, 0).getDate()
    target = new Date(year, month - 1, Math.min(day, lastDay2))
  }
  return toISODate(target)
}

/**
 * Generate scheduled dates for a given month (for calendar view).
 * Returns an array of ISO date strings that fall within the month.
 */
export function generateScheduledDatesForMonth(
  schedule: {
    frequency: string
    intervalDays?: number | null
    dayOfMonth?: number | null
    weekday?: string | null
    startMonth?: number | null
  },
  year: number,
  month: number, // 1-12
): string[] {
  const dates: string[] = []
  const daysInMonth = new Date(year, month, 0).getDate()

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month - 1, day)
    const isoDate = toISODate(date)

    switch (schedule.frequency) {
      case 'daily':
        dates.push(isoDate)
        break
      case 'weekly':
        if (schedule.weekday && date.getDay() === WEEKDAY_MAP[schedule.weekday]) {
          dates.push(isoDate)
        }
        break
      case 'monthly':
        if (day === (schedule.dayOfMonth ?? 1)) {
          dates.push(isoDate)
        }
        break
      case 'quarterly':
        if (
          schedule.startMonth &&
          ((month - schedule.startMonth + 12) % 3 === 0) &&
          day === (schedule.dayOfMonth ?? 1)
        ) {
          dates.push(isoDate)
        }
        break
      case 'half_yearly':
        if (
          schedule.startMonth &&
          ((month - schedule.startMonth + 12) % 6 === 0) &&
          day === (schedule.dayOfMonth ?? 1)
        ) {
          dates.push(isoDate)
        }
        break
      case 'yearly':
        if (
          schedule.startMonth === month &&
          day === (schedule.dayOfMonth ?? 1)
        ) {
          dates.push(isoDate)
        }
        break
      case 'custom':
        // For custom, check if this date is `intervalDays` after startDate
        // (simplified: just include if modulo matches — not exact but
        // reasonable for calendar display)
        if (schedule.intervalDays) {
          // Calculate days since epoch
          const epochDays = Math.floor(date.getTime() / (1000 * 60 * 60 * 24))
          if (epochDays % schedule.intervalDays === 0) {
            dates.push(isoDate)
          }
        }
        break
    }
  }
  return dates
}

export const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'ทุกวัน',
  weekly: 'ทุกสัปดาห์',
  monthly: 'ทุกเดือน',
  quarterly: 'ทุกไตรมาส (3 เดือน)',
  half_yearly: 'ทุกครึ่งปี (6 เดือน)',
  yearly: 'ทุกปี',
  custom: 'กำหนดเอง',
}

export const FREQUENCY_OPTIONS = [
  { value: 'daily', label: 'ทุกวัน' },
  { value: 'weekly', label: 'ทุกสัปดาห์' },
  { value: 'monthly', label: 'ทุกเดือน' },
  { value: 'quarterly', label: 'ทุกไตรมาส (3 เดือน)' },
  { value: 'half_yearly', label: 'ทุกครึ่งปี (6 เดือน)' },
  { value: 'yearly', label: 'ทุกปี' },
  { value: 'custom', label: 'กำหนดเอง (ทุก N วัน)' },
]

export const WEEKDAY_OPTIONS = [
  { value: 'SUN', label: 'อาทิตย์' },
  { value: 'MON', label: 'จันทร์' },
  { value: 'TUE', label: 'อังคาร' },
  { value: 'WED', label: 'พุธ' },
  { value: 'THU', label: 'พฤหัส' },
  { value: 'FRI', label: 'ศุกร์' },
  { value: 'SAT', label: 'เสาร์' },
]

export const WEEKDAY_LABELS: Record<string, string> = {
  SUN: 'อาทิตย์',
  MON: 'จันทร์',
  TUE: 'อังคาร',
  WED: 'พุธ',
  THU: 'พฤหัส',
  FRI: 'ศุกร์',
  SAT: 'เสาร์',
}

/** Generate the next schedule number: PM-YYYYMM-NNN */
export async function generateScheduleNumber(
  existingCount: (prefix: string) => Promise<number>,
): Promise<string> {
  const now = new Date()
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`
  const prefix = `PM-${ymd}-`
  const count = await existingCount(prefix)
  return `${prefix}${String(count + 1).padStart(3, '0')}`
}
