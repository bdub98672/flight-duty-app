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

type DayRow = {
  day: number;
  duty_in: string;
  duty_out: string;
  flight_time: string;
  landings_day: string;
  landings_night: string;
  remarks: string;
};

type SignedMonthMap = Record<MonthKey, boolean>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const MONTHS: { key: MonthKey; label: string; days: number }[] = [
  { key: 'january', label: 'January', days: 31 },
  { key: 'february', label: 'February', days: 28 },
  { key: 'march', label: 'March', days: 31 },
  { key: 'april', label: 'April', days: 30 },
  { key: 'may', label: 'May', days: 31 },
  { key: 'june', label: 'June', days: 30 },
  { key: 'july', label: 'July', days: 31 },
  { key: 'august', label: 'August', days: 31 },
  { key: 'september', label: 'September', days: 30 },
  { key: 'october', label: 'October', days: 31 },
  { key: 'november', label: 'November', days: 30 },
  { key: 'december', label: 'December', days: 31 },
];

function buildEmptyRows(days: number): DayRow[] {
  return Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    duty_in: '',
    duty_out: '',
    flight_time: '',
    landings_day: '',
    landings_night: '',
    remarks: '',
  }));
}

function parseTimeToMinutes(value: string): number | null {
  if (!value || !value.includes(':')) return null;
  const [hh, mm] = value.split(':').map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function formatMinutesToHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function calcDutyMinutes(dutyIn: string, dutyOut: string): number | null {
  const start = parseTimeToMinutes(dutyIn);
  const end = parseTimeToMinutes(dutyOut);
  if (start === null || end === null) return null;

  if (end >= start) return end - start;
  return 24 * 60 - start + end;
}

function parseFlightTimeToMinutes(value: string): number {
  if (!value) return 0;

  if (value.includes(':')) {
    const [hh, mm] = value.split(':').map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return 0;
    return hh * 60 + mm;
  }

  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;

  return Math.round(numeric * 60);
}

export default function Page() {
  const currentMonth = MONTHS[new Date().getMonth()].key;

  const [selectedMonth, setSelectedMonth] = useState<MonthKey>(currentMonth);
  const [rows, setRows] = useState<DayRow[]>([]);
  const [signedMonths, setSignedMonths] = useState<SignedMonthMap>({
    january: false,
    february: false,
    march: false,
    april: false,
    may: false,
    june: false,
    july: false,
    august: false,
    september: false,
    october: false,
    november: false,
    december: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const monthConfig = useMemo(
    () => MONTHS.find((m) => m.key === selectedMonth)!,
    [selectedMonth]
  );

  useEffect(() => {
    void loadMonth(selectedMonth);
  }, [selectedMonth]);

  async function loadMonth(month: MonthKey) {
    setLoading(true);
    setMessage('');

    const config = MONTHS.find((m) => m.key === month)!;
    const emptyRows = buildEmptyRows(config.days);

    const { data, error } = await supabase
      .from('duty_logs')
      .select('*')
      .eq('month', month)
      .order('day', { ascending: true });

    if (error) {
      setRows(emptyRows);
      setLoading(false);
      setMessage(`Load error: ${error.message}`);
      return;
    }

    if (!data || data.length === 0) {
      setRows(emptyRows);
      setLoading(false);
      return;
    }

    const merged = emptyRows.map((row) => {
      const saved = data.find((d) => d.day === row.day);
      return {
        day: row.day,
        duty_in: saved?.duty_in ?? '',
        duty_out: saved?.duty_out ?? '',
        flight_time: saved?.flight_time ?? '',
        landings_day: saved?.landings_day?.toString() ?? '',
        landings_night: saved?.landings_night?.toString() ?? '',
        remarks: saved?.remarks ?? '',
      };
    });

    const signed = data.some((d) => d.signed === true);
    setRows(merged);
    setSignedMonths((prev) => ({ ...prev, [month]: signed }));
    setLoading(false);
  }

  function updateRow(index: number, field: keyof DayRow, value: string) {
    if (signedMonths[selectedMonth]) return;

    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  async function saveMonth() {
    if (signedMonths[selectedMonth]) {
      setMessage('This month is signed and locked.');
      return;
    }

    setSaving(true);
    setMessage('');

    const payload = rows.map((row) => ({
      month: selectedMonth,
      day: row.day,
      duty_in: row.duty_in || null,
      duty_out: row.duty_out || null,
      flight_time: row.flight_time || null,
      landings_day: row.landings_day ? Number(row.landings_day) : null,
      landings_night: row.landings_night ? Number(row.landings_night) : null,
      remarks: row.remarks || null,
      signed: false,
    }));

    const { error } = await supabase
      .from('duty_logs')
      .upsert(payload, { onConflict: 'month,day' });

    setSaving(false);

    if (error) {
      setMessage(`Save error: ${error.message}`);
      return;
    }

    setMessage(`${monthConfig.label} saved.`);
  }

  async function signMonth() {
    if (signedMonths[selectedMonth]) {
      setMessage('This month is already signed.');
      return;
    }

    setSaving(true);
    setMessage('');

    const payload = rows.map((row) => ({
      month: selectedMonth,
      day: row.day,
      duty_in: row.duty_in || null,
      duty_out: row.duty_out || null,
      flight_time: row.flight_time || null,
      landings_day: row.landings_day ? Number(row.landings_day) : null,
      landings_night: row.landings_night ? Number(row.landings_night) : null,
      remarks: row.remarks || null,
      signed: true,
    }));

    const { error } = await supabase
      .from('duty_logs')
      .upsert(payload, { onConflict: 'month,day' });

    setSaving(false);

    if (error) {
      setMessage(`Sign error: ${error.message}`);
      return;
    }

    setSignedMonths((prev) => ({ ...prev, [selectedMonth]: true }));
    setMessage(`${monthConfig.label} signed and locked.`);
  }

  async function unlockMonth() {
    setSaving(true);
    setMessage('');

    const payload = rows.map((row) => ({
      month: selectedMonth,
      day: row.day,
      duty_in: row.duty_in || null,
      duty_out: row.duty_out || null,
      flight_time: row.flight_time || null,
      landings_day: row.landings_day ? Number(row.landings_day) : null,
      landings_night: row.landings_night ? Number(row.landings_night) : null,
      remarks: row.remarks || null,
      signed: false,
    }));

    const { error } = await supabase
      .from('duty_logs')
      .upsert(payload, { onConflict: 'month,day' });

    setSaving(false);

    if (error) {
      setMessage(`Unlock error: ${error.message}`);
      return;
    }

    setSignedMonths((prev) => ({ ...prev, [selectedMonth]: false }));
    setMessage(`${monthConfig.label} unlocked.`);
  }

  const totalFlightMinutes = rows.reduce(
    (sum, row) => sum + parseFlightTimeToMinutes(row.flight_time),
    0
  );

  const totalDayLandings = rows.reduce(
    (sum, row) => sum + (Number(row.landings_day) || 0),
    0
  );

  const totalNightLandings = rows.reduce(
    (sum, row) => sum + (Number(row.landings_night) || 0),
    0
  );

  return (
    <main
      style={{
        maxWidth: 1400,
        margin: '0 auto',
        padding: 24,
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Flight &amp; Duty Log</h1>
      <p style={{ marginTop: 0, color: '#555' }}>
        Save monthly duty and flight records, then sign the month to lock it.
      </p>

      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <label>
          <strong>Month: </strong>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value as MonthKey)}
            style={{ marginLeft: 8, padding: 6 }}
          >
            {MONTHS.map((month) => (
              <option key={month.key} value={month.key}>
                {month.label}
              </option>
            ))}
          </select>
        </label>

        <button
          onClick={saveMonth}
          disabled={saving || loading || signedMonths[selectedMonth]}
          style={{ padding: '8px 14px', cursor: 'pointer' }}
        >
          {saving ? 'Working...' : 'Save Month'}
        </button>

        <button
          onClick={signMonth}
          disabled={saving || loading || signedMonths[selectedMonth]}
          style={{ padding: '8px 14px', cursor: 'pointer' }}
        >
          {saving ? 'Working...' : 'Sign Month'}
        </button>

        <button
          onClick={unlockMonth}
          disabled={saving || loading || !signedMonths[selectedMonth]}
          style={{ padding: '8px 14px', cursor: 'pointer' }}
        >
          {saving ? 'Working...' : 'Unlock Month'}
        </button>

        <span
          style={{
            fontWeight: 700,
            color: signedMonths[selectedMonth] ? '#0a7a2f' : '#8a5a00',
          }}
        >
          {signedMonths[selectedMonth] ? 'Signed / Locked' : 'Open / Editable'}
        </span>
      </div>

      {message && (
        <div
          style={{
            marginBottom: 16,
            padding: 10,
            border: '1px solid #ddd',
            background: '#f8f8f8',
          }}
        >
          {message}
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <div style={{ overflowX: 'auto', border: '1px solid #ddd' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                minWidth: 1000,
              }}
            >
              <thead>
                <tr style={{ background: '#f0f0f0' }}>
                  <th style={thStyle}>Day</th>
                  <th style={thStyle}>Duty In</th>
                  <th style={thStyle}>Duty Out</th>
                  <th style={thStyle}>Duty Hours</th>
                  <th style={thStyle}>Flight Time</th>
                  <th style={thStyle}>Day Landings</th>
                  <th style={thStyle}>Night Landings</th>
                  <th style={thStyle}>Remarks</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const dutyMinutes = calcDutyMinutes(row.duty_in, row.duty_out);

                  return (
                    <tr key={row.day}>
                      <td style={tdStyle}>{row.day}</td>
                      <td style={tdStyle}>
                        <input
                          type="time"
                          value={row.duty_in}
                          disabled={signedMonths[selectedMonth]}
                          onChange={(e) =>
                            updateRow(index, 'duty_in', e.target.value)
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="time"
                          value={row.duty_out}
                          disabled={signedMonths[selectedMonth]}
                          onChange={(e) =>
                            updateRow(index, 'duty_out', e.target.value)
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        {dutyMinutes === null
                          ? ''
                          : formatMinutesToHoursMinutes(dutyMinutes)}
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          value={row.flight_time}
                          disabled={signedMonths[selectedMonth]}
                          onChange={(e) =>
                            updateRow(index, 'flight_time', e.target.value)
                          }
                          placeholder="1.5 or 1:30"
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min="0"
                          value={row.landings_day}
                          disabled={signedMonths[selectedMonth]}
                          onChange={(e) =>
                            updateRow(index, 'landings_day', e.target.value)
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="number"
                          min="0"
                          value={row.landings_night}
                          disabled={signedMonths[selectedMonth]}
                          onChange={(e) =>
                            updateRow(index, 'landings_night', e.target.value)
                          }
                          style={inputStyle}
                        />
                      </td>
                      <td style={tdStyle}>
                        <input
                          type="text"
                          value={row.remarks}
                          disabled={signedMonths[selectedMonth]}
                          onChange={(e) =>
                            updateRow(index, 'remarks', e.target.value)
                          }
                          style={inputStyle}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#fafafa', fontWeight: 700 }}>
                  <td style={tdStyle}>Totals</td>
                  <td style={tdStyle}></td>
                  <td style={tdStyle}></td>
                  <td style={tdStyle}></td>
                  <td style={tdStyle}>
                    {formatMinutesToHoursMinutes(totalFlightMinutes)}
                  </td>
                  <td style={tdStyle}>{totalDayLandings}</td>
                  <td style={tdStyle}>{totalNightLandings}</td>
                  <td style={tdStyle}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </main>
  );
}

const thStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: 10,
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  border: '1px solid #ddd',
  padding: 8,
  verticalAlign: 'middle',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: 6,
  boxSizing: 'border-box',
};
