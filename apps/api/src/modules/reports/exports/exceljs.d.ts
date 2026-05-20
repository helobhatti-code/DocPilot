/**
 * Minimal type stub for exceljs.
 *
 * This shim keeps the project's `tsc` happy in environments where the
 * dependency hasn't been installed yet (e.g. fresh checkouts before
 * `npm install`). Once exceljs is installed its bundled `.d.ts` takes
 * precedence — this file becomes a no-op fallback.
 */
declare module 'exceljs' {
  export type CellValue =
    | string
    | number
    | Date
    | boolean
    | null
    | undefined
    | { text?: string; result?: unknown };

  export interface Cell {
    value: CellValue;
    font?: Record<string, unknown>;
    fill?: Record<string, unknown>;
    alignment?: Record<string, unknown>;
    numFmt?: string;
    border?: Record<string, unknown>;
  }

  export interface Column {
    header?: string | string[];
    key?: string;
    width?: number;
  }

  export interface Row {
    number: number;
    hasValues: boolean;
    font?: Record<string, unknown>;
    fill?: Record<string, unknown>;
    getCell(col: number): Cell;
    eachCell(
      options: { includeEmpty?: boolean } | ((cell: Cell, col: number) => void),
      iter?: (cell: Cell, col: number) => void,
    ): void;
  }

  export interface Fill {
    type: string;
    pattern?: string;
    fgColor?: { argb: string };
    bgColor?: { argb: string };
  }

  export interface Worksheet {
    rowCount: number;
    columns: Column[];
    getCell(row: number, col: number): Cell;
    getColumn(col: number): Column;
    mergeCells(r1: number, c1: number, r2: number, c2: number): void;
    addRow(row: unknown[] | Record<string, unknown>): Row;
    getRow(row: number): Row;
  }

  export interface XlsxWriter {
    writeBuffer(): Promise<ArrayBuffer | Buffer>;
    load(buffer: ArrayBuffer | Uint8Array | Buffer): Promise<unknown>;
  }

  export class Workbook {
    creator: string;
    created: Date;
    worksheets: Worksheet[];
    addWorksheet(name: string): Worksheet;
    xlsx: XlsxWriter;
  }
}
