/**
 * HandoverQrService
 *
 * Token format:  CREWPASS-HANDOVER|{passId}|{passNumber}
 *
 * Generation: qrcode → PNG buffer (embedded in PDF by HandoverPdfService)
 * Verification:
 *   - JPEG/PNG upload → sharp raw-pixel decode → jsQR
 *   - PDF upload      → pdf-lib extracts embedded image bytes → jsQR
 */
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sharp = require('sharp') as (input: Buffer) => any;

// jsqr exports via `export =` (CommonJS style) — must be required at runtime
// eslint-disable-next-line @typescript-eslint/no-var-requires
const jsQR = require('jsqr') as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: string },
) => { data: string } | null;

// qrcode likewise uses `export =`
// eslint-disable-next-line @typescript-eslint/no-var-requires
const QRCode = require('qrcode') as {
  toDataURL: (text: string, options?: object) => Promise<string>;
};

const PREFIX = 'CREWPASS-HANDOVER';

@Injectable()
export class HandoverQrService {
  private readonly logger = new Logger(HandoverQrService.name);

  // ── Token helpers ────────────────────────────────────────────────────────

  buildToken(passId: string, passNumber: string): string {
    return `${PREFIX}|${passId}|${passNumber}`;
  }

  parseToken(token: string): { passId: string; passNumber: string } | null {
    const parts = token.split('|');
    if (parts.length !== 3 || parts[0] !== PREFIX) return null;
    return { passId: parts[1], passNumber: parts[2] };
  }

  // ── QR generation ────────────────────────────────────────────────────────

  async generateQrPng(token: string, sizePx = 200): Promise<Buffer> {
    const dataUrl: string = await QRCode.toDataURL(token, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: sizePx,
      color: { dark: '#000000', light: '#FFFFFF' },
    });
    const base64 = dataUrl.split(',')[1];
    if (!base64) throw new Error('qrcode produced empty data URL');
    return Buffer.from(base64, 'base64');
  }

  // ── QR verification ──────────────────────────────────────────────────────

  async readQrFromFile(buffer: Buffer, mimeType: string): Promise<string> {
    if (mimeType === 'application/pdf') {
      // ── PRIMARY: pdf-lib metadata (rock-solid, plain-text Info dict) ──
      const fromMeta = await this.extractTokenFromPdfMetadata(buffer);
      if (fromMeta) return fromMeta;

      // ── FALLBACK: pdf-parse text extraction (works for text PDFs) ──
      const fromText = await this.extractTokenFromPdfText(buffer);
      if (fromText) return fromText;
    }

    // ── LAST FALLBACK: pixel-level QR decode (JPEG uploads, scanned PDFs)
    let pixelData: { data: Uint8ClampedArray; width: number; height: number } | null = null;
    if (mimeType === 'application/pdf') {
      pixelData = await this.extractPixelsFromPdf(buffer);
    } else {
      pixelData = await this.extractPixelsFromImage(buffer);
    }

    if (!pixelData) {
      throw new BadRequestException(
        'Could not read the document. Please upload a clear scan — the QR code must be fully visible.',
      );
    }

    const result = jsQR(pixelData.data, pixelData.width, pixelData.height, {
      inversionAttempts: 'attemptBoth',
    });

    if (!result?.data) {
      throw new BadRequestException(
        'No valid QR code found in the uploaded document. ' +
        'Make sure you are uploading the signed copy of the DocPilot handover document.',
      );
    }

    return result.data;
  }

  /**
   * Read token from PDF metadata using pdf-lib.
   * The token is embedded in 3 places during generation: Subject, Keywords,
   * Producer — checked in order. PDF metadata is plain text in the Info dict
   * and survives any pdf-lib processing — this is the most reliable path.
   */
  private async extractTokenFromPdfMetadata(buffer: Buffer): Promise<string | null> {
    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });

      // Try Subject
      const subject = pdfDoc.getSubject();
      if (typeof subject === 'string' && subject.startsWith(PREFIX)) {
        this.logger.log(`Token found in PDF Subject metadata`);
        return subject;
      }

      // Try Keywords (array or string)
      const keywords = pdfDoc.getKeywords();
      if (keywords) {
        const kwArr = Array.isArray(keywords) ? keywords : [keywords];
        for (const kw of kwArr) {
          if (typeof kw === 'string' && kw.includes(PREFIX)) {
            const match = kw.match(/CREWPASS-HANDOVER\|[a-f0-9-]+\|\d{4,8}/i);
            if (match) {
              this.logger.log(`Token found in PDF Keywords metadata`);
              return match[0];
            }
          }
        }
      }

      // Try Producer (we embed it there too: "DocPilot | <token>")
      const producer = pdfDoc.getProducer();
      if (typeof producer === 'string') {
        const match = producer.match(/CREWPASS-HANDOVER\|[a-f0-9-]+\|\d{4,8}/i);
        if (match) {
          this.logger.log(`Token found in PDF Producer metadata`);
          return match[0];
        }
      }
      return null;
    } catch (e) {
      this.logger.warn(`PDF metadata extraction failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * For text-based PDFs (the original generated handover before scanning),
   * extract text content via pdf-parse and search for the CREWPASS-HANDOVER token.
   * This is the PRIMARY verification path — much more reliable than decoding
   * QR pixels from a FlateDecoded PDF stream.
   */
  private async extractTokenFromPdfText(buffer: Buffer): Promise<string | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse') as (
        data: Buffer,
      ) => Promise<{ text: string }>;
      const { text } = await pdfParse(buffer);
      const match = text.match(/CREWPASS-HANDOVER\|[a-f0-9-]+\|\d{4,8}/i);
      if (match) {
        this.logger.log(`PDF token found via text extraction: ${match[0]}`);
        return match[0];
      }
      return null;
    } catch (e) {
      this.logger.warn(`pdf-parse text extraction failed: ${(e as Error).message}`);
      return null;
    }
  }

  async verifyUploadedHandover(
    buffer: Buffer,
    mimeType: string,
    expectedPassId: string,
    expectedPassNumber: string,
  ): Promise<void> {
    const token = await this.readQrFromFile(buffer, mimeType);
    const parsed = this.parseToken(token);

    if (!parsed) {
      throw new BadRequestException(
        'Invalid QR code — this document was not generated by DocPilot.',
      );
    }
    if (parsed.passId !== expectedPassId || parsed.passNumber !== expectedPassNumber) {
      throw new BadRequestException(
        `QR code mismatch — this document belongs to pass ${parsed.passNumber}, ` +
        `not the current pass (${expectedPassNumber}). ` +
        'Please upload the correct signed handover document.',
      );
    }
    this.logger.log(`Handover QR verified for pass ${expectedPassNumber}`);
  }

  // ── Private pixel extraction ──────────────────────────────────────────────

  private async extractPixelsFromImage(
    buffer: Buffer,
  ): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
    try {
      const { data, info } = await sharp(buffer)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      return { data: new Uint8ClampedArray(data as Buffer), width: info.width, height: info.height };
    } catch (e) {
      this.logger.warn(`Image pixel extraction failed: ${(e as Error).message}`);
      return null;
    }
  }

  /**
   * Scanned PDFs embed each page as a JPEG/PNG XObject stream.
   * We iterate PDF XObjects looking for image streams and extract the largest.
   */
  private async extractPixelsFromPdf(
    buffer: Buffer,
  ): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
    try {
      const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pages = pdfDoc.getPages();

      for (const page of pages) {
        try {
          // Walk the raw PDF node tree to find XObject image streams
          const node = page.node as any;
          const resources = node.Resources?.();
          if (!resources) continue;

          const xObjects = resources.XObject?.();
          if (!xObjects) continue;

          const keys: string[] = xObjects.keys?.() ?? [];
          for (const key of keys) {
            try {
              const xObj = xObjects.lookup(key) as any;
              if (!xObj) continue;

              // Extract raw stream bytes
              let imageBytes: Buffer | null = null;
              if (typeof xObj.getContents === 'function') {
                imageBytes = Buffer.from(xObj.getContents() as Uint8Array);
              } else if (xObj.contents) {
                imageBytes = Buffer.from(xObj.contents as Uint8Array);
              }

              if (!imageBytes || imageBytes.length < 500) continue;

              const pixels = await this.extractPixelsFromImage(imageBytes);
              if (pixels) {
                this.logger.log(`PDF image extracted from XObject "${key}" (${imageBytes.length} bytes)`);
                return pixels;
              }
            } catch { /* try next XObject */ }
          }
        } catch (pageErr) {
          this.logger.warn(`PDF page extraction error: ${(pageErr as Error).message}`);
        }
      }

      // Fallback: treat the whole buffer as an image (rare but worth trying)
      return await this.extractPixelsFromImage(buffer);
    } catch (e) {
      this.logger.warn(`PDF pixel extraction failed: ${(e as Error).message}`);
      return null;
    }
  }
}
