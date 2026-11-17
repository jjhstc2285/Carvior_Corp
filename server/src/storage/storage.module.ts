import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * 올린 파일을 두는 곳. 여섯 모듈이 쓰므로 PrismaModule처럼 전역으로 둔다 —
 * 모듈마다 imports에 끼워 넣으면 한 군데는 꼭 빠뜨린다.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
