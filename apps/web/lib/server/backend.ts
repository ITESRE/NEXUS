import { cookies } from 'next/headers';

const ACCESS_COOKIE =
  'nexus_access_token';

const REFRESH_COOKIE =
  'nexus_refresh_token';

export type PlatformRole =
  | 'USER'
  | 'ADMIN'
  | 'SUPER_ADMIN';

export type SessionUser = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  platformRole: PlatformRole;
  status: string;
};

export type HubApplication = {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

export type BackendLoginResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: string;
    platformRole: PlatformRole;
    status: string;
  };
};

type BackendRefreshResponse = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: string;
};

type ApplicationsResponse = {
  applications: HubApplication[];
};

function getBackendBaseUrl(): string {
  const configured =
    process.env.API_URL ??
    process.env.NEXT_PUBLIC_API_URL;

  if (!configured) {
    throw new Error(
      'Configuration API indisponible',
    );
  }

  return configured.replace(
    /\/+$/,
    '',
  );
}

function getCookieOptions() {
  return {
    httpOnly: true,
    secure:
      process.env.NODE_ENV ===
      'production',
    sameSite:
      'strict' as const,
    path: '/',
  };
}

export async function backendFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const normalizedPath =
    path.startsWith('/')
      ? path
      : `/${path}`;

  const headers =
    new Headers(init.headers);

  if (!headers.has('Accept')) {
    headers.set(
      'Accept',
      'application/json',
    );
  }

  return fetch(
    `${getBackendBaseUrl()}${normalizedPath}`,
    {
      ...init,
      headers,
      cache: 'no-store',
    },
  );
}

export async function readJson<T>(
  response: Response,
): Promise<T | null> {
  try {
    return await response.json() as T;
  }
  catch {
    return null;
  }
}

export async function setSessionTokens(
  accessToken: string,
  refreshToken: string,
): Promise<void> {
  const cookieStore =
    await cookies();

  const options =
    getCookieOptions();

  cookieStore.set(
    ACCESS_COOKIE,
    accessToken,
    options,
  );

  cookieStore.set(
    REFRESH_COOKIE,
    refreshToken,
    options,
  );
}

export async function clearSessionTokens():
  Promise<void> {
  const cookieStore =
    await cookies();

  const options =
    getCookieOptions();

  cookieStore.set(
    ACCESS_COOKIE,
    '',
    {
      ...options,
      maxAge: 0,
    },
  );

  cookieStore.set(
    REFRESH_COOKIE,
    '',
    {
      ...options,
      maxAge: 0,
    },
  );
}

export async function getRefreshToken():
  Promise<string | null> {
  const cookieStore =
    await cookies();

  return (
    cookieStore
      .get(REFRESH_COOKIE)
      ?.value ??
    null
  );
}

function isRefreshResponse(
  value: BackendRefreshResponse | null,
): value is BackendRefreshResponse {
  return Boolean(
    value &&
    typeof value.accessToken ===
      'string' &&
    value.accessToken.length > 0 &&
    typeof value.refreshToken ===
      'string' &&
    value.refreshToken.length > 0,
  );
}

function isSessionUser(
  value: SessionUser | null,
): value is SessionUser {
  return Boolean(
    value &&
    typeof value.userId === 'string' &&
    typeof value.email === 'string' &&
    typeof value.platformRole ===
      'string' &&
    typeof value.status === 'string',
  );
}

async function requestCurrentUser(
  accessToken: string,
): Promise<Response> {
  return backendFetch(
    '/auth/me',
    {
      headers: {
        Authorization:
          `Bearer ${accessToken}`,
      },
    },
  );
}

export async function getAuthenticatedSession():
  Promise<{
    accessToken: string;
    user: SessionUser;
  } | null> {
  const cookieStore =
    await cookies();

  const currentAccessToken =
    cookieStore
      .get(ACCESS_COOKIE)
      ?.value;

  /*
   * Tentative avec l'access token actuel.
   */
  if (currentAccessToken) {
    const meResponse =
      await requestCurrentUser(
        currentAccessToken,
      );

    if (meResponse.ok) {
      const user =
        await readJson<SessionUser>(
          meResponse,
        );

      if (!isSessionUser(user)) {
        throw new Error(
          'Contrat /auth/me invalide',
        );
      }

      return {
        accessToken:
          currentAccessToken,
        user,
      };
    }

    /*
     * Seul un 401 justifie un refresh.
     * Un 5xx ne doit pas detruire
     * une session locale valide.
     */
    if (meResponse.status !== 401) {
      throw new Error(
        'Backend auth indisponible',
      );
    }
  }

  const currentRefreshToken =
    cookieStore
      .get(REFRESH_COOKIE)
      ?.value;

  if (!currentRefreshToken) {
    await clearSessionTokens();

    return null;
  }

  const refreshResponse =
    await backendFetch(
      '/auth/refresh',
      {
        method: 'POST',
        headers: {
          'Content-Type':
            'application/json',
        },
        body: JSON.stringify({
          refreshToken:
            currentRefreshToken,
        }),
      },
    );

  if (!refreshResponse.ok) {
    /*
     * Token invalide / expire :
     * session locale supprimee.
     *
     * Un probleme serveur ou un
     * throttling temporaire ne doit
     * pas forcer une deconnexion.
     */
    if (
      refreshResponse.status === 400 ||
      refreshResponse.status === 401
    ) {
      await clearSessionTokens();

      return null;
    }

    throw new Error(
      'Renouvellement de session indisponible',
    );
  }

  const refreshed =
    await readJson<BackendRefreshResponse>(
      refreshResponse,
    );

  if (!isRefreshResponse(refreshed)) {
    await clearSessionTokens();

    return null;
  }

  /*
   * Le backend fait une rotation
   * du refresh token.
   *
   * Les deux cookies sont donc
   * remplaces ensemble.
   */
  await setSessionTokens(
    refreshed.accessToken,
    refreshed.refreshToken,
  );

  const meResponse =
    await requestCurrentUser(
      refreshed.accessToken,
    );

  if (!meResponse.ok) {
    if (meResponse.status === 401) {
      await clearSessionTokens();

      return null;
    }

    throw new Error(
      'Backend auth indisponible',
    );
  }

  const user =
    await readJson<SessionUser>(
      meResponse,
    );

  if (!isSessionUser(user)) {
    throw new Error(
      'Contrat /auth/me invalide',
    );
  }

  return {
    accessToken:
      refreshed.accessToken,
    user,
  };
}

export async function getHubApplications(
  accessToken: string,
): Promise<HubApplication[]> {
  const response =
    await backendFetch(
      '/applications/me',
      {
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
        },
      },
    );

  if (!response.ok) {
    if (response.status === 401) {
      await clearSessionTokens();
    }

    throw new Error(
      'Applications utilisateur indisponibles',
    );
  }

  const payload =
    await readJson<ApplicationsResponse>(
      response,
    );

  if (
    !payload ||
    !Array.isArray(
      payload.applications,
    )
  ) {
    throw new Error(
      'Contrat /applications/me invalide',
    );
  }

  return payload.applications;
}