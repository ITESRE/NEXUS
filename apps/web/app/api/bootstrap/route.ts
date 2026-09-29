import {
  NextResponse,
} from 'next/server';
import {
  getAuthenticatedSession,
  getHubApplications,
} from '@/lib/server/backend';

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

    const applications =
      await getHubApplications(
        session.accessToken,
      );

    return NextResponse.json(
      {
        authenticated: true,
        user:
          session.user,
        applications,
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
          'Impossible de charger votre espace NEXUS.',
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