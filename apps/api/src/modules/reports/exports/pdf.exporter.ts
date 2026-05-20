import { Injectable, Logger } from '@nestjs/common';
import { ReportColumn, ReportResult } from '../dto/reports.dto';

// Puppeteer is loaded dynamically at runtime (see launch()) so the module
// compiles without type definitions installed. Browser is treated as an opaque
// handle with the minimal surface we use here.
interface PuppeteerBrowser {
  newPage(): Promise<PuppeteerPage>;
  close(): Promise<void>;
  connected: boolean;
}
interface PuppeteerPage {
  setContent(html: string, opts?: { waitUntil?: string }): Promise<void>;
  pdf(opts: Record<string, unknown>): Promise<Uint8Array>;
  close(): Promise<void>;
}

/**
 * Server-side PDF rendering via Puppeteer headless Chromium. The browser is
 * lazily launched and reused across requests to avoid per-call startup cost.
 *
 * Puppeteer is loaded dynamically so the module compiles even if the dependency
 * isn't installed in dev environments — failures surface at export time only.
 */
@Injectable()
export class PdfExporter {
  private readonly logger = new Logger(PdfExporter.name);
  private browser: PuppeteerBrowser | null = null;
  private launching: Promise<PuppeteerBrowser> | null = null;

  async export(report: ReportResult): Promise<Buffer> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(this.renderHtml(report), { waitUntil: 'networkidle0' });
      const buf = await page.pdf({
        format: 'A4',
        landscape: report.columns.length > 6,
        margin: { top: '15mm', bottom: '15mm', left: '12mm', right: '12mm' },
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `
          <div style="font-size:9px;color:#6B7280;width:100%;padding:0 12mm;display:flex;justify-content:space-between;">
            <span>${escapeHtml(report.title)}</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>
        `,
      });
      return Buffer.from(buf);
    } finally {
      await page.close();
    }
  }

  private async getBrowser(): Promise<PuppeteerBrowser> {
    if (this.browser && this.browser.connected) return this.browser;
    if (this.launching) return this.launching;
    this.launching = this.launch();
    try {
      this.browser = await this.launching;
      return this.browser;
    } finally {
      this.launching = null;
    }
  }

  private async launch(): Promise<PuppeteerBrowser> {
    this.logger.log('Launching headless Chromium for PDF export');
    // Dynamic import keeps the TS build happy when puppeteer isn't installed.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import('puppeteer').catch(() => {
      throw new Error('PDF export requires the "puppeteer" package. Install it: npm i puppeteer');
    });
    const puppeteer = mod.default ?? mod;
    return puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  // ---------------------------------------------------------------------------
  // HTML rendering — light-themed, print-friendly
  // ---------------------------------------------------------------------------

  renderHtml(report: ReportResult): string {
    const summary = report.summary && Object.keys(report.summary).length > 0
      ? `<div class="summary">${
          Object.entries(report.summary)
            .map(([k, v]) => `<div class="summary-item"><span>${escapeHtml(k)}</span><strong>${escapeHtml(String(v))}</strong></div>`)
            .join('')
        }</div>`
      : '';

    const filters = report.filters && Object.keys(report.filters).length > 0
      ? `<div class="filters">Filters: ${
          Object.entries(report.filters).map(([k, v]) => `<span><b>${escapeHtml(k)}</b>: ${escapeHtml(String(v))}</span>`).join(' • ')
        }</div>`
      : '';

    const body = report.groups && report.groups.length > 0
      ? report.groups.map((g) => `
        <h2 class="group">${escapeHtml(g.label)} <span class="muted">(${g.rows.length})</span></h2>
        ${this.tableHtml(report.columns, g.rows)}
      `).join('')
      : this.tableHtml(report.columns, report.rows);

    return `<!doctype html>
      <html><head><meta charset="utf-8"><title>${escapeHtml(report.title)}</title>
      <style>
        * { box-sizing: border-box; }
        body { font: 11px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#111827; padding: 0; margin: 0; }
        h1 { margin: 0 0 4px; font-size: 20px; }
        h2.group { margin: 18px 0 6px; font-size: 13px; color:#1F2937; border-bottom:2px solid #00D4AA; padding-bottom: 3px; }
        .muted { color:#9CA3AF; font-weight:normal; }
        .meta { color:#6B7280; font-size: 10px; margin-bottom: 10px; }
        .summary { display:flex; flex-wrap:wrap; gap: 8px; margin: 8px 0 14px; }
        .summary-item { background:#F3F4F6; border-radius:6px; padding:6px 10px; font-size:10px; display:flex; flex-direction:column; }
        .summary-item span { color:#6B7280; text-transform: uppercase; letter-spacing: .04em; font-size: 9px; }
        .summary-item strong { font-size: 13px; color:#111827; }
        .filters { font-size:10px; color:#374151; margin-bottom: 10px; padding:6px 8px; background:#F9FAFB; border-radius:4px; }
        table { width:100%; border-collapse: collapse; margin-top: 6px; }
        th { text-align:left; background:#1F2937; color:#fff; font-weight:600; padding:6px 8px; font-size:10px; }
        td { padding:5px 8px; border-bottom:1px solid #E5E7EB; vertical-align: top; font-size:10px; }
        tr:nth-child(even) td { background:#F9FAFB; }
        .pill { display:inline-block; padding:2px 8px; border-radius:10px; background:#E5E7EB; color:#1F2937; font-size:9px; font-weight:600; }
      </style></head>
      <body>
        <h1>${escapeHtml(report.title)}</h1>
        <div class="meta">Generated ${new Date(report.generatedAt).toLocaleString()} • ${report.total} record(s)</div>
        ${filters}
        ${summary}
        ${body}
      </body></html>`;
  }

  private tableHtml(columns: ReportColumn[], rows: Record<string, unknown>[]): string {
    const head = columns.map((c) => `<th>${escapeHtml(c.label)}</th>`).join('');
    const body = rows.map((r) => {
      const tds = columns.map((c) => {
        const v = r[c.key];
        const text = v === null || v === undefined ? '' : String(v);
        if (c.format === 'pill' && text) {
          return `<td><span class="pill">${escapeHtml(text)}</span></td>`;
        }
        return `<td>${escapeHtml(text)}</td>`;
      }).join('');
      return `<tr>${tds}</tr>`;
    }).join('');
    return `<table><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${columns.length}" style="text-align:center;color:#9CA3AF;padding:18px;">No data</td></tr>`}</tbody></table>`;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
