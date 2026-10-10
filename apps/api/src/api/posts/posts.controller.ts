import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ConfigService } from '@nestjs/config';

import { Authorization, CurrentUser } from '@/common/decorators';
import { TelegramService } from '@/telegram/telegram.service';
import type { Environment } from '@/config/env.schema';

import { PostsService } from './posts.service';
import {
  EditPostDto,
  GenerateDto,
  ListPostsDto,
  RatingDto,
  ResolveDto,
  RevisionDto,
} from './posts.dto';

@ApiTags('Posts')
@Controller('posts')
@Authorization()
export class PostsController {
  constructor(
    private readonly posts: PostsService,
    private readonly bot: TelegramService,
    private readonly config: ConfigService<Environment>,
  ) {}

  @Get() list(@CurrentUser('id') owner: string, @Query() query: ListPostsDto) {
    return this.posts.list(owner, query.routeId, query.cursor, query.view);
  }

  @Get('metrics') metrics(@CurrentUser('id') owner: string) {
    return this.posts.metrics(owner);
  }

  @Get('operations/:id') operation(@CurrentUser('id') owner: string, @Param('id') id: string) {
    return this.posts.operation(owner, id);
  }

  @Get(':id') detail(@CurrentUser('id') owner: string, @Param('id') id: string) {
    return this.posts.owned(owner, id);
  }

  @Patch(':id') edit(
    @CurrentUser('id') owner: string,
    @Param('id') id: string,
    @Body() dto: EditPostDto,
  ) {
    return this.posts.edit(owner, id, dto);
  }

  @Post(':id/generate')
  @HttpCode(202)
  @ApiOperation({
    summary: 'Queue an AI draft for the expected revision; repeated requests are idempotent',
  })
  generate(@CurrentUser('id') owner: string, @Param('id') id: string, @Body() dto: GenerateDto) {
    return this.posts.generate(owner, id, dto);
  }

  @Post(':id/publish')
  @HttpCode(202)
  @ApiOperation({ summary: 'Publish the confirmed saved revision' })
  publish(@CurrentUser('id') owner: string, @Param('id') id: string, @Body() dto: RevisionDto) {
    return this.posts.publish(owner, id, dto.revision);
  }

  @Post(':id/rating') rate(
    @CurrentUser('id') owner: string,
    @Param('id') id: string,
    @Body() dto: RatingDto,
  ) {
    return this.posts.rate(owner, id, dto.rating);
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Manually resolve ambiguous delivery after checking Telegram' })
  resolve(@CurrentUser('id') owner: string, @Param('id') id: string, @Body() dto: ResolveDto) {
    return this.posts.resolve(owner, id, dto.published);
  }

  @Get(':id/media/:mediaId')
  async media(
    @CurrentUser('id') owner: string,
    @Param('id') id: string,
    @Param('mediaId') mediaId: string,
    @Res() response: Response,
  ) {
    const post = await this.posts.owned(owner, id);
    const media = post.media.find((item) => item.id === mediaId);

    if (!media) throw new NotFoundException('Media not found');

    try {
      const file = await this.bot.telegram.getFile(media.fileId);

      if (!file.file_path || (file.file_size ?? 0) > 20 * 1024 * 1024)
        throw new Error('Media unavailable or exceeds preview limit');

      const token = this.config.getOrThrow('TELEGRAM_BOT_API_TOKEN', { infer: true });
      const upstream = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
        signal: AbortSignal.timeout(15_000),
        redirect: 'error',
      });

      if (!upstream.ok || !upstream.body) throw new Error('Media unavailable');

      const type = upstream.headers.get('content-type') ?? '';

      if (!/^(image\/(jpeg|png|webp)|video\/mp4)(;|$)/.test(type))
        throw new Error('Unsupported preview');

      response.setHeader('Content-Type', type);
      response.setHeader('Cache-Control', 'private, no-store');

      let bytes = 0;

      async function* bounded() {
        for await (const chunk of upstream.body!) {
          bytes += chunk.length;

          if (bytes > 20 * 1024 * 1024) throw new Error('Preview limit exceeded');

          yield chunk;
        }
      }
      await pipeline(Readable.from(bounded()), response);
    } catch {
      if (response.headersSent) response.destroy();
      else
        throw new ServiceUnavailableException(
          'Media preview is unavailable; the saved Telegram file can still be published',
        );
    }
  }
}
