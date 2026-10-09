import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ada@example.com', description: 'Account email.' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'correct-horse-battery-staple', description: 'Plain password.' })
  @IsString()
  @IsNotEmpty()
  password: string;
}
