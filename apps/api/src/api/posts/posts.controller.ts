import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { pipeline } from 'node:stream/promises';

import { Authorization, CurrentUser } from '@/common/decorators';

import { PostsService } from './posts.service';
import {
  EditPostDto,
  GenerateDto,
  ListPostsDto,
  RatingDto,
  ResolveDto,
  RevisionDto,
} from './dto/posts.dto';

@ApiTags('Posts')
@Controller('posts')
@Authorization()
export class PostsController {
  constructor(private readonly posts: PostsService) {}

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
    const { stream, contentType } = await this.posts.media(owner, id, mediaId);

    response.setHeader('Content-Type', contentType);
    response.setHeader('Cache-Control', 'private, no-store');

    try {
      await pipeline(stream, response);
    } catch {
      if (response.headersSent) response.destroy();
      else
        throw new ServiceUnavailableException(
          'Media preview is unavailable; the saved Telegram file can still be published',
        );
    }
  }
}
