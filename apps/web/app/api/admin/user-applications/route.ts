import {
  NextRequest,
  NextResponse,
} from 'next/server';
import {
  backendFetch,
  clearSessionTokens,
  getAuthenticatedSession,
  readJson,
} from '@/lib/server/backend';

type UserApplication = {
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  sortOrder: number;
  hasAccess: boolean;
  grantedAt: string | null;
};

type UserApplicationsPayload = {
  user: {
    id: string;
    platformRole: string;
    status: string;
  };
  applications: UserApplication[];
};

function isUuid(
  value: string,
): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function isUserApplication(
  value: unknown,
): value is UserApplication {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return false;
  }

  const application =
    value as Partial<UserApplication>;

  return (
    typeof application.key === 'string' &&
    typeof application.name === 'string' &&
    typeof application.enabled ===
      'boolean' &&
    typeof application.sortOrder ===
      'number' &&
    typeof application.hasAccess ===
      'boolean'
  );
}

export async function GET(
  request: NextRequest,
) {
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

    const userId =
      request.nextUrl.searchParams
        .get('userId')
        ?.trim() ?? '';

    if (!isUuid(userId)) {
      return NextResponse.json(
        {
          message:
            'Identifiant utilisateur invalide',
        },
        {
          status: 400,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const backendResponse =
      await backendFetch(
        `/applications/users/${encodeURIComponent(
          userId,
        )}`,
        {
          headers: {
            Authorization:
              `Bearer ${session.accessToken}`,
          },
        },
      );

    if (backendResponse.status === 401) {
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
      backendResponse.status === 403
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

    if (
      backendResponse.status === 404
    ) {
      return NextResponse.json(
        {
          message:
            'Utilisateur introuvable',
        },
        {
          status: 404,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (!backendResponse.ok) {
      throw new Error(
        'Accès applicatifs indisponibles',
      );
    }

    const payload =
      await readJson<UserApplicationsPayload>(
        backendResponse,
      );

    if (
      !payload ||
      !payload.user ||
      typeof payload.user.id !==
        'string' ||
      !Array.isArray(
        payload.applications,
      ) ||
      !payload.applications.every(
        isUserApplication,
      )
    ) {
      throw new Error(
        'Contrat accès utilisateur invalide',
      );
    }

    return NextResponse.json(
      payload,
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
          'Accès applicatifs temporairement indisponibles',
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