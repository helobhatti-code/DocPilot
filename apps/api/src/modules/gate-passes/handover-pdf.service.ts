import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { nanoid } from 'nanoid';
import * as path from 'path';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { AuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/common/prisma/prisma.service';
import { AppConfig } from '@/config/configuration';
import { HandoverQrService } from './handover-qr.service';

interface PassForHandover {
  id: string;
  passNumber: string;
  airport: string;
  issueDate: Date;
  expiryDate: Date;
  organization?: string | null;
  department?: string | null;
  staff: {
    id: string;
    name: string;
    nationality?: string | null;
    designation?: string | null;
  } | null;
  zones: { zoneCode: string }[];
}

const TERMS = [
  'Pass must be worn at all times while on duty within authorized zones.',
  'Present pass at all checkpoints upon request by airport security.',
  'Holder may only access the zones explicitly listed below.',
  'Loss or theft of the pass must be reported to the company immediately.',
  'Pass must be returned to the company upon termination, resignation, or expiry.',
];

@Injectable()
export class HandoverPdfService {
  private readonly logger = new Logger(HandoverPdfService.name);
  private readonly uploadDir: string;
  private readonly publicBaseUrl: string;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly handoverQr: HandoverQrService,
  ) {
    this.uploadDir = path.resolve(config.get('uploadDir', { infer: true }));
    this.publicBaseUrl = config.get('publicBaseUrl', { infer: true });
  }

  /**
   * Generate and persist the unsigned handover PDF for a pass. Returns the
   * public URL plus metadata needed by the caller to write a Document row.
   */
  async generate(
    actor: AuthUser,
    pass: PassForHandover,
  ): Promise<{ fileUrl: string; fileName: string; fileSizeBytes: number }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: actor.tenantId },
      select: { name: true, logoUrl: true },
    });
    if (!tenant) throw new Error('Tenant not found while generating handover');

    const pdf = await PDFDocument.create();
    pdf.setTitle(`Gate Pass Handover — ${pass.passNumber}`);
    pdf.setAuthor(tenant.name);
    pdf.setCreator('DocPilot');
    // ── Embed verification token in PDF METADATA ──────────────────────
    // PDF metadata fields are plain text in the PDF Info dictionary —
    // 100% reliable for read-back via pdf-lib, no compression issues.
    const verificationToken = this.handoverQr.buildToken(pass.id, pass.passNumber);
    pdf.setSubject(verificationToken);
    pdf.setKeywords([verificationToken]);
    pdf.setProducer(`DocPilot | ${verificationToken}`);

    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const page = pdf.addPage([595.28, 841.89]); // A4 portrait
    const { width, height } = page.getSize();

    const margin = 48;
    let cursorY = height - margin;

    // ----- Header / company branding ---------------------------------------

    if (tenant.logoUrl) {
      const logoBytes = await this.tryLoadLogo(tenant.logoUrl);
      if (logoBytes) {
        try {
          const img = tenant.logoUrl.toLowerCase().endsWith('.png')
            ? await pdf.embedPng(logoBytes)
            : await pdf.embedJpg(logoBytes);
          const dims = img.scaleToFit(120, 50);
          page.drawImage(img, {
            x: margin,
            y: cursorY - dims.height,
            width: dims.width,
            height: dims.height,
          });
        } catch (e) {
          this.logger.warn(`Logo embed failed: ${(e as Error).message}`);
        }
      }
    }

    page.drawText(tenant.name, {
      x: margin + 130,
      y: cursorY - 18,
      size: 16,
      font: helvBold,
      color: rgb(0.1, 0.1, 0.12),
    });
    page.drawText('Gate Pass Handover Acknowledgement', {
      x: margin + 130,
      y: cursorY - 36,
      size: 11,
      font: helv,
      color: rgb(0.4, 0.4, 0.45),
    });

    cursorY -= 80;
    drawDivider(page, margin, cursorY, width - margin);
    cursorY -= 20;

    // ----- Date + reference -----------------------------------------------

    const dateStr = new Date().toISOString().slice(0, 10);
    drawLabel(page, helv, helvBold, margin, cursorY, 'Date of handover', dateStr);
    drawLabel(page, helv, helvBold, width / 2, cursorY, 'Pass number', pass.passNumber);
    cursorY -= 30;

    // ----- Staff section --------------------------------------------------

    cursorY = section(page, helvBold, margin, cursorY, 'Staff Member');
    drawLabel(page, helv, helvBold, margin, cursorY, 'Name', pass.staff?.name ?? '—');
    drawLabel(page, helv, helvBold, width / 2, cursorY, 'Nationality', pass.staff?.nationality ?? '—');
    cursorY -= 18;
    drawLabel(page, helv, helvBold, margin, cursorY, 'Designation', pass.staff?.designation ?? '—');
    drawLabel(page, helv, helvBold, width / 2, cursorY, 'Pass number', pass.passNumber);
    cursorY -= 30;

    // ----- Pass section ---------------------------------------------------

    cursorY = section(page, helvBold, margin, cursorY, 'Gate Pass Details');
    drawLabel(page, helv, helvBold, margin, cursorY, 'Issuing authority', pass.airport);
    drawLabel(page, helv, helvBold, width / 2, cursorY, 'Issue date', formatDate(pass.issueDate));
    cursorY -= 18;
    drawLabel(page, helv, helvBold, margin, cursorY, 'Expiry date', formatDate(pass.expiryDate));
    drawLabel(page, helv, helvBold, width / 2, cursorY, 'Department', pass.department ?? '—');
    cursorY -= 30;

    // ----- Authorized zones ----------------------------------------------

    cursorY = section(page, helvBold, margin, cursorY, 'Authorized Access Zones');
    if (pass.zones.length === 0) {
      page.drawText('No zones recorded.', {
        x: margin,
        y: cursorY,
        size: 10,
        font: helv,
        color: rgb(0.5, 0.5, 0.5),
      });
      cursorY -= 18;
    } else {
      const lines = chunk(pass.zones.map((z) => `${z.zoneCode} — ${zoneLabel(z.zoneCode)}`), 2);
      for (const row of lines) {
        for (let i = 0; i < row.length; i++) {
          page.drawText(`• ${row[i]}`, {
            x: margin + i * (width / 2 - margin),
            y: cursorY,
            size: 10,
            font: helv,
            color: rgb(0.15, 0.15, 0.18),
          });
        }
        cursorY -= 16;
      }
      cursorY -= 6;
    }

    // ----- Terms ---------------------------------------------------------

    cursorY = section(page, helvBold, margin, cursorY, 'Terms & Conditions');
    for (let i = 0; i < TERMS.length; i++) {
      const wrapped = wrapText(`${i + 1}. ${TERMS[i]}`, helv, 10, width - 2 * margin);
      for (const line of wrapped) {
        page.drawText(line, {
          x: margin,
          y: cursorY,
          size: 10,
          font: helv,
          color: rgb(0.2, 0.2, 0.22),
        });
        cursorY -= 14;
      }
      cursorY -= 2;
    }

    cursorY -= 10;

    // ----- Signature blocks (FULL WIDTH) --------------------------------
    // Both signature blocks span half the page each — plenty of room for
    // long tenant names like "IP CARE Technologies LLC".

    cursorY = section(page, helvBold, margin, cursorY, 'Signatures');

    const sigGap        = 30;
    const sigBlockWidth = (width - 2 * margin - sigGap) / 2;

    drawSignatureBlock(page, helv, helvBold, margin, cursorY, sigBlockWidth, 'Staff Member (Receiver)', pass.staff?.name ?? '');
    drawSignatureBlock(page, helv, helvBold, margin + sigBlockWidth + sigGap, cursorY, sigBlockWidth, 'Company Representative (Issuer)', tenant.name);

    // Move cursor below signatures (~110px tall)
    cursorY -= 120;

    // ----- Verification QR Code (centered, dedicated row) ---------------
    try {
      const qrPngBytes = await this.handoverQr.generateQrPng(verificationToken, 300);
      const qrImage = await pdf.embedPng(qrPngBytes);
      const qrSize = 110;
      const qrX    = (width - qrSize) / 2;   // centered horizontally
      const qrY    = cursorY - qrSize;

      // Light separator above QR section
      page.drawLine({
        start: { x: margin, y: cursorY + 8 },
        end:   { x: width - margin, y: cursorY + 8 },
        thickness: 0.5,
        color: rgb(0.85, 0.85, 0.88),
      });

      page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

      page.drawText('Verification QR Code', {
        x: (width - helvBold.widthOfTextAtSize('Verification QR Code', 10)) / 2,
        y: cursorY - 6,
        size: 10,
        font: helvBold,
        color: rgb(0.2, 0.2, 0.25),
      });

      const refText = `Ref: ${pass.passNumber}`;
      page.drawText(refText, {
        x: (width - helvBold.widthOfTextAtSize(refText, 9)) / 2,
        y: qrY - 14,
        size: 9,
        font: helvBold,
        color: rgb(0.2, 0.2, 0.25),
      });

      const captionText = 'Scan to verify authenticity • Upload this document as the signed handover copy';
      page.drawText(captionText, {
        x: (width - helv.widthOfTextAtSize(captionText, 7)) / 2,
        y: qrY - 26,
        size: 7,
        font: helv,
        color: rgb(0.5, 0.5, 0.55),
      });

      // Visible-text fallback token (tiny gray) in case metadata is stripped
      page.drawText(verificationToken, {
        x: margin,
        y: 22,
        size: 4,
        font: helv,
        color: rgb(0.75, 0.75, 0.78),
      });
    } catch (qrErr) {
      this.logger.warn(`QR embed failed (non-fatal): ${(qrErr as Error).message}`);
    }

    // ----- Footer --------------------------------------------------------

    page.drawText(
      `Generated by DocPilot • ${new Date().toISOString().slice(0, 10)} • ${tenant.name}`,
      {
        x: margin,
        y: 10,
        size: 7,
        font: helv,
        color: rgb(0.55, 0.55, 0.6),
      },
    );

    const bytes = await pdf.save();
    return this.persist(actor.tenantId, pass.passNumber, Buffer.from(bytes));
  }

  // ---- internal -----------------------------------------------------------

  private async persist(
    tenantId: string,
    passNumber: string,
    bytes: Buffer,
  ): Promise<{ fileUrl: string; fileName: string; fileSizeBytes: number }> {
    const dir = path.join(this.uploadDir, tenantId, 'handovers');
    await fs.mkdir(dir, { recursive: true });
    const fileName = `handover-${passNumber}-${nanoid(8)}.pdf`;
    const fullPath = path.join(dir, fileName);
    await fs.writeFile(fullPath, bytes);

    return {
      // Store as relative path — frontend resolveFileUrl() prefixes the API base URL.
      // This avoids hardcoding PUBLIC_BASE_URL (which defaults to localhost:3000).
      fileUrl: `/uploads/${tenantId}/handovers/${fileName}`,
      fileName,
      fileSizeBytes: bytes.length,
    };
  }

  private async tryLoadLogo(logoUrl: string): Promise<Buffer | null> {
    try {
      // Support both relative (/uploads/...) and absolute (http://...) paths
      let relative: string | null = null;
      if (logoUrl.startsWith('/uploads/')) {
        relative = logoUrl.slice('/uploads/'.length);
      } else {
        const localPrefix = `${this.publicBaseUrl}/uploads/`;
        if (logoUrl.startsWith(localPrefix)) relative = logoUrl.slice(localPrefix.length);
      }
      if (relative) {
        const full = path.join(this.uploadDir, relative);
        return await fs.readFile(full);
      }
      return null;
    } catch (e) {
      this.logger.debug(`Logo load skipped: ${(e as Error).message}`);
      return null;
    }
  }
}

// --------------------------- pure helpers ----------------------------------

function section(page: PDFPage, font: PDFFont, x: number, y: number, label: string): number {
  page.drawText(label, {
    x,
    y,
    size: 11,
    font,
    color: rgb(0.07, 0.55, 0.45),
  });
  drawDivider(page, x, y - 4, page.getWidth() - x);
  return y - 22;
}

function drawDivider(page: PDFPage, x: number, y: number, x2: number) {
  page.drawLine({
    start: { x, y },
    end: { x: x2, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.88),
  });
}

function drawLabel(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  y: number,
  label: string,
  value: string,
) {
  page.drawText(label, {
    x,
    y: y + 12,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.55),
  });
  page.drawText(value || '—', {
    x,
    y,
    size: 11,
    font: bold,
    color: rgb(0.1, 0.1, 0.12),
  });
}

function drawSignatureBlock(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  x: number,
  y: number,
  width: number,
  role: string,
  name: string,
) {
  page.drawText(role, {
    x,
    y: y,
    size: 10,
    font: bold,
    color: rgb(0.1, 0.1, 0.12),
  });
  page.drawLine({
    start: { x, y: y - 50 },
    end: { x: x + width, y: y - 50 },
    thickness: 0.7,
    color: rgb(0.3, 0.3, 0.35),
  });
  page.drawText('Signature', {
    x,
    y: y - 64,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.55),
  });
  page.drawText(name || '—', {
    x: x + 80,
    y: y - 64,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.45),
  });
  page.drawLine({
    start: { x, y: y - 86 },
    end: { x: x + width, y: y - 86 },
    thickness: 0.7,
    color: rgb(0.3, 0.3, 0.35),
  });
  page.drawText('Date', {
    x,
    y: y - 100,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.55),
  });
}

function formatDate(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const ZONE_LABELS: Record<string, string> = {
  AP: 'Apron',
  AR: 'Arrivals',
  CO: 'Concourse',
  TT: 'Transit Terminal',
  AT: 'Air Traffic',
  BS: 'Baggage Sortation',
  TW: 'Tower',
  PX: 'Passenger Exit',
  CT: 'Cargo Terminal',
  GW: 'Gateway',
  EYE: 'Surveillance',
  ALL_ZONES: 'All Zones',
  BHS: 'Baggage Handling System',
  CBP: 'Customs & Border',
  BHS_CBP: 'BHS / CBP',
  PA: 'Passenger Area',
  FF: 'Fire & Fuel',
  TL: 'Technical Landside',
};
function zoneLabel(code: string): string {
  return ZONE_LABELS[code] ?? code;
}
