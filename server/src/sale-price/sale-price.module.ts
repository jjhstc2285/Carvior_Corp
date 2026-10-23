import { Global, Module } from '@nestjs/common';
import { SalePriceService } from './sale-price.service';
import { SalePriceSweepService } from './sale-price-sweep.service';

/**
 * 차량판매가 한 값 — 네 자리에 같이 들어간다.
 *
 * 상담·차량 관리·알선 정산·매입 정산이 다 가져다 쓴다. 모듈을 서로 물리면 상담 →
 * 정산 → 차량 → 상담으로 돌아서 뜨지를 않는다 — 전역으로 둔다.
 */
@Global()
@Module({
  providers: [SalePriceService, SalePriceSweepService],
  exports: [SalePriceService],
})
export class SalePriceModule {}
