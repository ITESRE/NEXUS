import {
  NextRequest,
  NextResponse,
} from 'next/server';
import {
  backendFetch,
  type BackendLoginResponse,
  readJson,
  setSessionTokens,
} from '@/lib/server/backend';

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function isAllowedOrigin(
  request: NextRequest,
): boolean {
  const origin =
    request.headers.get('origin');

  return (
    origin === null ||
    origin === request.nextUrl.origin
  );
}

function getBackendErrorMessage(
  status: number,
): string {
  if (status === 401) {
    return 'Identifiants invalides';
  }

  if (status === 429) {
    return 'Trop de tentatives. Réessayez dans une minute.';
  }

  if (status === 400) {
    return 'Vérifiez votre adresse email et votre mot de passe.';
  }

  return 'Connexion impossible pour le moment.';
}

export async function POST(
  request: NextRequest,
) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json(
      {
        message:
          'Origine de requête interdite',
      },
      {
        status: 403,
      },
    );
  }

  let body: LoginBody;

  try {
    body =
      await request.json() as LoginBody;
  }
  catch {
    return NextResponse.json(
      {
        message:
          'Requête invalide',
      },
      {
        status: 400,
      },
    );
  }

  if (
    typeof body.email !== 'string' ||
    typeof body.password !== 'string'
  ) {
    return NextResponse.json(
      {
        message:
          'Email et mot de passe requis',
      },
      {
        status: 400,
      },
    );
  }

  try {
    const backendResponse =
      await backendFetch(
        '/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            email:
              body.email,
            password:
              body.password,
          }),
        },
      );

    if (!backendResponse.ok) {
      return NextResponse.json(
        {
          message:
            getBackendErrorMessage(
              backendResponse.status,
            ),
        },
        {
          status:
            backendResponse.status,
        },
      );
    }

    const payload =
      await readJson<BackendLoginResponse>(
        backendResponse,
      );

    if (
      !payload ||
      typeof payload.accessToken !==
        'string' ||
      typeof payload.refreshToken !==
        'string' ||
      !payload.user
    ) {
      return NextResponse.json(
        {
          message:
            'Réponse d’authentification invalide',
        },
        {
          status: 502,
        },
      );
    }

    await setSessionTokens(
      payload.accessToken,
      payload.refreshToken,
    );

    /*
     * Aucun token n'est renvoye
     * au composant React.
     */
    return NextResponse.json(
      {
        user: {
          userId:
            payload.user.id,
          email:
            payload.user.email,
          firstName:
            payload.user.firstName,
          lastName:
            payload.user.lastName,
          role:
            payload.user.role,
          platformRole:
            payload.user.platformRole,
          status:
            payload.user.status,
        },
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
          'Le service d’authentification est indisponible.',
      },
      {
        status: 502,
      },
    );
  }
}