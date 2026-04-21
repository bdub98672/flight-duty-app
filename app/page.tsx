'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

type MonthKey =
  | 'january'
  | 'february'
  | 'march'
  | 'april'
  | 'may'
  | 'june'
  | 'july'
  | 'august'
  | 'september'
  | 'october'
  | 'november'
  | 'december';

type PilotName = 'Walsh' | 'Clark' | 'Millea' | 'Reyna';

type DbRow = {
  id?: number;
  pilot_name: string;
  log_date: string;
  month_key: string;
  duty_in: string | null;
  duty_out: string | null;
  flight_hours: number | null;
  day_landings: number | null;
  night_landings: number | null;
  remarks: string | null;
  duty_exceedance: boolean | null;
  exceedance_reason: string | null;
  approved_by: string | null;
  approval_time: string | null;
  signed_at: string | null;
  signed_by: string | null;
};

type RowInput = {
  day: number;
  log_date: string;
  duty_in: string;
  duty_out: string;
  flight_hours: string;
  day_landings: string;
  night_landings: string;
  remarks: string;
  exceedance_reason: string;
  approved_by: string;
  approval_time: string;
  signed_at: string | null;
  signed_by: string | null;
};

type DerivedRow = {
  duty_hours: string;
  rest_24h: string;
  flight_status_24h: string;
  day_currency: string;
  night_currency: string;
  month_running_total: string;
  quarter_hours: string;
  two_quarter_hours: string;
  year_hours: string;
  quarter_rest_days: string;
  duty_exceedance: boolean;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required.');
if (!supabaseAnonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required.');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const PILOTS: PilotName[] = ['Walsh', 'Clark', 'Millea', 'Reyna'];

const MONTHS: { key: MonthKey; label: string; days: number; monthIndex: number }[] = [
  { key: 'january', label: 'January', days: 31, monthIndex: 0 },
  { key: 'february', label: 'February', days: 28, monthIndex: 1 },
  { key: 'march', label: 'March', days: 31, monthIndex: 2 },
  { key: 'april', label: 'April', days: 30, monthIndex: 3 },
  { key: 'may', label: 'May', days: 31, monthIndex: 4 },
  { key: 'june', label: 'June', days: 30, monthIndex: 5 },
  { key: 'july', label: 'July', days: 31, monthIndex: 6 },
  { key: 'august', label: 'August', days: 31, monthIndex: 7 },
  { key: 'september', label: 'September', days: 30, monthIndex: 8 },
  { key: 'october', label: 'October', days: 31, monthIndex: 9 },
  { key: 'november', label: 'November', days: 30, monthIndex: 10 },
  { key: 'december', label: 'December', days: 31, monthIndex: 11 },
];

const ACTIVE_YEAR = new Date().getFullYear();

function monthLabel(month: MonthKey): string {
  return MONTHS.find((m) => m.key === month)?.label ?? month;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function isoDate(year: number, monthIndex: number, day: number): string {
  return `${year}-${pad2(monthIndex + 1)}-${pad2(day)}`;
}

function buildEmptyRows(month: MonthKey, year: number): RowInput[] {
  const config = MONTHS.find((m) => m.key === month)!;
  return Array.from({ length: config.days }, (_, index) => ({
    day: index + 1,
    log_date: isoDate(year, config.monthIndex, index + 1),
    duty_in: 'OFF',
    duty_out: '',
    flight_hours: '',
    day_landings: '',
    night_landings: '',
    remarks: '',
    exceedance_reason: '',
    approved_by: '',
    approval_time: '',
    signed_at: null,
    signed_by: null,
  }));
}

function parseNumber(value: string): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function formatHours(value: number): string {
  if (!Number.isFinite(value)) return '';
  return value.toFixed(2);
}

function normalizeTimeInput(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return '';
  if (trimmed === 'OFF') return 'OFF';

  const digits = trimmed.replace(/[^\d]/g, '');
  if (digits.length === 4) {
    const hh = Number(digits.slice(0, 2));
    const mm = Number(digits.slice(2, 4));
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${pad2(hh)}:${pad2(mm)}`;
    }
  }

  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [hh, mm] = trimmed.split(':').map(Number);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      return `${pad2(hh)}:${pad2(mm)}`;
    }
  }

  return value;
}

function timeToMinutes(value: string): number | null {
  if (!value) return null;
  if (value.toUpperCase() === 'OFF') return null;
  const normalized = normalizeTimeInput(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) return null;
  const [hh, mm] = normalized.split(':').map(Number);
  return hh * 60 + mm;
}

function makeDateTime(logDate: string, timeText: string): Date | null {
  const minutes = timeToMinutes(timeText);
  if (minutes === null) return null;
  const [y, m, d] = logDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
  dt.setMinutes(minutes);
  return dt;
}

function computeDutyHours(dutyIn: string, dutyOut: string): number {
  const inMin = timeToMinutes(dutyIn);
  const outMin = timeToMinutes(dutyOut);
  if (inMin === null || outMin === null) return 0;

  let diff = outMin - inMin;
  if (diff < 0) diff += 24 * 60;
  return diff / 60;
}

function quarterOfMonth(monthIndex: number): number {
  return Math.floor(monthIndex / 3) + 1;
}

function quarterStartMonth(monthIndex: number): number {
  return Math.floor(monthIndex / 3) * 3;
}

function previousQuarterStartMonth(monthIndex: number): number {
  const currentQuarterStart = quarterStartMonth(monthIndex);
  return Math.max(0, currentQuarterStart - 3);
}

function isOffRow(row: RowInput): boolean {
  return row.duty_in.trim().toUpperCase() === 'OFF' || !row.duty_in.trim();
}

function rowLocked(row: RowInput, monthSigned: boolean): boolean {
  return monthSigned || Boolean(row.signed_at);
}

function toDbRow(pilot: PilotName, month: MonthKey, row: RowInput): DbRow {
  const normalizedDutyIn = normalizeTimeInput(row.duty_in);
  const normalizedDutyOut = normalizeTimeInput(row.duty_out);
  const flightHours = row.flight_hours.trim() ? parseNumber(row.flight_hours) : null;
  const dayLandings = row.day_landings.trim() ? parseInt(row.day_landings, 10) : null;
  const nightLandings = row.night_landings.trim() ? parseInt(row.night_landings, 10) : null;
  const dutyHours = computeDutyHours(normalizedDutyIn, normalizedDutyOut);

  return {
    pilot_name: pilot,
    log_date: row.log_date,
    month_key: month,
    duty_in: normalizedDutyIn || null,
    duty_out: normalizedDutyOut || null,
    flight_hours: flightHours,
    day_landings: Number.isFinite(dayLandings as number) ? dayLandings : null,
    night_landings: Number.isFinite(nightLandings as number) ? nightLandings : null,
    remarks: row.remarks.trim() || null,
    duty_exceedance: dutyHours > 14,
    exceedance_reason: row.exceedance_reason.trim() || null,
    approved_by: row.approved_by.trim() || null,
    approval_time: row.approval_time.trim() || null,
    signed_at: row.signed_at,
    signed_by: row.signed_by,
  };
}

function fromDbRow(db: DbRow): RowInput {
  const dt = new Date(`${db.log_date}T00:00:00`);
  return {
    day: dt.getDate(),
    log_date: db.log_date,
    duty_in: db.duty_in ?? 'OFF',
    duty_out: db.duty_out ?? '',
    flight_hours: db.flight_hours != null ? String(db.flight_hours) : '',
    day_landings: db.day_landings != null ? String(db.day_landings) : '',
    night_landings: db.night_landings != null ? String(db.night_landings) : '',
    remarks: db.remarks ?? '',
    exceedance_reason: db.exceedance_reason ?? '',
    approved_by: db.approved_by ?? '',
    approval_time: db.approval_time ?? '',
    signed_at: db.signed_at,
    signed_by: db.signed_by,
  };
}

function mergeMonthRows(month: MonthKey, year: number, dbRows: DbRow[]): RowInput[] {
  const empty = buildEmptyRows(month, year);
  const map = new Map<string, DbRow>();
  dbRows.forEach((r) => map.set(r.log_date, r));

  return empty.map((row) => {
    const found = map.get(row.log_date);
    return found ? fromDbRow(found) : row;
  });
}

function buildDerivedRows(rows: RowInput[], allYearRows: DbRow[], month: MonthKey): DerivedRow[] {
  const monthIndex = MONTHS.find((m) => m.key === month)!.monthIndex;
  const qStart = quarterStartMonth(monthIndex);
  const prevQStart = previousQuarterStartMonth(monthIndex);

  return rows.map((row, index) => {
    const dutyHoursNum = computeDutyHours(row.duty_in, row.duty_out);
    const currentDate = new Date(`${row.log_date}T00:00:00`);

    const previousRow = index > 0 ? rows[index - 1] : null;
    let rest24h = '';

    if (previousRow) {
      if (isOffRow(previousRow)) {
        rest24h = '24+';
      } else {
        const prevOut = makeDateTime(previousRow.log_date, previousRow.duty_out);
        const currentIn = makeDateTime(row.log_date, row.duty_in);
        if (prevOut && currentIn) {
          const diff = (currentIn.getTime() - prevOut.getTime()) / 3600000;
          if (diff >= 24) rest24h = '24+';
          else if (diff > 0) rest24h = diff.toFixed(2);
        }
      }
    }

    const flightHoursNum = parseNumber(row.flight_hours || '0');
    const flightStatus24h = flightHoursNum > 8 ? 'OVER 8.0' : 'OK';

    const ninetyDaysAgo = new Date(currentDate);
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    const prior90 = allYearRows.filter((r) => {
      const d = new Date(`${r.log_date}T00:00:00`);
      return d >= ninetyDaysAgo && d <= currentDate;
    });

    const dayLandingCount =
      prior90.reduce((sum, r) => sum + (r.day_landings ?? 0) + (r.night_landings ?? 0), 0) +
      parseNumber(row.day_landings || '0') +
      parseNumber(row.night_landings || '0');

    const nightLandingCount =
      prior90.reduce((sum, r) => sum + (r.night_landings ?? 0), 0) +
      parseNumber(row.night_landings || '0');

    const dayCurrency = dayLandingCount >= 3 ? 'CURRENT' : 'NOT CURRENT';
    const nightCurrency = nightLandingCount >= 3 ? 'CURRENT' : 'NOT CURRENT';

    const monthRowsUpToCurrent = rows.filter((r) => new Date(`${r.log_date}T00:00:00`) <= currentDate);
    const monthRunningTotal = monthRowsUpToCurrent.reduce((sum, r) => sum + parseNumber(r.flight_hours || '0'), 0);

    const quarterHours = allYearRows
      .filter((r) => {
        const d = new Date(`${r.log_date}T00:00:00`);
        return d.getMonth() >= qStart && d.getMonth() < qStart + 3 && d <= currentDate;
      })
      .reduce((sum, r) => sum + (r.flight_hours ?? 0), 0) + flightHoursNum;

    const twoQuarterHours = allYearRows
      .filter((r) => {
        const d = new Date(`${r.log_date}T00:00:00`);
        return d.getMonth() >= prevQStart && d.getMonth() < qStart && d <= currentDate;
      })
      .reduce((sum, r) => sum + (r.flight_hours ?? 0), 0);

    const yearHours =
      allYearRows
        .filter((r) => new Date(`${r.log_date}T00:00:00`) <= currentDate)
        .reduce((sum, r) => sum + (r.flight_hours ?? 0), 0) + flightHoursNum;

    const quarterRestDays =
      rows.filter((r) => {
        const d = new Date(`${r.log_date}T00:00:00`);
        return d.getMonth() >= qStart && d.getMonth() < qStart + 3 && isOffRow(r);
      }).length || 0;

    return {
      duty_hours: dutyHoursNum ? dutyHoursNum.toFixed(2) : '',
      rest_24h: rest24h,
      flight_status_24h: flightStatus24h,
      day_currency: dayCurrency,
      night_currency: nightCurrency,
      month_running_total: formatHours(monthRunningTotal),
      quarter_hours: formatHours(quarterHours),
      two_quarter_hours: formatHours(twoQuarterHours),
      year_hours: formatHours(yearHours),
      quarter_rest_days: String(quarterRestDays),
      duty_exceedance: dutyHoursNum > 14,
    };
  });
}

export default function Page() {
  const [pilot, setPilot] = useState<PilotName>('Walsh');
  const [month, setMonth] = useState<MonthKey>('january');
  const [rows, setRows] = useState<RowInput[]>(buildEmptyRows('january', ACTIVE_YEAR));
  const [allYearRows, setAllYearRows] = useState<DbRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [message, setMessage] = useState('');
  const [monthSigned, setMonthSigned] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signName, setSignName] = useState('');

  async function loadYearData(selectedPilot: PilotName) {
    const start = `${ACTIVE_YEAR}-01-01`;
    const end = `${ACTIVE_YEAR}-12-31`;

    const { data, error } = await supabase
      .from('duty_logs_v2')
      .select('*')
      .eq('pilot_name', selectedPilot)
      .gte('log_date', start)
      .lte('log_date', end)
      .order('log_date', { ascending: true });

    if (error) {
      throw error;
    }

    setAllYearRows((data as DbRow[]) ?? []);
    return (data as DbRow[]) ?? [];
  }

  async function loadMonth(selectedPilot: PilotName, selectedMonth: MonthKey) {
    setLoading(true);
    setMessage('');

    try {
      const yearData = await loadYearData(selectedPilot);

      const monthData = yearData.filter((r) => r.month_key === selectedMonth);
      const merged = mergeMonthRows(selectedMonth, ACTIVE_YEAR, monthData);

      const anySigned = merged.some((r) => Boolean(r.signed_at));
      setMonthSigned(anySigned);
      setRows(merged);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown load error';
      setMessage(`Load error: ${msg}`);
      setRows(buildEmptyRows(selectedMonth, ACTIVE_YEAR));
      setMonthSigned(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadMonth(pilot, month);
  }, [pilot, month]);

  const derivedRows = useMemo(() => buildDerivedRows(rows, allYearRows, month), [rows, allYearRows, month]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.flight += parseNumber(row.flight_hours || '0');
        acc.day += parseNumber(row.day_landings || '0');
        acc.night += parseNumber(row.night_landings || '0');
        return acc;
      },
      { flight: 0, day: 0, night: 0 }
    );
  }, [rows]);

  function updateRow(day: number, field: keyof RowInput, value: string) {
    setRows((prev) =>
      prev.map((row) => {
        if (row.day !== day) return row;
        if (field === 'duty_in' || field === 'duty_out') {
          return { ...row, [field]: value.toUpperCase() === 'OFF' ? 'OFF' : value };
        }
        return { ...row, [field]: value };
      })
    );
  }

  async function saveRow(day: number) {
    const row = rows.find((r) => r.day === day);
    if (!row) return;
    if (rowLocked(row, monthSigned)) return;

    setSavingDay(day);
    setMessage('');

    try {
      const payload = toDbRow(pilot, month, row);

      const { error } = await supabase.from('duty_logs_v2').upsert(payload, {
        onConflict: 'pilot_name,log_date',
      });

      if (error) throw error;

      await loadMonth(pilot, month);
      setMessage(`Saved day ${day}.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown save error';
      setMessage(`Save error: ${msg}`);
    } finally {
      setSavingDay(null);
    }
  }

  async function signMonth() {
    if (!signName.trim()) {
      setMessage('Enter a signer name before signing the month.');
      return;
    }

    setSigning(true);
    setMessage('');

    try {
      const stamp = new Date().toISOString();
      const payload = rows.map((row) => ({
        ...toDbRow(pilot, month, row),
        signed_at: stamp,
        signed_by: signName.trim(),
      }));

      const { error } = await supabase.from('duty_logs_v2').upsert(payload, {
        onConflict: 'pilot_name,log_date',
      });

      if (error) throw error;

      setMonthSigned(true);
      await loadMonth(pilot, month);
      setMessage(`Month signed by ${signName.trim()}.`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown sign error';
      setMessage(`Sign error: ${msg}`);
    } finally {
      setSigning(false);
    }
  }

  async function unlockMonth() {
    setSigning(true);
    setMessage('');

    try {
      const updates = rows.map((row) => ({
        pilot_name: pilot,
        log_date: row.log_date,
        signed_at: null,
        signed_by: null,
      }));

      for (const update of updates) {
        const { error } = await supabase
          .from('duty_logs_v2')
          .update({ signed_at: null, signed_by: null })
          .eq('pilot_name', update.pilot_name)
          .eq('log_date', update.log_date);

        if (error) throw error;
      }

      setMonthSigned(false);
      await loadMonth(pilot, month);
      setMessage('Month unlocked.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown unlock error';
      setMessage(`Unlock error: ${msg}`);
    } finally {
      setSigning(false);
    }
  }

  return (
    <main style={{ padding: 20, fontFamily: 'Arial, sans-serif' }}>
      <h1 style={{ marginBottom: 8 }}>Flight &amp; Duty Log</h1>
      <p style={{ marginTop: 0, color: '#555' }}>
        Pilot monthly log rebuilt from spreadsheet. Year: {ACTIVE_YEAR}
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 16,
          padding: 12,
          border: '1px solid #ccc',
          borderRadius: 8,
          background: '#f7f7f7',
        }}
      >
        <label>
          Pilot
          <br />
          <select value={pilot} onChange={(e) => setPilot(e.target.value as PilotName)}>
            {PILOTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>

        <label>
          Month
          <br />
          <select value={month} onChange={(e) => setMonth(e.target.value as MonthKey)}>
            {MONTHS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Signer Name
          <br />
          <input
            value={signName}
            onChange={(e) => setSignName(e.target.value)}
            placeholder="Name for sign-off"
            disabled={monthSigned}
          />
        </label>

        <button onClick={signMonth} disabled={signing || monthSigned || loading}>
          {signing ? 'Signing...' : 'Sign Month'}
        </button>

        <button onClick={unlockMonth} disabled={signing || !monthSigned || loading}>
          {signing ? 'Working...' : 'Unlock Month'}
        </button>

        <button
          onClick={() => window.print()}
          disabled={loading}
          title="Use browser Print to PDF"
        >
          Print / PDF
        </button>

        <div style={{ marginLeft: 'auto', fontWeight: 700 }}>
          {monthSigned ? 'SIGNED / LOCKED' : 'UNSIGNED / EDITABLE'}
        </div>
      </div>

      {message && (
        <div
          style={{
            marginBottom: 12,
            padding: 10,
            background: '#eef4ff',
            border: '1px solid #c9dafc',
            borderRadius: 6,
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 2200, width: '100%' }}>
            <thead>
              <tr>
                {[
                  'Day',
                  'Date',
                  'Duty In',
                  'Duty Out',
                  'Duty Hours',
                  'Flight Hours',
                  '24h Flight Status',
                  '24hr Rest',
                  'Day Landings',
                  'Night Landings',
                  'Day Currency',
                  'Night Currency',
                  'Month Running Total',
                  'Quarter Hours',
                  '2Q Hours',
                  'Year Hours',
                  'Quarter Rest Days',
                  'Duty Exceedance',
                  'Exceedance Reason',
                  'Approved By',
                  'Approval Time',
                  'Remarks',
                  'Save',
                ].map((head) => (
                  <th
                    key={head}
                    style={{
                      border: '1px solid #999',
                      padding: 6,
                      background: '#dedede',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const calc = derivedRows[index];
                const locked = rowLocked(row, monthSigned);
                const restBad =
                  calc.rest_24h && calc.rest_24h !== '24+' && parseNumber(calc.rest_24h) < 10;
                const dutyBad = calc.duty_exceedance;
                const dayCurrentBad = calc.day_currency === 'NOT CURRENT';
                const nightCurrentBad = calc.night_currency === 'NOT CURRENT';
                const flightBad = calc.flight_status_24h !== 'OK';

                return (
                  <tr key={row.day}>
                    <td style={{ border: '1px solid #999', padding: 4 }}>{row.day}</td>
                    <td style={{ border: '1px solid #999', padding: 4 }}>{row.log_date}</td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.duty_in}
                        onChange={(e) => updateRow(row.day, 'duty_in', e.target.value)}
                        disabled={locked}
                        style={{ width: 70 }}
                      />
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.duty_out}
                        onChange={(e) => updateRow(row.day, 'duty_out', e.target.value)}
                        disabled={locked || row.duty_in.toUpperCase() === 'OFF'}
                        style={{ width: 70 }}
                      />
                    </td>

                    <td
                      style={{
                        border: '1px solid #999',
                        padding: 4,
                        background: dutyBad ? '#ffd6d6' : '#dff5df',
                        textAlign: 'center',
                      }}
                    >
                      {calc.duty_hours}
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.flight_hours}
                        onChange={(e) => updateRow(row.day, 'flight_hours', e.target.value)}
                        disabled={locked}
                        style={{ width: 70 }}
                      />
                    </td>

                    <td
                      style={{
                        border: '1px solid #999',
                        padding: 4,
                        background: flightBad ? '#ffd6d6' : '#dff5df',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {calc.flight_status_24h}
                    </td>

                    <td
                      style={{
                        border: '1px solid #999',
                        padding: 4,
                        background: restBad ? '#ffd6d6' : '#dff5df',
                        textAlign: 'center',
                      }}
                    >
                      {calc.rest_24h}
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.day_landings}
                        onChange={(e) => updateRow(row.day, 'day_landings', e.target.value)}
                        disabled={locked}
                        style={{ width: 60 }}
                      />
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.night_landings}
                        onChange={(e) => updateRow(row.day, 'night_landings', e.target.value)}
                        disabled={locked}
                        style={{ width: 60 }}
                      />
                    </td>

                    <td
                      style={{
                        border: '1px solid #999',
                        padding: 4,
                        background: dayCurrentBad ? '#ffd6d6' : '#dff5df',
                        textAlign: 'center',
                      }}
                    >
                      {calc.day_currency}
                    </td>

                    <td
                      style={{
                        border: '1px solid #999',
                        padding: 4,
                        background: nightCurrentBad ? '#ffd6d6' : '#dff5df',
                        textAlign: 'center',
                      }}
                    >
                      {calc.night_currency}
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4, textAlign: 'center' }}>
                      {calc.month_running_total}
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4, textAlign: 'center' }}>
                      {calc.quarter_hours}
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4, textAlign: 'center' }}>
                      {calc.two_quarter_hours}
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4, textAlign: 'center' }}>
                      {calc.year_hours}
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4, textAlign: 'center' }}>
                      {calc.quarter_rest_days}
                    </td>

                    <td
                      style={{
                        border: '1px solid #999',
                        padding: 4,
                        background: dutyBad ? '#ffd6d6' : '#dff5df',
                        textAlign: 'center',
                      }}
                    >
                      {dutyBad ? 'YES' : ''}
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.exceedance_reason}
                        onChange={(e) => updateRow(row.day, 'exceedance_reason', e.target.value)}
                        disabled={locked}
                        style={{ width: 180 }}
                      />
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.approved_by}
                        onChange={(e) => updateRow(row.day, 'approved_by', e.target.value)}
                        disabled={locked}
                        style={{ width: 120 }}
                      />
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.approval_time}
                        onChange={(e) => updateRow(row.day, 'approval_time', e.target.value)}
                        disabled={locked}
                        style={{ width: 120 }}
                        placeholder="HH:MM or note"
                      />
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <input
                        value={row.remarks}
                        onChange={(e) => updateRow(row.day, 'remarks', e.target.value)}
                        disabled={locked}
                        style={{ width: 220 }}
                      />
                    </td>

                    <td style={{ border: '1px solid #999', padding: 4 }}>
                      <button onClick={() => saveRow(row.day)} disabled={locked || savingDay === row.day}>
                        {savingDay === row.day ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <td colSpan={5} style={{ border: '1px solid #999', padding: 6, fontWeight: 700 }}>
                  Totals for {monthLabel(month)}
                </td>
                <td style={{ border: '1px solid #999', padding: 6, fontWeight: 700 }}>
                  {totals.flight.toFixed(2)}
                </td>
                <td colSpan={2} style={{ border: '1px solid #999', padding: 6 }} />
                <td style={{ border: '1px solid #999', padding: 6, fontWeight: 700 }}>
                  {totals.day}
                </td>
                <td style={{ border: '1px solid #999', padding: 6, fontWeight: 700 }}>
                  {totals.night}
                </td>
                <td colSpan={13} style={{ border: '1px solid #999', padding: 6 }} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </main>
  );
}
