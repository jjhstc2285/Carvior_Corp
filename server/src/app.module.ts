import { Module } from '@nestjs/common';
import { join } from 'node:path';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './auth/auth.module';
import { EmployeesModule } from './employees/employees.module';
import { AttendanceModule } from './attendance/attendance.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { SettlementsModule } from './settlements/settlements.module';
import { SalePriceModule } from './sale-price/sale-price.module';
import { ParkingModule } from './parking/parking.module';
import { VendorsModule } from './vendors/vendors.module';
import { PropertiesModule } from './properties/properties.module';
import { WorkLogsModule } from './work-logs/work-logs.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ChatModule } from './chat/chat.module';
import { PushModule } from './push/push.module';
import { PurchaseIntakeModule } from './purchase-intake/purchase-intake.module';
import { CarviorModule } from './carvior/carvior.module';
import { ChannelTalkModule } from './channeltalk/channeltalk.module';
import { WashModule } from './wash/wash.module';
import { VehiclePhotosModule } from './vehicle-photos/vehicle-photos.module';
import { CondolenceModule } from './condolence/condolence.module';
import { NoticesModule } from './notices/notices.module';
import { TelegramModule } from './telegram/telegram.module';
import { DealerFeesModule } from './dealer-fees/dealer-fees.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AdsModule } from './ads/ads.module';
import { ParkBoardModule } from './parkboard/parkboard.module';
import { PayrollModule } from './payroll/payroll.module';
import { PrepScheduleModule } from './prep-schedule/prep-schedule.module';
import { ParkingLayoutModule } from './parking-layout/parking-layout.module';
import { StockAgeModule } from './stock-age/stock-age.module';
import { ReferralModule } from './referral/referral.module';
import { CleaningModule } from './cleaning/cleaning.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';

@Module({
  imports: [
    /*
      .env 를 서버 폴더에서 찾는다.

      기본값은 '현재 작업 폴더의 .env' 다. 그래서 pm2 를 다른 자리에서 띄우면 못 읽고,
      열쇠가 통째로 빈 채로 뜬다 — 공지가 안 나가고 "토큰이 없습니다" 가 뜨던 게 그것이다.
      어디서 띄우든 같은 파일을 보게 한다(dist 바로 위가 server 폴더다).
    */
    ConfigModule.forRoot({ isGlobal: true, envFilePath: [join(__dirname, '..', '.env'), '.env'] }),
    PrismaModule,
    RedisModule,
    AuthModule,
    EmployeesModule,
    AttendanceModule,
    ConsultationsModule,
    SettlementsModule,
    // 차량판매가 한 값 — 네 자리에 같이 들어간다(전역이라 어디서든 가져다 쓴다)
    SalePriceModule,
    ParkingModule,
    VendorsModule,
    PropertiesModule,
    WorkLogsModule,
    VehiclesModule,
    RealtimeModule,
    ChatModule,
    PushModule,
    PurchaseIntakeModule,
    CarviorModule,
    ChannelTalkModule,
    WashModule,
    VehiclePhotosModule,
    CondolenceModule,
    NoticesModule,
    TelegramModule,
    CleaningModule,
    DealerFeesModule,
    ApprovalsModule,
    AdsModule,
    ParkBoardModule,
    PayrollModule,
    ReferralModule,
    PrepScheduleModule,
    ParkingLayoutModule,
    StockAgeModule,
  ],
  providers: [
    // 전역 가드 — 기본은 로그인 필요, @Public() 붙은 곳만 예외.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
