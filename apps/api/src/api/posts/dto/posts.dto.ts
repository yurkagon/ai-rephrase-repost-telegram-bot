import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

import { RewriteOptionsDto } from '@/api/channels/dto/channels.dto';

export class GenerateDto {
  @IsInt() @Min(0) revision: number;
  @IsOptional() @ValidateNested() @Type(() => RewriteOptionsDto) options?: RewriteOptionsDto;

  @ApiProperty({
    required: false,
    maxLength: 2000,
    description: 'Additional instructions for this generation only',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  postInstructions?: string;
}

export class RevisionDto {
  @ApiProperty() @IsInt() @Min(0) revision: number;
}

export class CaptionDto {
  @IsInt() @Min(1) messageId: number;
  @IsString() @MaxLength(16000) html: string;
}

export class EditPostDto extends RevisionDto {
  @IsString() @MaxLength(16000) html: string;
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CaptionDto)
  captions: CaptionDto[];
}

export class ResolveDto {
  @IsBoolean() published: boolean;
}

export class ListPostsDto {
  @IsOptional() @IsString() routeId?: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @IsIn(['inbox', 'history']) view?: 'inbox' | 'history';
}
