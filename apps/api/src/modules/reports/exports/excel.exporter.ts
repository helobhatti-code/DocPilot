import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ReportColumn, ReportResult } from '../dto/reports.dto';

@Injectable()
export class ExcelExporter {
  async export(report: ReportResult): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'DocPilot';
    wb.created = new Date();

    // Multi-sheet reports (e.g. master-expiry) get one worksheet per sheet entry.
    if (report.sheets && report.sheets.length > 0) {
      return this.exportMultiSheet(wb, report);
    }

    const sheet = wb.addWorksheet(report.title.slice(0, 31));

    // Title row
    sheet.mergeCells(1, 1, 1, Math.max(report.columns.length, 1));
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = report.title;
    titleCell.font = { bold: true, size: 16, color: { argb: 'FF1F2937' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

    sheet.mergeCells(2, 1, 2, Math.max(report.columns.length, 1));
    const metaCell = sheet.getCell(2, 1);
    metaCell.value = `Generated: ${new Date(report.generatedAt).toLocaleString()}  •  Rows: ${report.total}`;
    metaCell.font = { italic: true, size: 10, color: { argb: 'FF6B7280' } };

    let cursor = 4;

    if (report.summary && Object.keys(report.summary).length > 0) {
      sheet.getCell(cursor, 1).value = 'Summary';
      sheet.getCell(cursor, 1).font = { bold: true };
      cursor += 1;
      for (const [k, v] of Object.entries(report.summary)) {
        sheet.getCell(cursor, 1).value = k;
        sheet.getCell(cursor, 2).value = v as ExcelJS.CellValue;
        cursor += 1;
      }
      cursor += 1;
    }

    if (report.groups && report.groups.length > 0) {
      for (const g of report.groups) {
        sheet.mergeCells(cursor, 1, cursor, report.columns.length);
        const gc = sheet.getCell(cursor, 1);
        gc.value = `${g.label} (${g.rows.length})`;
        gc.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
        gc.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF00D4AA' },
        };
        cursor += 1;
        cursor = this.writeTable(sheet, cursor, report.columns, g.rows);
        cursor += 1;
      }
    } else {
      cursor = this.writeTable(sheet, cursor, report.columns, report.rows);
    }

    return (await wb.xlsx.writeBuffer()) as Buffer;
  }

  private async exportMultiSheet(wb: ExcelJS.Workbook, report: ReportResult): Promise<Buffer> {
    // Cover sheet with title + summary
    const cover = wb.addWorksheet('Summary');
    cover.getCell(1, 1).value = report.title;
    cover.getCell(1, 1).font  = { bold: true, size: 16 };
    cover.getCell(2, 1).value = `Generated: ${new Date(report.generatedAt).toLocaleString()}  •  Rows: ${report.total}`;
    cover.getCell(2, 1).font  = { italic: true, size: 10, color: { argb: 'FF6B7280' } };
    cover.getColumn(1).width = 40;

    if (report.summary) {
      let row = 4;
      for (const [k, v] of Object.entries(report.summary)) {
        cover.getCell(row, 1).value = k;
        cover.getCell(row, 2).value = v as ExcelJS.CellValue;
        row++;
      }
    }

    for (const s of report.sheets ?? []) {
      const ws = wb.addWorksheet(s.name.slice(0, 31));
      this.writeTable(ws, 1, s.columns, s.rows);
    }

    return (await wb.xlsx.writeBuffer()) as Buffer;
  }

  private writeTable(
    sheet: ExcelJS.Worksheet,
    startRow: number,
    columns: ReportColumn[],
    rows: Record<string, unknown>[],
  ): number {
    columns.forEach((c, i) => {
      const cell = sheet.getCell(startRow, i + 1);
      cell.value = c.label;
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F2937' },
      };
      cell.alignment = { vertical: 'middle' };
      sheet.getColumn(i + 1).width = c.width ?? 18;
    });

    let row = startRow + 1;
    for (const r of rows) {
      columns.forEach((c, i) => {
        const cell = sheet.getCell(row, i + 1);
        const v = r[c.key];
        cell.value = (v ?? '') as ExcelJS.CellValue;
        if (c.format === 'date' && v) {
          const d = new Date(String(v));
          if (!Number.isNaN(d.getTime())) {
            cell.value = d;
            cell.numFmt = 'yyyy-mm-dd';
          }
        }
        if (c.format === 'datetime' && v) {
          const d = new Date(String(v));
          if (!Number.isNaN(d.getTime())) {
            cell.value = d;
            cell.numFmt = 'yyyy-mm-dd hh:mm:ss';
          }
        }
        if (c.format === 'number' && typeof v === 'number') {
          cell.numFmt = '0';
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } },
        };
      });
      row += 1;
    }
    return row;
  }
}
