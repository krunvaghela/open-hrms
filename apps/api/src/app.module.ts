import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { HealthController } from './health.controller';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AccessGuard, AuthService } from './auth';
import { AuthController } from './auth.controller';
import { PeopleController } from './people.controller';
import { SettingsController } from './settings.controller';

import { TrackingController } from './tracking.controller';
import { WorkforceService } from './workforce.service';
import { WorkforceController } from './workforce.controller';
import { PayrollController } from './payroll.controller';

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 300,
        getTracker: (request) => request.user?.id ?? request.ip,
      },
      { name: 'burst', ttl: 1000, limit: 100, getTracker: (request) => request.ip },
    ]),
  ],
  controllers: [
    HealthController,
    AuthController,
    PeopleController,
    SettingsController,
    WorkforceController,
    PayrollController,
    TrackingController,
  ],
  providers: [
    DatabaseService,
    WorkforceService,
    AuthService,
    { provide: APP_GUARD, useClass: AccessGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
