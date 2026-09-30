import {
  NextResponse,
} from 'next/server';
import {
  backendFetch,
  clearSessionTokens,
  getAuthenticatedSession,
  readJson,
} from '@/lib/server/backend';

type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole:
    | 'USER'
    | 'ADMIN'
    | 'SUPER_ADMIN';
  status: string;
  createdAt: string;
  updatedAt: string;
};

type AdminApplication = {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
};

type ApplicationsPayload = {
  applications: AdminApplication[];
};

function isAdminUser(
  value: unknown,
): value is AdminUser {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false;
  }

  const user =
    value as Partial<AdminUser>;

  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.firstName === 'string' &&
    typeof user.lastName === 'string' &&
    typeof user.platformRole ===
      'string' &&
    typeof user.status === 'string'
  );
}

function isAdminApplication(
  value: unknown,
): value is AdminApplication {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false;
  }

  const application =
    value as Partial<AdminApplication>;

  return (
    typeof application.key === 'string' &&
    typeof application.name === 'string' &&
    typeof application.enabled ===
      'boolean' &&
    typeof application.sortOrder ===
      'number'
  );
}

export async function GET() {
  try {
    const session =
      await getAuthenticatedSession();

    if (!session) {
      return NextResponse.json(
        {
          authenticated: false,
        },
        {
          status: 401,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (
      session.user.platformRole !==
        'ADMIN' &&
      session.user.platformRole !==
        'SUPER_ADMIN'
    ) {
      return NextResponse.json(
        {
          message:
            'Accès administrateur requis',
        },
        {
          status: 403,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    /*
     * Une seule validation / rotation
     * de session a eu lieu ci-dessus.
     *
     * Les appels backend suivants
     * réutilisent donc le même access
     * token et ne peuvent pas provoquer
     * une double rotation du refresh.
     */
    const usersResponse =
      await backendFetch(
        '/users',
        {
          headers: {
            Authorization:
              `Bearer ${session.accessToken}`,
          },
        },
      );

    if (usersResponse.status === 401) {
      await clearSessionTokens();

      return NextResponse.json(
        {
          authenticated: false,
        },
        {
          status: 401,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (usersResponse.status === 403) {
      return NextResponse.json(
        {
          message:
            'Accès administrateur refusé',
        },
        {
          status: 403,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (!usersResponse.ok) {
      throw new Error(
        'Utilisateurs CORE indisponibles',
      );
    }

    const applicationsResponse =
      await backendFetch(
        '/applications',
        {
          headers: {
            Authorization:
              `Bearer ${session.accessToken}`,
          },
        },
      );

    if (
      applicationsResponse.status === 401
    ) {
      await clearSessionTokens();

      return NextResponse.json(
        {
          authenticated: false,
        },
        {
          status: 401,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (
      applicationsResponse.status === 403
    ) {
      return NextResponse.json(
        {
          message:
            'Accès administrateur refusé',
        },
        {
          status: 403,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (!applicationsResponse.ok) {
      throw new Error(
        'Catalogue CORE indisponible',
      );
    }

    const users =
      await readJson<unknown>(
        usersResponse,
      );

    const applicationsPayload =
      await readJson<ApplicationsPayload>(
        applicationsResponse,
      );

    if (
      !Array.isArray(users) ||
      !users.every(isAdminUser)
    ) {
      throw new Error(
        'Contrat /users invalide',
      );
    }

    if (
      !applicationsPayload ||
      !Array.isArray(
        applicationsPayload.applications,
      ) ||
      !applicationsPayload.applications
        .every(isAdminApplication)
    ) {
      throw new Error(
        'Contrat /applications invalide',
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        user:
          session.user,
        users,
        applications:
          applicationsPayload.applications,
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
  catch {
    return NextResponse.json(
      {
        message:
          'Administration CORE temporairement indisponible',
      },
      {
        status: 502,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}