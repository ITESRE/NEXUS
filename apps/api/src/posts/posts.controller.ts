import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { PostsService } from './posts.service';

type RequestWithUser = {
  user: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    status: UserStatus;
  };
};

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  findAll() {
    return this.postsService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Req() req: RequestWithUser, @Body() createPostDto: CreatePostDto) {
    return this.postsService.create(req.user.userId, createPostDto);
  }
}