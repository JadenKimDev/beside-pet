/**
 * main.ts — Bootstrap. Cookie parser (JWT) + global validation pipe + CORS (with cookies)
 * + OpenAPI docs (/docs) + port. Env files are loaded by ConfigModule (AppModule).
 */
import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AUTH_COOKIE } from './identity/guard/cookie';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  // Every route lives under /v1 — controllers stay prefix-free.
  app.setGlobalPrefix('v1');

  app.use(cookieParser());

  // External boundary: strip unknown fields and transform/validate into DTOs.
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // credentials must be allowed to send/receive httpOnly cookies.
  app.enableCors({ origin: true, credentials: true });

  // OpenAPI surface — always on: the API is the product's public contract.
  const openApiConfig = new DocumentBuilder()
    .setTitle('Beside Pet API')
    .setDescription(
      'Pet-loss emotional support agent — sessions, safety, accounts. ' +
        'Locked endpoints use the httpOnly auth cookie: run POST /v1/auth/login (or /setup) ' +
        'here first and the browser sends the cookie with every try-it-out request.',
    )
    .setVersion('1.0')
    .addCookieAuth(AUTH_COOKIE)
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, openApiConfig));

  const config = app.get(ConfigService);
  const port = Number(config.get<string>('PORT') ?? 3000);
  await app.listen(port);
}

void bootstrap();
