import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
  ValidateNested,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RewriteOptionsDto {
  @ApiProperty({ enum: ['uk', 'en'] }) @IsIn(['uk', 'en']) language: 'uk' | 'en';
  @IsIn(['neutral', 'formal', 'friendly']) tone: 'neutral' | 'formal' | 'friendly';
  @IsIn(['preserve', 'concise']) length: 'preserve' | 'concise';
  @ApiProperty({ required: false, enum: ['light', 'balanced', 'deep'], default: 'balanced' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['light', 'balanced', 'deep'])
  rewriteStrength?: 'light' | 'balanced' | 'deep';

  @IsBoolean() removeSource: boolean;
  @ApiProperty({ required: false, maxLength: 2000, description: 'Additional rewrite rules' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  customInstructions?: string;
}

export class AddChannelDto {
  @ApiProperty({
    example: '@my_channel',
    description:
      'Channel username with @ or numeric ID without a minus sign (1001234567890). Signed IDs are also accepted.',
  })
  @IsString()
  @MaxLength(100)
  identifier: string;
}

export class CreateRouteDto {
  @IsUUID() sourceId: string;
  @IsUUID() targetId: string;
  @IsString() @MaxLength(100) name: string;
  @ValidateNested() @Type(() => RewriteOptionsDto) options: RewriteOptionsDto;
}

export class UpdateRouteDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @ValidateNested() @Type(() => RewriteOptionsDto) options?: RewriteOptionsDto;
}
