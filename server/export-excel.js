import ExcelJS from 'exceljs';
import { MONTHS } from './dates.js';
import {
  buildMonth, buildYear, descriptionForDay, exportRowsForWeek, weekLabel,
} from './summary.js';

const COLORS = {
  forest: 'FF1D4A3A',
  forestSoft: 'FF2C6B52',
  band: 'FFE9F0E9',
  headerText: 'FFFFFFFF',
  ink: 'FF253029',
  muted: 'FF6E756C',
  line: 'FFDDD8CB',
  missing: 'FFFBF1DD',
  leave: 'FFF3F1EA',
  paper: 'FFFBFAF6',
  amber: 'FFB7791F',
};

const FONT = 'Calibri';
const NUM = '0.##" h"';
const DATE_FMT = 'dd-mm-yyyy';
const DAY_LABELS = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'];

function toExcelDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function estimateHeight(description) {
  if (!description) return 22;
  const lines = String(description).split('\n');
  const rows = lines.reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / 82)), 0);
  return Math.min(110, Math.max(22, rows * 14 + 8));
}

function styleBorder(cell) {
  cell.border = {
    bottom: { style: 'thin', color: { argb: COLORS.line } },
    left: { style: 'thin', color: { argb: COLORS.line } },
    right: { style: 'thin', color: { argb: COLORS.line } },
    top: { style: 'thin', color: { argb: COLORS.line } },
  };
}

function addMonthSheet(workbook, db, year, month) {
  const data = buildMonth(db, year, month);
  const settings = data.workspace;
  const sheet = workbook.addWorksheet(data.monthName);

  sheet.columns = [
    { key: 'day', width: 8 },
    { key: 'date', width: 14 },
    { key: 'description', width: 92 },
    { key: 'hours', width: 12 },
  ];
  sheet.properties.defaultRowHeight = 20;
  sheet.views = [{ state: 'frozen', ySplit: 4, activeCell: 'A5' }];

  // Title
  const title = sheet.getCell('A1');
  title.value = `${settings.company} — Urenregistratie`;
  title.font = { name: FONT, size: 18, bold: true, color: { argb: COLORS.forest } };
  sheet.mergeCells('A1:D1');
  sheet.getRow(1).height = 28;

  const subtitle = sheet.getCell('A2');
  subtitle.value = `${settings.profileName || 'Timesheet'}  ·  ${data.monthName} ${year}`;
  subtitle.font = { name: FONT, size: 11, color: { argb: COLORS.muted } };
  sheet.mergeCells('A2:D2');
  sheet.getRow(2).height = 18;

  // Header row
  const headerRow = 4;
  const headers = ['Day', 'DATE', 'Description', 'Hours'];
  headers.forEach((value, index) => {
    const cell = sheet.getCell(headerRow, index + 1);
    cell.value = value;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.forest } };
    cell.alignment = { vertical: 'middle', horizontal: index === 3 ? 'right' : 'left' };
    styleBorder(cell);
  });
  sheet.getRow(headerRow).height = 22;

  let rowNumber = headerRow + 1;
  const weekTotalCells = [];

  for (const week of data.weeks) {
    const weekRows = exportRowsForWeek(data, week);
    if (!weekRows.length) continue;

    // Week band
    const bandRow = rowNumber;
    sheet.mergeCells(bandRow, 1, bandRow, 3);
    const band = sheet.getCell(bandRow, 1);
    band.value = weekLabel(week).toUpperCase();
    band.font = { name: FONT, size: 9, bold: true, color: { argb: COLORS.forest } };
    band.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.band } };
    band.alignment = { vertical: 'middle' };
    const weekTotalCell = sheet.getCell(bandRow, 4);
    weekTotalCell.value = {
      formula: `SUM(D${bandRow + 1}:D${bandRow + weekRows.length})`,
    };
    weekTotalCell.numFmt = NUM;
    weekTotalCell.font = { name: FONT, size: 9, bold: true, color: { argb: COLORS.forest } };
    weekTotalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.band } };
    weekTotalCell.alignment = { vertical: 'middle', horizontal: 'right' };
    for (let c = 1; c <= 4; c += 1) styleBorder(sheet.getCell(bandRow, c));
    sheet.getRow(bandRow).height = 20;
    weekTotalCells.push(`D${bandRow}`);
    rowNumber += 1;

    for (const item of weekRows) {
      const { date, day, isWorkday } = item;
      const isMissing = isWorkday && date < data.today && !day;
      const isFuture = date > data.today;
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();

      const dayCell = sheet.getCell(rowNumber, 1);
      dayCell.value = DAY_LABELS[weekday];
      dayCell.font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.muted } };
      dayCell.alignment = { vertical: 'top' };

      const dateCell = sheet.getCell(rowNumber, 2);
      dateCell.value = toExcelDate(date);
      dateCell.numFmt = DATE_FMT;
      dateCell.font = { name: FONT, size: 10, color: { argb: COLORS.ink } };
      dateCell.alignment = { vertical: 'top' };

      const descriptionCell = sheet.getCell(rowNumber, 3);
      let description = '';
      if (day) {
        description = descriptionForDay(day);
        if (!description && day.kind === 'work') description = 'No description';
      } else if (isMissing) {
        description = 'Not logged';
      }
      descriptionCell.value = description;
      descriptionCell.font = {
        name: FONT,
        size: 10,
        color: { argb: isMissing ? COLORS.amber : COLORS.ink },
        italic: isMissing,
      };
      descriptionCell.alignment = { vertical: 'top', wrapText: true };

      const hoursCell = sheet.getCell(rowNumber, 4);
      if (day && day.kind === 'work') {
        hoursCell.value = day.total;
        hoursCell.numFmt = NUM;
      } else if (day) {
        hoursCell.value = null;
      } else if (isFuture) {
        hoursCell.value = null;
      }
      hoursCell.font = { name: FONT, size: 10, color: { argb: COLORS.ink } };
      hoursCell.alignment = { vertical: 'top', horizontal: 'right' };

      let fill = null;
      if (isMissing) fill = COLORS.missing;
      else if (day && day.kind !== 'work') fill = COLORS.leave;
      else if (day && day.kind === 'work' && !description) fill = COLORS.missing;
      if (fill) {
        for (let c = 1; c <= 4; c += 1) {
          sheet.getCell(rowNumber, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
        }
      }
      for (let c = 1; c <= 4; c += 1) styleBorder(sheet.getCell(rowNumber, c));
      sheet.getRow(rowNumber).height = estimateHeight(description);
      rowNumber += 1;
    }
  }

  // Grand total
  const totalRow = rowNumber;
  sheet.mergeCells(totalRow, 1, totalRow, 3);
  const totalLabel = sheet.getCell(totalRow, 1);
  totalLabel.value = 'TOTAL';
  totalLabel.font = { name: FONT, size: 11, bold: true, color: { argb: COLORS.headerText } };
  totalLabel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.forest } };
  totalLabel.alignment = { vertical: 'middle' };
  const totalValue = sheet.getCell(totalRow, 4);
  totalValue.value = weekTotalCells.length
    ? { formula: `SUM(${weekTotalCells.join(',')})` }
    : 0;
  totalValue.numFmt = NUM;
  totalValue.font = { name: FONT, size: 11, bold: true, color: { argb: COLORS.headerText } };
  totalValue.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.forest } };
  totalValue.alignment = { vertical: 'middle', horizontal: 'right' };
  for (let c = 1; c <= 4; c += 1) styleBorder(sheet.getCell(totalRow, c));
  sheet.getRow(totalRow).height = 24;

  // Summary block
  const summaryRows = [
    ['Hours logged', data.summary.loggedHours, NUM],
    ['Planned hours', data.summary.targetHours, NUM],
    ['Balance to date', data.summary.balanceToDate, '+0.##" h";-0.##" h";0" h"'],
    ['Workdays logged', `${data.summary.recordedWorkdays} of ${data.summary.expectedWorkdays}`, null],
    ['Days missing', data.summary.missingDays, null],
    ['Days without description', data.summary.undescribedDays, null],
    ['Vacation days', data.summary.absences.vacation, null],
    ['Public holidays', data.summary.absences.holiday, null],
    ['Sick days', data.summary.absences.sick, null],
    ['Days off', data.summary.absences.off, null],
    ['Daily target', settings.dailyHours, NUM],
  ];
  let summaryRow = totalRow + 2;
  sheet.mergeCells(summaryRow, 1, summaryRow, 4);
  const summaryTitle = sheet.getCell(summaryRow, 1);
  summaryTitle.value = 'MONTH SUMMARY';
  summaryTitle.font = { name: FONT, size: 9, bold: true, color: { argb: COLORS.forest } };
  summaryTitle.alignment = { vertical: 'middle' };
  sheet.getRow(summaryRow).height = 18;
  summaryRow += 1;
  for (const [label, value, numFmt] of summaryRows) {
    sheet.mergeCells(summaryRow, 1, summaryRow, 2);
    const labelCell = sheet.getCell(summaryRow, 1);
    labelCell.value = label;
    labelCell.font = { name: FONT, size: 10, color: { argb: COLORS.muted } };
    const valueCell = sheet.getCell(summaryRow, 3);
    valueCell.value = value;
    if (numFmt) valueCell.numFmt = numFmt;
    valueCell.font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.ink } };
    valueCell.alignment = { horizontal: 'left' };
    summaryRow += 1;
  }
  const generated = sheet.getCell(summaryRow + 1, 1);
  generated.value = `Generated ${new Date().toISOString().slice(0, 10)} · ${settings.company}`;
  generated.font = { name: FONT, size: 8, color: { argb: COLORS.muted } };
  sheet.mergeCells(summaryRow + 1, 1, summaryRow + 1, 3);

  // Print setup
  sheet.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true,
    printArea: `A1:D${summaryRow + 1}`,
    printTitlesRow: '4:4',
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter = {
    oddFooter: `&L${settings.company} — ${settings.profileName || 'Uren'}&C${data.monthName} ${year}&RPage &P of &N`,
  };

  return { sheet, data };
}

export async function createMonthWorkbook(db, year, month) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Uren';
  workbook.created = new Date();
  addMonthSheet(workbook, db, year, month);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export async function createYearWorkbook(db, year) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Uren';
  workbook.created = new Date();
  const data = buildYear(db, year);
  const settings = data.workspace;

  const overview = workbook.addWorksheet('Year overview');
  overview.columns = [
    { width: 18 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 12 }, { width: 12 }, { width: 16 },
  ];
  overview.getCell('A1').value = `${settings.company} — ${year} overview`;
  overview.getCell('A1').font = { name: FONT, size: 18, bold: true, color: { argb: COLORS.forest } };
  overview.mergeCells('A1:H1');
  overview.getRow(1).height = 28;
  overview.getCell('A2').value = `${settings.profileName || 'Timesheet'}  ·  ${year}`;
  overview.getCell('A2').font = { name: FONT, size: 11, color: { argb: COLORS.muted } };
  overview.mergeCells('A2:H2');

  const headers = ['Month', 'Hours', 'Target', 'Balance', 'Workdays', 'Leave', 'Missing', 'No description'];
  headers.forEach((value, index) => {
    const cell = overview.getCell(4, index + 1);
    cell.value = value;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.forest } };
    cell.alignment = { vertical: 'middle' };
    styleBorder(cell);
  });
  let row = 5;
  for (const month of data.months) {
    const values = [
      month.monthName,
      month.loggedHours,
      month.targetHours,
      month.balanceToDate,
      `${month.recordedWorkdays} / ${month.expectedWorkdays}`,
      month.leaveDays,
      month.missingDays,
      month.undescribedDays,
    ];
    values.forEach((value, index) => {
      const cell = overview.getCell(row, index + 1);
      cell.value = value;
      cell.font = { name: FONT, size: 10, color: { argb: COLORS.ink } };
      styleBorder(cell);
      if (index === 1 || index === 2) cell.numFmt = NUM;
      if (index === 3) cell.numFmt = '+0.##" h";-0.##" h";0" h"';
    });
    if (month.isCurrent) {
      for (let c = 1; c <= 8; c += 1) {
        overview.getCell(row, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.band } };
      }
    }
    if (month.isFuture) {
      for (let c = 1; c <= 8; c += 1) {
        overview.getCell(row, c).font = { name: FONT, size: 10, color: { argb: COLORS.muted } };
      }
    }
    row += 1;
  }

  const totalValues = [
    'TOTAL',
    data.totals.loggedHours,
    data.totals.targetHours,
    data.totals.balanceToDate,
    `${data.totals.recordedWorkdays} / ${data.totals.expectedWorkdays}`,
    data.totals.leaveDays,
    data.totals.missingDays,
    data.totals.undescribedDays,
  ];
  totalValues.forEach((value, index) => {
    const cell = overview.getCell(row, index + 1);
    cell.value = value;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: COLORS.headerText } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.forest } };
    styleBorder(cell);
    if (index === 1 || index === 2) cell.numFmt = NUM;
    if (index === 3) cell.numFmt = '+0.##" h";-0.##" h";0" h"';
  });
  overview.getRow(row).height = 22;

  overview.pageSetup = {
    paperSize: 9,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    printArea: `A1:H${row}`,
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };

  for (let month = 1; month <= 12; month += 1) {
    addMonthSheet(workbook, db, year, month);
  }
  workbook.views = [{ activeTab: 0 }];
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function safeFilePart(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function monthFileBase(settings, year, month) {
  const company = safeFilePart(settings.company) || 'Uren';
  const profile = safeFilePart(settings.profileName);
  return [company, 'uren', profile, MONTHS[month - 1], year].filter(Boolean).join(' ');
}

export function yearFileBase(settings, year) {
  const company = safeFilePart(settings.company) || 'Uren';
  const profile = safeFilePart(settings.profileName);
  return [company, 'uren', profile, year].filter(Boolean).join(' ');
}

