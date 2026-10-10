import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Authorization, CurrentUser } from '@/common/decorators';

import { ChannelsService } from './channels.service';
import { AddChannelDto, CreateRouteDto, UpdateRouteDto } from './dto/channels.dto';

@ApiTags('Channels and routes')
@Controller('channels')
@Authorization()
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post('connect') connect(@CurrentUser('id') id: string) {
    return this.channels.connect(id);
  }

  @Get() list(@CurrentUser('id') id: string) {
    return this.channels.list(id);
  }

  @Post() add(@CurrentUser('id') id: string, @Body() dto: AddChannelDto) {
    return this.channels.add(id, dto.identifier);
  }

  @Delete(':id') remove(@CurrentUser('id') user: string, @Param('id') id: string) {
    return this.channels.remove(user, id);
  }

  @Get('routes') routes(@CurrentUser('id') user: string) {
    return this.channels.routes(user);
  }

  @Post('routes') createRoute(@CurrentUser('id') user: string, @Body() dto: CreateRouteDto) {
    return this.channels.createRoute(user, dto);
  }

  @Patch('routes/:id') update(
    @CurrentUser('id') user: string,
    @Param('id') id: string,
    @Body() dto: UpdateRouteDto,
  ) {
    return this.channels.updateRoute(user, id, dto);
  }

  @Delete('routes/:id') deleteRoute(@CurrentUser('id') user: string, @Param('id') id: string) {
    return this.channels.removeRoute(user, id);
  }
}
