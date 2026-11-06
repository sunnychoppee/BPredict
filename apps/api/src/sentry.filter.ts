import { Catch, HttpException, type ArgumentsHost } from "@nestjs/common";
import { BaseExceptionFilter } from "@nestjs/core";
import * as Sentry from "@sentry/nestjs";

/** Reports unexpected errors (anything that is not a <500 HttpException) to Sentry, then answers like Nest normally would. */
@Catch()
export class SentryExceptionFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    const expected = exception instanceof HttpException && exception.getStatus() < 500;
    if (!expected) Sentry.captureException(exception);
    super.catch(exception, host);
  }
}
