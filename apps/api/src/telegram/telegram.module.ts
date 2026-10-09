import {
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
} from '@nestjs/common';
import { AiModule } from '@/ai/ai.module';
import { TelegramService } from './telegram.service';
import { TELEGRAM_OPTIONS, type TelegramModuleOptions } from './telegram.options';

export type { TelegramModuleOptions } from './telegram.options';

@Module({
  imports: [AiModule],
  providers: [TelegramService],
})
export class TelegramModule {
  static registerAsync(
    options: Pick<ModuleMetadata, 'imports'> &
      Pick<FactoryProvider<TelegramModuleOptions>, 'inject' | 'useFactory'>,
  ): DynamicModule {
    return {
      module: TelegramModule,
      imports: options.imports,
      providers: [
        {
          provide: TELEGRAM_OPTIONS,
          inject: options.inject,
          useFactory: options.useFactory,
        },
      ],
    };
  }
}
