'use client';

import {
  useEffect,
  useState,
} from 'react';
import type {
  FormEvent,
  PointerEvent,
} from 'react';

type PlatformRole =
  | 'USER'
  | 'ADMIN'
  | 'SUPER_ADMIN';

type SessionUser = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  platformRole: PlatformRole;
  status: string;
};

type HubApplication = {
  key: string;
  name: string;
  description: string | null;
  sortOrder: number;
};

type BootstrapResponse = {
  authenticated: boolean;
  user: SessionUser;
  applications: HubApplication[];
};

type UiState =
  | 'loading'
  | 'anonymous'
  | 'authenticated'
  | 'error';

type BootstrapFetchResult =
  | {
      kind: 'anonymous';
    }
  | {
      kind: 'authenticated';
      data: BootstrapResponse;
    };

async function fetchBootstrapData():
  Promise<BootstrapFetchResult> {
  const response =
    await fetch(
      '/api/bootstrap',
      {
        method: 'GET',
        cache: 'no-store',
      },
    );

  if (response.status === 401) {
    return {
      kind: 'anonymous',
    };
  }

  if (!response.ok) {
    throw new Error(
      'Bootstrap indisponible',
    );
  }

  const data =
    await response.json() as
      BootstrapResponse;

  if (
    data.authenticated !== true ||
    !data.user ||
    !Array.isArray(
      data.applications,
    )
  ) {
    throw new Error(
      'Contrat bootstrap invalide',
    );
  }

  return {
    kind:
      'authenticated',
    data,
  };
}

function getRoleLabel(
  role: PlatformRole,
): string {
  switch (role) {
    case 'SUPER_ADMIN':
      return 'Super administrateur';

    case 'ADMIN':
      return 'Administrateur';

    default:
      return 'Utilisateur';
  }
}

function getApplicationInitials(
  name: string,
): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) =>
      part.charAt(0),
    )
    .join('')
    .toUpperCase();
}

export default function Home() {
  const [
    uiState,
    setUiState,
  ] =
    useState<UiState>(
      'loading',
    );

  const [
    user,
    setUser,
  ] =
    useState<SessionUser | null>(
      null,
    );

  const [
    applications,
    setApplications,
  ] =
    useState<HubApplication[]>(
      [],
    );

  const [
    email,
    setEmail,
  ] =
    useState('');

  const [
    password,
    setPassword,
  ] =
    useState('');

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const [
    submitting,
    setSubmitting,
  ] =
    useState(false);

  async function loadBootstrap() {
    try {
      const result =
        await fetchBootstrapData();

      setError(null);

      if (
        result.kind ===
        'anonymous'
      ) {
        setUser(null);
        setApplications([]);
        setUiState(
          'anonymous',
        );

        return;
      }

      setUser(
        result.data.user,
      );

      setApplications(
        result.data.applications,
      );

      setUiState(
        'authenticated',
      );
    }
    catch {
      setUiState(
        'error',
      );

      setError(
        'Impossible de charger NEXUS pour le moment.',
      );
    }
  }

  useEffect(
    () => {
      let cancelled =
        false;

      /*
       * fetchBootstrapData est pure vis-a-vis
       * de React : elle ne modifie aucun state.
       *
       * Les changements d'etat sont executes
       * uniquement dans les callbacks asynchrones
       * de la Promise.
       */
      void fetchBootstrapData()
        .then(
          (result) => {
            if (cancelled) {
              return;
            }

            setError(null);

            if (
              result.kind ===
              'anonymous'
            ) {
              setUser(null);
              setApplications([]);
              setUiState(
                'anonymous',
              );

              return;
            }

            setUser(
              result.data.user,
            );

            setApplications(
              result.data.applications,
            );

            setUiState(
              'authenticated',
            );
          },
        )
        .catch(
          () => {
            if (cancelled) {
              return;
            }

            setUiState(
              'error',
            );

            setError(
              'Impossible de charger NEXUS pour le moment.',
            );
          },
        );

      return () => {
        cancelled =
          true;
      };
    },
    [],
  );

  async function handleLogin(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response =
        await fetch(
          '/api/auth/login',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              email,
              password,
            }),
          },
        );

      const payload =
        await response.json() as {
          message?: string;
        };

      if (!response.ok) {
        setError(
          payload.message ??
          'Connexion impossible.',
        );

        return;
      }

      /*
       * Le navigateur ne lit jamais
       * les tokens.
       *
       * On recharge la session depuis
       * les cookies HttpOnly et le CORE.
       */
      setPassword('');

      await loadBootstrap();
    }
    catch {
      setError(
        'Le service NEXUS est indisponible.',
      );
    }
    finally {
      setSubmitting(false);
    }
  }

  async function handleLogout() {
    if (submitting) {
      return;
    }

    setSubmitting(true);

    try {
      await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
        },
      );
    }
    finally {
      setUser(null);
      setApplications([]);
      setPassword('');
      setUiState(
        'anonymous',
      );
      setSubmitting(false);
    }
  }

  function handlePointerMove(
    event:
      PointerEvent<HTMLElement>,
  ) {
    const bounds =
      event.currentTarget
        .getBoundingClientRect();

    const relativeX =
      (
        event.clientX -
        bounds.left
      ) /
      bounds.width -
      0.5;

    const relativeY =
      (
        event.clientY -
        bounds.top
      ) /
      bounds.height -
      0.5;

    event.currentTarget
      .style
      .setProperty(
        '--pointer-x',
        `${relativeX * 22}px`,
      );

    event.currentTarget
      .style
      .setProperty(
        '--pointer-y',
        `${relativeY * 22}px`,
      );
  }

  return (
    <main
      className="nexus-shell"
      onPointerMove={
        handlePointerMove
      }
    >
      <div
        className="nexus-grid"
        aria-hidden="true"
      />

      <span
        className="nexus-orbit"
        aria-hidden="true"
      />

      <span
        className="nexus-orbit"
        aria-hidden="true"
      />

      <span
        className="nexus-orbit"
        aria-hidden="true"
      />

      <span
        className="nexus-orbit"
        aria-hidden="true"
      />

      {uiState ===
        'loading' && (
        <section className="flex min-h-screen items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto mb-6 h-12 w-12 animate-pulse rounded-2xl border border-blue-400/30 bg-blue-400/10 shadow-[0_0_40px_rgba(59,130,246,0.16)]" />

            <p className="text-sm tracking-[0.28em] text-slate-400 uppercase">
              Initialisation NEXUS
            </p>
          </div>
        </section>
      )}

      {uiState ===
        'error' && (
        <section className="flex min-h-screen items-center justify-center px-6">
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/70 p-8 text-center shadow-2xl backdrop-blur-xl">
            <p className="mb-2 text-xs font-semibold tracking-[0.25em] text-blue-400 uppercase">
              NEXUS
            </p>

            <h1 className="text-2xl font-semibold text-white">
              Service momentanément indisponible
            </h1>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              {error}
            </p>

            <button
              type="button"
              onClick={() => {
                setUiState(
                  'loading',
                );

                void loadBootstrap();
              }}
              className="mt-7 w-full rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
            >
              Réessayer
            </button>
          </div>
        </section>
      )}

      {uiState ===
        'anonymous' && (
        <section className="mx-auto grid min-h-screen w-full max-w-7xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.2fr_0.8fr] lg:px-10">
          <div className="max-w-2xl">
            <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-blue-400/20 bg-blue-400/5 px-4 py-2 text-xs font-semibold tracking-[0.2em] text-blue-300 uppercase">
              <span className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_14px_rgba(96,165,250,0.9)]" />
              Portail interne
            </div>

            <p className="text-sm font-semibold tracking-[0.32em] text-slate-500 uppercase">
              NEXUS
            </p>

            <h1 className="mt-4 max-w-xl text-5xl font-semibold tracking-[-0.04em] text-white sm:text-6xl">
              Votre espace de travail centralisé.
            </h1>

            <p className="mt-6 max-w-xl text-base leading-8 text-slate-400">
              Un seul accès pour retrouver les applications,
              outils et services qui vous sont autorisés.
            </p>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-slate-950/60 p-6 shadow-[0_35px_100px_rgba(0,0,0,0.45)] backdrop-blur-2xl sm:p-8">
            <div className="mb-8">
              <p className="text-xs font-semibold tracking-[0.2em] text-blue-400 uppercase">
                Connexion
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-white">
                Accéder à NEXUS
              </h2>

              <p className="mt-2 text-sm leading-6 text-slate-400">
                Utilisez votre compte professionnel.
              </p>
            </div>

            <form
              onSubmit={
                handleLogin
              }
              className="space-y-5"
            >
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Adresse email
                </span>

                <input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3.5 text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/60 focus:ring-4 focus:ring-blue-400/10"
                  placeholder="prenom.nom@entreprise.fr"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-300">
                  Mot de passe
                </span>

                <input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={
                    password
                  }
                  onChange={(event) =>
                    setPassword(
                      event.target.value,
                    )
                  }
                  className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3.5 text-white outline-none transition focus:border-blue-400/60 focus:ring-4 focus:ring-blue-400/10"
                />
              </label>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-400/15 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  submitting
                }
                className="w-full rounded-xl bg-white px-4 py-3.5 text-sm font-semibold text-slate-950 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting
                  ? 'Connexion...'
                  : 'Se connecter'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs leading-5 text-slate-600">
              Les jetons de session ne sont jamais exposés au JavaScript du navigateur.
            </p>
          </div>
        </section>
      )}

      {uiState ===
        'authenticated' &&
        user && (
        <section className="mx-auto min-h-screen w-full max-w-7xl px-6 py-8 lg:px-10">
          <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-7 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.28em] text-blue-400 uppercase">
                NEXUS
              </p>

              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-white">
                Hub applicatif
              </h1>
            </div>

            <div className="flex items-center gap-4">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-white">
                  {user.firstName}{' '}
                  {user.lastName}
                </p>

                <p className="mt-0.5 text-xs text-slate-500">
                  {getRoleLabel(
                    user.platformRole,
                  )}
                </p>
              </div>

              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-sm font-semibold text-slate-200">
                {getApplicationInitials(
                  `${user.firstName} ${user.lastName}`,
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={
                  submitting
                }
                className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-sm text-slate-300 transition hover:border-white/20 hover:bg-white/[0.08] hover:text-white disabled:opacity-50"
              >
                Déconnexion
              </button>
            </div>
          </header>

          <div className="py-12">
            <div className="mb-9 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm text-slate-500">
                  Bonjour {user.firstName},
                </p>

                <h2 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-white">
                  Vos applications
                </h2>
              </div>

              <p className="max-w-md text-sm leading-6 text-slate-500">
                Seules les applications auxquelles votre compte a accès sont affichées.
              </p>
            </div>

            {applications.length >
              0 ? (
              <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {applications.map(
                  (
                    application,
                  ) => (
                    <article
                      key={
                        application.key
                      }
                      className="group relative overflow-hidden rounded-3xl border border-white/[0.08] bg-white/[0.035] p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-blue-400/25 hover:bg-white/[0.055]"
                    >
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-blue-400/35 to-transparent opacity-0 transition group-hover:opacity-100" />

                      <div className="flex items-start justify-between gap-6">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-400/15 bg-blue-400/[0.08] text-sm font-bold tracking-wider text-blue-200">
                          {getApplicationInitials(
                            application.name,
                          )}
                        </div>

                        <span className="rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-3 py-1 text-[11px] font-medium text-emerald-300">
                          Accès autorisé
                        </span>
                      </div>

                      <h3 className="mt-7 text-xl font-semibold text-white">
                        {application.name}
                      </h3>

                      <p className="mt-3 min-h-12 text-sm leading-6 text-slate-400">
                        {application.description ??
                          'Application NEXUS'}
                      </p>

                      <div className="mt-7 border-t border-white/[0.06] pt-5">
                        <p className="text-xs text-slate-600">
                          {application.key}
                        </p>
                      </div>
                    </article>
                  ),
                )}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-white/10 bg-white/[0.025] px-8 py-14 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-lg text-slate-500">
                  0
                </div>

                <h3 className="mt-5 text-lg font-medium text-white">
                  Aucune application disponible
                </h3>

                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
                  Votre compte est actif, mais aucun accès applicatif ne lui a encore été attribué.
                </p>
              </div>
            )}
          </div>

          {(user.platformRole ===
            'ADMIN' ||
            user.platformRole ===
              'SUPER_ADMIN') && (
            <aside className="mb-10 rounded-2xl border border-blue-400/10 bg-blue-400/[0.035] px-5 py-4">
              <p className="text-sm text-blue-100">
                Les fonctions d’administration CORE seront ajoutées dans le prochain lot.
              </p>
            </aside>
          )}
        </section>
      )}
    </main>
  );
}