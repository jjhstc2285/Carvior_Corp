import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { SettlementsModule } from './settlements/settlements.module';
import { ParkingModule } from './parking/parking.module';
import { WorkLogsModule } from './work-logs/work-logs.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ChatModule } from './chat/chat.module';
import { PushModule } from './push/push.module';
import { PurchaseIntakeModule } from './purchase-intake/purchase-intake.module';
import { CarviorModule } from './carvior/carvior.module';
import { DealerFeesModule } from './dealer-fees/dealer-fees.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AdsModule } from './ads/ads.module';
import { CleaningModule } from './cleaning/cleaning.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    AuthModule,
    EmployeesModule,
    AttendanceModule,
    ConsultationsModule,
    SettlementsModule,
    ParkingModule,
    WorkLogsModule,
    VehiclesModule,
    RealtimeModule,
    ChatModule,
    PushModule,
    PurchaseIntakeModule,
    CarviorModule,
    CleaningModule,
    DealerFeesModule,
    ApprovalsModule,
    AdsModule,
  ],
  providers: [
    // 전역 가드 — 기본은 로그인 필요, @Public() 붙은 곳만 예외.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
