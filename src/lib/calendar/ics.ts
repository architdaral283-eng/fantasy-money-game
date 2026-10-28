// An .ics feed. One URL your phone subscribes to once and never thinks about
// again — no messages, no commands, no upkeep.

export interface IcsEvent {
  uid: string;
  startUtc: string;      // ISO
  minutes: number;
  summary: string;
  description?: string;
  location?: string;
  /** Minutes before the start to alarm. Omitted for no alarm. */
  alarmMinutes?: number;
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline are special. */
export function icsEscape(s: string): string {
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** RFC 5545 §3.1: fold at 75 octets, continuation lines start with a space. */
export function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const dec = new TextDecoder();
  const out: string[] = [];
  let i = 0;
  while (i < bytes.length) {
    // 74 on continuation lines to leave room for the leading space.
    const take = out.length === 0 ? 75 : 74;
    let end = Math.min(i + take, bytes.length);
    // Never split a multi-byte character: back off to a boundary.
    while (end > i && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    out.push((out.length ? ' ' : '') + dec.decode(bytes.subarray(i, end)));
    i = end;
  }
  return out.join('\r\n');
}

/** 20261031T183000Z */
export function icsStamp(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${d.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

export function buildIcs(events: IcsEvent[], calName: string, nowIso = new Date().toISOString()): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//fantasy-money-game//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(calName)}`,
    'X-WR-TIMEZONE:Asia/Kolkata',
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H',
  ];
  for (const e of events) {
    const start = new Date(e.startUtc);
    const end = new Date(start.getTime() + e.minutes * 60000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${icsStamp(nowIso)}`,
      `DTSTART:${icsStamp(start)}`,
      `DTEND:${icsStamp(end)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.alarmMinutes) {
      lines.push(
        'BEGIN:VALARM',
        `TRIGGER:-PT${e.alarmMinutes}M`,
        'ACTION:DISPLAY',
        `DESCRIPTION:${icsEscape(e.summary)}`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // CRLF throughout, per spec. Calendar apps are forgiving; subscription
  // endpoints that validate are not.
  return lines.map(fold).join('\r\n') + '\r\n';
}
