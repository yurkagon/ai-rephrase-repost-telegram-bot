import {
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
} from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TELEGRAM_OPTIONS, type TelegramModuleOptions } from './telegram.options';

export type { TelegramModuleOptions } from './telegram.options';

@Module({
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {
  static registerAsync(
    options: Pick<ModuleMetadata, 'imports'> &
      Pick<FactoryProvider<TelegramModuleOptions>, 'inject' | 'useFactory'>,
  ): DynamicModule {
    return {
      module: TelegramModule,
      global: true,
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
