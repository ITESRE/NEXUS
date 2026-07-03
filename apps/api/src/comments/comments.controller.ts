import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole, UserStatus } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CommentsService } from './comments.service';

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

@UseGuards(JwtAuthGuard)
@Controller('posts/:postId/comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get()
  findByPost(@Param('postId') postId: string) {
    return this.commentsService.findByPost(postId);
  }

  @Post()
  create(
    @Param('postId') postId: string,
    @Req() req: RequestWithUser,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    return this.commentsService.create(postId, req.user.userId, createCommentDto);
  }
}