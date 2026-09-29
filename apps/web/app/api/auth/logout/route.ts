import {
  NextRequest,
  NextResponse,
} from 'next/server';
import {
  backendFetch,
  clearSessionTokens,
  getRefreshToken,
} from '@/lib/server/backend';

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

  const refreshToken =
    await getRefreshToken();

  /*
   * La deconnexion locale doit
   * toujours aboutir, meme si
   * le backend est temporairement
   * indisponible.
   */
  if (refreshToken) {
    try {
      await backendFetch(
        '/auth/logout',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            refreshToken,
          }),
        },
      );
    }
    catch {
      // Nettoyage local ci-dessous.
    }
  }

  await clearSessionTokens();

  return NextResponse.json(
    {
      message:
        'Déconnexion effectuée',
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