import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { SocialRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocialAccessGuard } from '../social/social-access.guard';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { CommentsService } from './comments.service';

type RequestWithSocialUser = {
  user: {
    userId: string;
    socialRole: SocialRole;
  };
};

@UseGuards(
  JwtAuthGuard,
  SocialAccessGuard,
)
@Controller()
export class CommentsController {
  constructor(
    private readonly commentsService:
      CommentsService,
  ) {}

  @Get('posts/:postId/comments')
  findByPost(
    @Param('postId') postId: string,
  ) {
    return this.commentsService.findByPost(
      postId,
    );
  }

  @Post('posts/:postId/comments')
  create(
    @Param('postId') postId: string,
    @Req() req: RequestWithSocialUser,
    @Body() createCommentDto:
      CreateCommentDto,
  ) {
    return this.commentsService.create(
      postId,
      req.user.userId,
      createCommentDto,
    );
  }

  @Delete('comments/:id')
  softDelete(
    @Param('id') id: string,
    @Req() req: RequestWithSocialUser,
  ) {
    return this.commentsService.softDelete(
      id,
      req.user,
    );
  }

  @Patch('comments/:id')
  update(
    @Param('id') id: string,
    @Body() updateCommentDto:
      UpdateCommentDto,
    @Req() req: RequestWithSocialUser,
  ) {
    return this.commentsService.update(
      id,
      updateCommentDto,
      req.user,
    );
  }
}