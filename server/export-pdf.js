import PDFDocument from 'pdfkit';
import { MONTHS, formatDateNumeric } from './dates.js';
import {
  buildMonth, buildYear, descriptionForDay, exportRowsForWeek, formatHours, weekLabel,
} from './summary.js';

const C = {
  forest: '#1D4A3A',
  forestSoft: '#2C6B52',
  mist: '#E9F0E9',
  paper: '#FBFAF6',
  card: '#F3F1EA',
  line: '#DDD8CB',
  ink: '#253029',
  muted: '#6E756C',
  amber: '#B7791F',
  amberSoft: '#FBF1DD',
  white: '#FFFFFF',
  sand: '#F3F1EA',
  blue: '#3F6B8F',
  red: '#A8443F',
};

const DAY_LABELS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];
const MARGIN = 36;

function signed(value) {
  const n = Number(value);
  if (n > 0) return `+${formatHours(n)}`;
  return formatHours(n);
}

function isoWeekdayOf(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function drawPageHeader(doc, settings, { eyebrow, rightTitle, subtitle }) {
  const width = doc.page.width;
  doc.save();
  doc.rect(0, 0, width, 7).fill(C.forest);
  doc.restore();

  const x = MARGIN;
  doc.save();
  doc.roundedRect(x, 28, 30, 30, 7).fill(C.forest);
  for (let i = 0; i < 4; i += 1) {
    const heights = [8, 15, 11, 18];
    doc.roundedRect(x + 8 + i * 4.2, 43 - heights[i] / 2, 2.2, heights[i], 1.1).fill(C.mist);
  }
  doc.restore();

  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(7.5)
    .text(String(settings.company || 'UREN').toUpperCase(), x + 40, 30, { characterSpacing: 1.4 });
  doc.fillColor(C.ink).font('Times-Bold').fontSize(19)
    .text('Urenregistratie', x + 40, 40, { lineBreak: false });
  doc.fillColor(C.muted).font('Helvetica').fontSize(8.5)
    .text(subtitle, x + 40, 64, { lineBreak: false });

  const rightWidth = 260;
  doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7.5)
    .text(eyebrow.toUpperCase(), width - MARGIN - rightWidth, 29, {
      width: rightWidth, align: 'right', characterSpacing: 1.3,
    });
  doc.fillColor(C.forest).font('Times-Bold').fontSize(17)
    .text(rightTitle, width - MARGIN - rightWidth, 39, { width: rightWidth, align: 'right' });
  doc.fillColor(C.muted).font('Helvetica').fontSize(8)
    .text(`Generated ${new Date().toISOString().slice(0, 10)}`, width - MARGIN - rightWidth, 60, {
      width: rightWidth, align: 'right',
    });
}

function drawKpiBox(doc, x, y, width, height, { label, value, sub, primary }) {
  if (primary) {
    doc.roundedRect(x, y, width, height, 8).fill(C.forest);
  } else {
    doc.roundedRect(x, y, width, height, 8).fill(C.paper)
      .lineWidth(1).strokeColor(C.line).stroke();
  }
  const labelColor = primary ? '#B9D2C5' : C.muted;
  const valueColor = primary ? C.white : C.forest;
  const subColor = primary ? '#D7E6DD' : C.muted;
  doc.fillColor(labelColor).font('Helvetica-Bold').fontSize(7)
    .text(label.toUpperCase(), x + 12, y + 9, { width: width - 24, characterSpacing: 1.1 });
  doc.fillColor(valueColor).font('Times-Bold').fontSize(19)
    .text(value, x + 12, y + 20, { width: width - 24, lineBreak: false });
  if (sub) {
    doc.fillColor(subColor).font('Helvetica').fontSize(7.5)
      .text(sub, x + 12, y + height - 15, { width: width - 24, lineBreak: false });
  }
}

function drawKpis(doc, data) {
  const content = doc.page.width - MARGIN * 2;
  const gap = 10;
  const width = (content - gap * 3) / 4;
  const y = 90;
  const height = 52;
  const s = data.summary;
  const leaveSub = [
    s.absences.vacation ? `${s.absences.vacation} vacation` : null,
    s.absences.holiday ? `${s.absences.holiday} holiday` : null,
    s.absences.sick ? `${s.absences.sick} sick` : null,
    s.absences.off ? `${s.absences.off} off` : null,
  ].filter(Boolean).join(' · ') || 'no leave this month';
  drawKpiBox(doc, MARGIN, y, width, height, {
    label: 'Hours logged',
    value: `${formatHours(s.loggedHours)} h`,
    sub: `of ${formatHours(s.targetHours)} h planned`,
    primary: true,
  });
  drawKpiBox(doc, MARGIN + width + gap, y, width, height, {
    label: 'Workdays',
    value: `${s.recordedWorkdays} / ${s.expectedWorkdays}`,
    sub: 'recorded',
  });
  drawKpiBox(doc, MARGIN + (width + gap) * 2, y, width, height, {
    label: 'Leave',
    value: String(s.leaveDays),
    sub: leaveSub,
  });
  drawKpiBox(doc, MARGIN + (width + gap) * 3, y, width, height, {
    label: 'To complete',
    value: String(s.missingDays + s.undescribedDays),
    sub: s.missingDays || s.undescribedDays
      ? `${s.missingDays} missing · ${s.undescribedDays} no description`
      : 'every past workday is logged',
  });
  return y + height + 18;
}

function columnGeometry(doc) {
  const content = doc.page.width - MARGIN * 2;
  const dayW = 34;
  const dateW = 66;
  const hoursW = 56;
  const descW = content - dayW - dateW - hoursW;
  const xDay = MARGIN;
  const xDate = xDay + dayW;
  const xDesc = xDate + dateW;
  const xHours = xDesc + descW;
  return { content, dayW, dateW, descW, hoursW, xDay, xDate, xDesc, xHours };
}

function drawTableHeader(doc, y) {
  const g = columnGeometry(doc);
  doc.rect(MARGIN, y, g.content, 20).fill(C.forest);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7)
    .text('DAY', g.xDay + 7, y + 7, { width: g.dayW, characterSpacing: 0.8 });
  doc.text('DATE', g.xDate + 4, y + 7, { width: g.dateW, characterSpacing: 0.8 });
  doc.text('DESCRIPTION', g.xDesc + 7, y + 7, { width: g.descW, characterSpacing: 0.8 });
  doc.text('HOURS', g.xHours, y + 7, { width: g.hoursW - 7, align: 'right', characterSpacing: 0.8 });
  return y + 20;
}

function drawMonthTable(doc, data, startY) {
  const g = columnGeometry(doc);
  const pageBottom = doc.page.height - 55;
  const settings = data.workspace;
  let y = startY;
  y = drawTableHeader(doc, y);

  const ensureRoom = (needed) => {
    if (y + needed <= pageBottom) return;
    doc.addPage();
    doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(7.5)
      .text(`${data.monthName.toUpperCase()} ${data.year}  ·  CONTINUED`, MARGIN, 26, {
        characterSpacing: 1.1,
      });
    y = drawTableHeader(doc, 42);
  };

  for (const week of data.weeks) {
    const rows = exportRowsForWeek(data, week);
    if (!rows.length) continue;
    ensureRoom(20 + Math.min(rows.length, 5) * 22);

    doc.rect(MARGIN, y, g.content, 18).fill(C.mist);
    doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(7.5)
      .text(weekLabel(week).toUpperCase(), g.xDay + 7, y + 6, {
        width: g.content - 120, characterSpacing: 0.6,
      });
    doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(7.5)
      .text(`${formatHours(week.hours)} h`, g.xHours, y + 6, {
        width: g.hoursW - 7, align: 'right',
      });
    y += 18;

    for (const item of rows) {
      const { date, day, isWorkday, isFuture } = item;
      const isMissing = isWorkday && date < data.today && !day;
      let description = '';
      if (day) {
        description = descriptionForDay(day);
        if (!description && day.kind === 'work') description = 'No description';
      } else if (isMissing) {
        description = 'Not logged';
      }
      doc.font('Helvetica').fontSize(8.5);
      const descWidth = g.descW - 14;
      const descHeight = description ? doc.heightOfString(description, { width: descWidth, lineGap: 1 }) : 0;
      const rowHeight = Math.max(21, descHeight + 8);
      ensureRoom(rowHeight);

      if (isMissing) {
        doc.rect(MARGIN, y, g.content, rowHeight).fill(C.amberSoft);
      } else if (day && day.kind !== 'work') {
        doc.rect(MARGIN, y, g.content, rowHeight).fill(C.card);
      } else if (day && day.kind === 'work' && description === 'No description') {
        doc.rect(MARGIN, y, g.content, rowHeight).fill(C.amberSoft);
      }

      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      doc.fillColor(C.muted).font('Helvetica-Bold').fontSize(8)
        .text(DAY_LABELS[weekday], g.xDay + 7, y + 5, { width: g.dayW });
      doc.fillColor(C.ink).font('Helvetica').fontSize(8.5)
        .text(formatDateNumeric(date), g.xDate + 4, y + 5, { width: g.dateW - 4 });

      if (description) {
        let color = C.ink;
        let font = 'Helvetica';
        if (isMissing) {
          color = C.amber;
          font = 'Helvetica-Oblique';
        } else if (day && day.kind !== 'work') {
          color = C.muted;
          font = 'Helvetica-Bold';
        } else if (description === 'No description') {
          color = C.amber;
          font = 'Helvetica-Oblique';
        }
        doc.fillColor(color).font(font).fontSize(8.5)
          .text(description, g.xDesc + 7, y + 5, { width: descWidth, lineGap: 1 });
      }

      if (day && day.kind === 'work') {
        doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8.5)
          .text(`${formatHours(day.total)} h`, g.xHours, y + 5, {
            width: g.hoursW - 7, align: 'right',
          });
      } else if (day) {
        doc.fillColor(C.muted).font('Helvetica').fontSize(8)
          .text('–', g.xHours, y + 5, { width: g.hoursW - 7, align: 'right' });
      } else if (isFuture) {
        // leave the future blank
      }

      doc.moveTo(MARGIN, y + rowHeight).lineTo(MARGIN + g.content, y + rowHeight)
        .lineWidth(0.5).strokeColor(C.line).stroke();
      y += rowHeight;
    }
  }

  ensureRoom(26);
  doc.rect(MARGIN, y, g.content, 24).fill(C.forest);
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(9)
    .text('TOTAL', MARGIN + 7, y + 8, { characterSpacing: 1.1 });
  doc.fillColor(C.white).font('Helvetica-Bold').fontSize(10.5)
    .text(`${formatHours(data.summary.loggedHours)} h`, g.xHours, y + 7, {
      width: g.hoursW - 7, align: 'right',
    });
  y += 24;
  return y;
}

function drawMonthSummary(doc, data, startY) {
  let y = startY + 18;
  if (y + 105 > doc.page.height - 55) {
    doc.addPage();
    y = 45;
  }
  const half = (doc.page.width - MARGIN * 2 - 26) / 2;
  const leftX = MARGIN;
  const rightX = MARGIN + half + 26;
  const s = data.summary;

  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(7.5)
    .text('MONTH SUMMARY', leftX, y, { characterSpacing: 1.2 });
  doc.moveTo(leftX, y + 11).lineTo(leftX + half, y + 11).lineWidth(0.7).strokeColor(C.line).stroke();

  const lines = [
    ['Hours logged', `${formatHours(s.loggedHours)} h`],
    ['Planned hours', `${formatHours(s.targetHours)} h`],
    ['Balance to date', `${signed(s.balanceToDate)} h`],
    ['Workdays logged', `${s.recordedWorkdays} of ${s.expectedWorkdays}`],
    ['Missing workdays', String(s.missingDays)],
    ['No description', String(s.undescribedDays)],
  ];
  let rowY = y + 18;
  for (const [label, value] of lines) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(8.5).text(label, leftX, rowY, { width: half - 80 });
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8.5)
      .text(value, leftX + half - 80, rowY, { width: 80, align: 'right' });
    rowY += 12;
  }

  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(7.5)
    .text('LEAVE', rightX, y, { characterSpacing: 1.2 });
  doc.moveTo(rightX, y + 11).lineTo(rightX + half, y + 11).lineWidth(0.7).strokeColor(C.line).stroke();
  const leaveLines = [
    ['Vacation', String(s.absences.vacation || 0)],
    ['Public holiday', String(s.absences.holiday || 0)],
    ['Sick leave', String(s.absences.sick || 0)],
    ['Day off', String(s.absences.off || 0)],
    ['Total leave days', String(s.leaveDays || 0)],
  ];
  rowY = y + 18;
  for (const [label, value] of leaveLines) {
    doc.fillColor(C.muted).font('Helvetica').fontSize(8.5).text(label, rightX, rowY, { width: half - 80 });
    doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(8.5)
      .text(value, rightX + half - 80, rowY, { width: 80, align: 'right' });
    rowY += 12;
  }
  doc.fillColor(C.muted).font('Helvetica').fontSize(7)
    .text('Leave counts only include configured working days. Weekend work is included in totals.', rightX, rowY + 1, {
      width: half, lineGap: 1,
    });
  return Math.max(rowY, y + 95);
}

function drawMonthReport(doc, data) {
  drawPageHeader(doc, data.workspace, {
    eyebrow: 'Monthly report',
    rightTitle: `${data.monthName} ${data.year}`,
    subtitle: `${data.workspace.profileName || 'Timesheet'} · ${data.workspace.company}`,
  });
  const afterKpi = drawKpis(doc, data);
  const afterTable = drawMonthTable(doc, data, afterKpi);
  drawMonthSummary(doc, data, afterTable);
}

function drawYearOverview(doc, db, year) {
  const data = buildYear(db, year);
  const settings = data.workspace;
  drawPageHeader(doc, settings, {
    eyebrow: 'Year overview',
    rightTitle: String(year),
    subtitle: `${settings.profileName || 'Timesheet'} · ${settings.company}`,
  });

  const content = doc.page.width - MARGIN * 2;
  const gap = 10;
  const boxW = (content - gap * 3) / 4;
  const s = data.totals;
  drawKpiBox(doc, MARGIN, 90, boxW, 52, {
    label: 'Hours logged', value: `${formatHours(s.loggedHours)} h`,
    sub: `of ${formatHours(s.targetHours)} h planned`, primary: true,
  });
  drawKpiBox(doc, MARGIN + boxW + gap, 90, boxW, 52, {
    label: 'Workdays', value: `${s.recordedWorkdays} / ${s.expectedWorkdays}`, sub: 'recorded',
  });
  drawKpiBox(doc, MARGIN + (boxW + gap) * 2, 90, boxW, 52, {
    label: 'Leave', value: String(s.leaveDays), sub: 'vacation, holiday and leave days',
  });
  drawKpiBox(doc, MARGIN + (boxW + gap) * 3, 90, boxW, 52, {
    label: 'To complete', value: String(s.missingDays + s.undescribedDays),
    sub: `${s.missingDays} missing · ${s.undescribedDays} no description`,
  });

  // Chart
  const chartX = MARGIN;
  const chartY = 165;
  const chartW = content;
  const chartH = 102;
  const chartBottom = chartY + chartH;
  const maxValue = Math.max(
    settings.dailyHours * 20,
    ...data.months.map((m) => Math.max(m.loggedHours, m.targetHours)),
  );
  doc.fillColor(C.forest).font('Helvetica-Bold').fontSize(7.5)
    .text('HOURS PER MONTH', chartX, chartY - 12, { characterSpacing: 1.2 });
  doc.moveTo(chartX, chartBottom).lineTo(chartX + chartW, chartBottom)
    .lineWidth(0.7).strokeColor(C.line).stroke();
  for (let i = 0; i <= 2; i += 1) {
    const gy = chartBottom - (chartH * i) / 2;
    doc.moveTo(chartX, gy).lineTo(chartX + chartW, gy).lineWidth(0.4).strokeColor('#EEEAE0').stroke();
    doc.fillColor(C.muted).font('Helvetica').fontSize(6)
      .text(`${Math.round((maxValue * i) / 2)} h`, chartX - 30, gy - 6, { width: 26, align: 'right' });
  }
  const slot = chartW / 12;
  data.months.forEach((month, index) => {
    const barW = Math.min(28, slot * 0.5);
    const x = chartX + slot * index + (slot - barW) / 2;
    const h = (month.loggedHours / maxValue) * chartH;
    const color = month.isFuture ? '#D8DED7' : month.isCurrent ? C.amber : C.forestSoft;
    doc.roundedRect(x, chartBottom - h, barW, h, 2).fill(color);
    if (month.loggedHours > 0) {
      doc.fillColor(C.ink).font('Helvetica-Bold').fontSize(6)
        .text(formatHours(month.loggedHours), x - 4, chartBottom - h - 10, { width: barW + 8, align: 'center' });
    }
    doc.fillColor(month.isFuture ? '#A9AFA6' : C.muted).font('Helvetica').fontSize(6.5)
      .text(MONTHS[index].slice(0, 3).toUpperCase(), x - 4, chartBottom + 4, {
        width: barW + 8, align: 'center',
      });
  });

  // Year table
  const tableY = 300;
  const cols = [0.17, 0.12, 0.12, 0.14, 0.14, 0.11, 0.1, 0.1];
  const headers = ['MONTH', 'HOURS', 'TARGET', 'BALANCE', 'WORKDAYS', 'LEAVE', 'MISSING', 'NO DESC.'];
  const widths = cols.map((fraction) => fraction * content);
  const xs = widths.map((_, index) => MARGIN + widths.slice(0, index).reduce((a, b) => a + b, 0));
  doc.rect(MARGIN, tableY, content, 19).fill(C.forest);
  headers.forEach((header, index) => {
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(6.5)
      .text(header, xs[index] + 5, tableY + 6, {
        width: widths[index] - 8,
        align: index === 0 ? 'left' : 'right',
        characterSpacing: 0.4,
      });
  });
  let rowY = tableY + 19;
  const rowH = 18;
  data.months.forEach((month) => {
    if (month.isCurrent) doc.rect(MARGIN, rowY, content, rowH).fill(C.mist);
    const values = [
      month.monthName,
      `${formatHours(month.loggedHours)} h`,
      `${formatHours(month.targetHours)} h`,
      `${signed(month.balanceToDate)} h`,
      `${month.recordedWorkdays} / ${month.expectedWorkdays}`,
      String(month.leaveDays),
      String(month.missingDays),
      String(month.undescribedDays),
    ];
    values.forEach((value, index) => {
      doc.fillColor(index === 0 ? C.ink : C.muted)
        .font(index === 0 ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(7.5)
        .text(value, xs[index] + 5, rowY + 5, {
          width: widths[index] - 8,
          align: index === 0 ? 'left' : 'right',
        });
    });
    doc.moveTo(MARGIN, rowY + rowH).lineTo(MARGIN + content, rowY + rowH)
      .lineWidth(0.4).strokeColor(C.line).stroke();
    rowY += rowH;
  });
  doc.rect(MARGIN, rowY, content, 21).fill(C.forest);
  const totals = [
    'TOTAL',
    `${formatHours(s.loggedHours)} h`,
    `${formatHours(s.targetHours)} h`,
    `${signed(s.balanceToDate)} h`,
    `${s.recordedWorkdays} / ${s.expectedWorkdays}`,
    String(s.leaveDays),
    String(s.missingDays),
    String(s.undescribedDays),
  ];
  totals.forEach((value, index) => {
    doc.fillColor(C.white).font('Helvetica-Bold').fontSize(7.5)
      .text(value, xs[index] + 5, rowY + 6, {
        width: widths[index] - 8,
        align: index === 0 ? 'left' : 'right',
      });
  });
  return data;
}

function drawFooter(doc, pageNumber, pageCount, settings) {
  const width = doc.page.width;
  const height = doc.page.height;
  const y = height - 30;
  // Footer text sits inside the bottom margin; temporarily disabling the
  // margin stops PDFKit from treating each footer text call as a new page.
  const previousBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.moveTo(MARGIN, y).lineTo(width - MARGIN, y).lineWidth(0.5).strokeColor(C.line).stroke();
  doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
    .text(`${settings.company || 'Uren'} · ${settings.profileName || 'Time registration'}`, MARGIN, y + 6, { width: 320, lineBreak: false });
  doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
    .text('Urenregistratie', width / 2 - 60, y + 6, { width: 120, align: 'center', lineBreak: false });
  doc.fillColor(C.muted).font('Helvetica').fontSize(6.5)
    .text(`Page ${pageNumber} of ${pageCount}`, width - MARGIN - 100, y + 6, { width: 100, align: 'right', lineBreak: false });
  doc.page.margins.bottom = previousBottom;
}

function finish(doc, settings) {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    drawFooter(doc, i + 1, range.count, settings);
  }
  doc.flushPages();
  doc.end();
}

function collect(doc) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

function createDocument() {
  return new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: MARGIN },
    bufferPages: true,
    info: { Creator: 'Uren', Producer: 'Uren' },
  });
}

export async function createMonthPdf(db, year, month) {
  const data = buildMonth(db, year, month);
  const doc = createDocument();
  doc.info.Title = `${data.workspace.company} — ${data.monthName} ${year}`;
  doc.info.Author = data.workspace.profileName || 'Uren';
  const bufferPromise = collect(doc);
  drawMonthReport(doc, data);
  finish(doc, data.workspace);
  return bufferPromise;
}

export async function createYearPdf(db, year) {
  const doc = createDocument();
  const data = buildYear(db, year);
  doc.info.Title = `${data.workspace.company} — ${year} overview`;
  doc.info.Author = data.workspace.profileName || 'Uren';
  const bufferPromise = collect(doc);
  drawYearOverview(doc, db, year);

  for (let month = 1; month <= 12; month += 1) {
    doc.addPage();
    const monthData = buildMonth(db, year, month);
    drawPageHeader(doc, monthData.workspace, {
      eyebrow: 'Monthly report',
      rightTitle: `${monthData.monthName} ${monthData.year}`,
      subtitle: `${monthData.workspace.profileName || 'Timesheet'} · ${monthData.workspace.company}`,
    });
    const afterKpi = drawKpis(doc, monthData);
    const afterTable = drawMonthTable(doc, monthData, afterKpi);
    drawMonthSummary(doc, monthData, afterTable);
  }

  finish(doc, data.workspace);
  return bufferPromise;
}
