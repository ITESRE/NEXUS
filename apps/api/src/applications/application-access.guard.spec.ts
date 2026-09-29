import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { ApplicationAccessGuard } from './application-access.guard';
import { ApplicationAccessService } from './application-access.service';

describe(
  'ApplicationAccessGuard',
  () => {
    const createContext = (
      userId?: string,
    ) =>
      ({
        getHandler:
          () => (() => undefined),
        getClass:
          () => class TestController {},
        switchToHttp: () => ({
          getRequest: () => ({
            user:
              userId
                ? {
                    userId,
                  }
                : undefined,
          }),
        }),
      }) as unknown as ExecutionContext;

    const createGuard = (
      requiredApplication:
        string | undefined,
      hasAccess: boolean,
    ) => {
      const reflector = {
        getAllAndOverride:
          jest
            .fn()
            .mockReturnValue(
              requiredApplication,
            ),
      } as unknown as Reflector;

      const applicationAccessService = {
        hasAccess:
          jest
            .fn()
            .mockResolvedValue(
              hasAccess,
            ),
      } as unknown as ApplicationAccessService;

      return {
        guard:
          new ApplicationAccessGuard(
            reflector,
            applicationAccessService,
          ),
        applicationAccessService,
      };
    };

    it(
      'laisse passer une route sans application requise',
      async () => {
        const {
          guard,
          applicationAccessService,
        } =
          createGuard(
            undefined,
            false,
          );

        await expect(
          guard.canActivate(
            createContext(),
          ),
        ).resolves.toBe(true);

        expect(
          applicationAccessService
            .hasAccess,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'refuse une route applicative sans utilisateur authentifie',
      async () => {
        const {
          guard,
          applicationAccessService,
        } =
          createGuard(
            'NEXUS_SOCIAL',
            true,
          );

        await expect(
          guard.canActivate(
            createContext(),
          ),
        ).rejects.toBeInstanceOf(
          ForbiddenException,
        );

        expect(
          applicationAccessService
            .hasAccess,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'refuse un utilisateur sans acces a l application',
      async () => {
        const {
          guard,
          applicationAccessService,
        } =
          createGuard(
            'NEXUS_SOCIAL',
            false,
          );

        await expect(
          guard.canActivate(
            createContext(
              '00000000-0000-4000-8000-000000000010',
            ),
          ),
        ).rejects.toBeInstanceOf(
          ForbiddenException,
        );

        expect(
          applicationAccessService
            .hasAccess,
        ).toHaveBeenCalledWith(
          '00000000-0000-4000-8000-000000000010',
          'NEXUS_SOCIAL',
        );
      },
    );

    it(
      'autorise un utilisateur disposant de l acces',
      async () => {
        const {
          guard,
          applicationAccessService,
        } =
          createGuard(
            'NEXUS_SOCIAL',
            true,
          );

        await expect(
          guard.canActivate(
            createContext(
              '00000000-0000-4000-8000-000000000011',
            ),
          ),
        ).resolves.toBe(true);

        expect(
          applicationAccessService
            .hasAccess,
        ).toHaveBeenCalledWith(
          '00000000-0000-4000-8000-000000000011',
          'NEXUS_SOCIAL',
        );
      },
    );
  },
);