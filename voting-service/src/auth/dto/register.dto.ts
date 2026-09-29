import { IsString, Length, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_.]+$/, {
    message: 'username may only contain letters, numbers, "_" and "."',
  })
  username: string;

  @IsString()
  @MinLength(6)
  password: string;
}
