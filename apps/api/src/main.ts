import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import { json } from 'express';
import { validateEncryptionKey } from './security';

async function bootstrap(): Promise<void> {
  validateEncryptionKey();
  if (!process.env.APP_ORIGIN) throw new Error('APP_ORIGIN is required');
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet());
  app.use(json({ limit: '300kb' }));
  app.use(
    (
      _request: unknown,
      response: { setHeader: (name: string, value: string) => void },
      next: () => void,
    ) => {
      response.setHeader('Cache-Control', 'no-store');
      next();
    },
  );
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  await app.listen(port, '0.0.0.0');
}

bootstrap().catch(() => {
  Logger.error('API startup failed. Check infrastructure configuration and database availability.');
  process.exit(1);
});
