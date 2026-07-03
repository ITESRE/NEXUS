import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
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
@Controller()
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get('posts/:postId/comments')
  findByPost(@Param('postId') postId: string) {
    return this.commentsService.findByPost(postId);
  }

  @Post('posts/:postId/comments')
  create(
    @Param('postId') postId: string,
    @Req() req: RequestWithUser,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    return this.commentsService.create(
      postId,
      req.user.userId,
      createCommentDto,
    );
  }

  @Delete('comments/:id')
  softDelete(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.commentsService.softDelete(id, req.user);
  }
}