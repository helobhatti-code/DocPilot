import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let code: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? exception.message;
        code = b.code as string | undefined;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      ({ status, message, code } = this.mapPrismaError(exception));
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack);
      message = exception.message;
    }

    res.status(status).json({
      statusCode: status,
      code,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    });
  }

  private mapPrismaError(e: Prisma.PrismaClientKnownRequestError): {
    status: number;
    message: string;
    code: string;
  } {
    switch (e.code) {
      case 'P2002':
        return { status: HttpStatus.CONFLICT, message: 'Unique constraint violation', code: e.code };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Record not found', code: e.code };
      case 'P2003':
        return { status: HttpStatus.BAD_REQUEST, message: 'Foreign key violation', code: e.code };
      default:
        return { status: HttpStatus.BAD_REQUEST, message: e.message, code: e.code };
    }
  }
}
