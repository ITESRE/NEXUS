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
import { ApplicationAccessGuard } from '../applications/application-access.guard';
import { RequireApplication } from '../applications/application-access.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SocialAccessGuard } from '../social/social-access.guard';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { PostsService } from './posts.service';

type RequestWithSocialUser = {
  user: {
    userId: string;
    socialRole: SocialRole;
  };
};

@Controller('posts')
@RequireApplication('NEXUS_SOCIAL')
@UseGuards(
  JwtAuthGuard,
  ApplicationAccessGuard,
  SocialAccessGuard,
)
export class PostsController {
  constructor(
    private readonly postsService: PostsService,
  ) {}

  @Get()
  findAll() {
    return this.postsService.findAll();
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
  ) {
    return this.postsService.findOne(id);
  }

  @Post()
  create(
    @Req() req: RequestWithSocialUser,
    @Body() createPostDto: CreatePostDto,
  ) {
    return this.postsService.create(
      req.user.userId,
      createPostDto,
    );
  }

  @Delete(':id')
  softDelete(
    @Param('id') id: string,
    @Req() req: RequestWithSocialUser,
  ) {
    return this.postsService.softDelete(
      id,
      req.user,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePostDto: UpdatePostDto,
    @Req() req: RequestWithSocialUser,
  ) {
    return this.postsService.update(
      id,
      updatePostDto,
      req.user,
    );
  }
}