import { OmitType } from '@nestjs/swagger';

import { CreateUserDto } from '@/api/user/dto/create-user.dto';

export class RegisterDto extends OmitType(CreateUserDto, ['role'] as const) {}
