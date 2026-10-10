import { Test } from '@nestjs/testing';
import { Telegraf } from 'telegraf';

import { TelegramModule } from './telegram.module';
import { TelegramService } from './telegram.service';

it('constructs its own bot from async options without AI/auth/database dependencies', async () => {
  const module = await Test.createTestingModule({
    imports: [TelegramModule.registerAsync({ useFactory: () => ({ token: 'test-token' }) })],
  }).compile();
  const service = module.get(TelegramService);

  expect(service.instance).toBeInstanceOf(Telegraf);
  service.onModuleInit();
  await module.close();
});
