import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content!: string;
}