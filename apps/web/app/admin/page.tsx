'use client';

import Link from 'next/link';

import {
  useEffect,
  useMemo,
  useState,
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
  platformRole: PlatformRole;
  status: string;
};

type AdminUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  platformRole: PlatformRole;
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

type UserApplication =
  AdminApplication & {
    hasAccess: boolean;
    grantedAt: string | null;
  };

type AdminBootstrap = {
  authenticated: true;
  user: SessionUser;
  users: AdminUser[];
  applications: AdminApplication[];
};

type UserApplicationsPayload = {
  user: {
    id: string;
    platformRole: PlatformRole;
    status: string;
  };
  applications: UserApplication[];
};

type PageState =
  | 'loading'
  | 'ready'
  | 'unauthorized'
  | 'forbidden'
  | 'error';

type AccessState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error';

type BootstrapResult =
  | {
      kind: 'ready';
      data: AdminBootstrap;
    }
  | {
      kind: 'unauthorized';
    }
  | {
      kind: 'forbidden';
    };

async function fetchBootstrap():
  Promise<BootstrapResult> {
  const response =
    await fetch(
      '/api/admin/bootstrap',
      {
        method: 'GET',
        cache: 'no-store',
      },
    );

  if (response.status === 401) {
    return {
      kind: 'unauthorized',
    };
  }

  if (response.status === 403) {
    return {
      kind: 'forbidden',
    };
  }

  if (!response.ok) {
    throw new Error(
      'Administration indisponible',
    );
  }

  const data =
    await response.json() as
      AdminBootstrap;

  if (
    !data ||
    data.authenticated !== true ||
    !Array.isArray(data.users) ||
    !Array.isArray(
      data.applications,
    )
  ) {
    throw new Error(
      'Contrat admin invalide',
    );
  }

  return {
    kind: 'ready',
    data,
  };
}

async function fetchUserApplications(
  userId: string,
): Promise<UserApplicationsPayload> {
  const response =
    await fetch(
      `/api/admin/user-applications?userId=${encodeURIComponent(
        userId,
      )}`,
      {
        method: 'GET',
        cache: 'no-store',
      },
    );

  if (response.status === 401) {
    throw new Error(
      'SESSION_EXPIRED',
    );
  }

  if (!response.ok) {
    throw new Error(
      'Accès utilisateur indisponibles',
    );
  }

  const data =
    await response.json() as
      UserApplicationsPayload;

  if (
    !data ||
    !data.user ||
    !Array.isArray(
      data.applications,
    )
  ) {
    throw new Error(
      'Contrat accès invalide',
    );
  }

  return data;
}

function roleLabel(
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

function statusLabel(
  status: string,
): string {
  return status === 'ACTIVE'
    ? 'Actif'
    : status === 'DISABLED'
      ? 'Désactivé'
      : status;
}

export default function AdminPage() {
  const [
    state,
    setState,
  ] =
    useState<PageState>(
      'loading',
    );

  const [
    data,
    setData,
  ] =
    useState<AdminBootstrap | null>(
      null,
    );

  const [
    selectedUserId,
    setSelectedUserId,
  ] =
    useState<string | null>(
      null,
    );

  const [
    selectedAccess,
    setSelectedAccess,
  ] =
    useState<UserApplicationsPayload | null>(
      null,
    );

  const [
    accessState,
    setAccessState,
  ] =
    useState<AccessState>(
      'idle',
    );

  const [
    search,
    setSearch,
  ] =
    useState('');

  useEffect(() => {
    let cancelled =
      false;

    void fetchBootstrap()
      .then((result) => {
        if (cancelled) {
          return;
        }

        if (
          result.kind ===
          'unauthorized'
        ) {
          setState(
            'unauthorized',
          );
          return;
        }

        if (
          result.kind ===
          'forbidden'
        ) {
          setState(
            'forbidden',
          );
          return;
        }

        setData(
          result.data,
        );

        setState(
          'ready',
        );
      })
      .catch(() => {
        if (!cancelled) {
          setState(
            'error',
          );
        }
      });

    return () => {
      cancelled =
        true;
    };
  }, []);

  const filteredUsers =
    useMemo(() => {
      if (!data) {
        return [];
      }

      const query =
        search
          .trim()
          .toLocaleLowerCase(
            'fr',
          );

      if (!query) {
        return data.users;
      }

      return data.users.filter(
        (user) => {
          const haystack =
            [
              user.firstName,
              user.lastName,
              user.email,
              user.platformRole,
              user.status,
            ]
              .join(' ')
              .toLocaleLowerCase(
                'fr',
              );

          return haystack.includes(
            query,
          );
        },
      );
    }, [
      data,
      search,
    ]);

  const selectedUser =
    data?.users.find(
      (user) =>
        user.id ===
        selectedUserId,
    ) ?? null;

  async function selectUser(
    user: AdminUser,
  ) {
    setSelectedUserId(
      user.id,
    );

    setSelectedAccess(
      null,
    );

    setAccessState(
      'loading',
    );

    try {
      const result =
        await fetchUserApplications(
          user.id,
        );

      setSelectedAccess(
        result,
      );

      setAccessState(
        'ready',
      );
    }
    catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          'SESSION_EXPIRED'
      ) {
        setState(
          'unauthorized',
        );

        return;
      }

      setAccessState(
        'error',
      );
    }
  }

  if (
    state === 'loading'
  ) {
    return (
      <main className="min-h-screen bg-[#07090d] text-white">
        <div className="mx-auto flex min-h-screen max-w-7xl items-center justify-center px-6">
          <p className="text-sm text-slate-400">
            Chargement de l’administration CORE…
          </p>
        </div>
      </main>
    );
  }

  if (
    state === 'unauthorized'
  ) {
    return (
      <main className="min-h-screen bg-[#07090d] text-white">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold">
            Session expirée
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Reconnectez-vous pour accéder à l’administration NEXUS.
          </p>

          <Link
            href="/"
            className="mt-7 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-medium transition hover:bg-white/[0.1]"
          >
            Retour à NEXUS
          </Link>
        </div>
      </main>
    );
  }

  if (
    state === 'forbidden'
  ) {
    return (
      <main className="min-h-screen bg-[#07090d] text-white">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold">
            Accès refusé
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Cette zone est réservée aux administrateurs CORE.
          </p>

          <Link
            href="/"
            className="mt-7 rounded-xl border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-medium transition hover:bg-white/[0.1]"
          >
            Retour au HUB
          </Link>
        </div>
      </main>
    );
  }

  if (
    state === 'error' ||
    !data
  ) {
    return (
      <main className="min-h-screen bg-[#07090d] text-white">
        <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <h1 className="text-2xl font-semibold">
            Administration indisponible
          </h1>

          <p className="mt-3 text-sm leading-6 text-slate-400">
            Impossible de charger les données CORE pour le moment.
          </p>

          <Link
            href="/admin"
            className="mt-7 rounded-xl border border-blue-400/20 bg-blue-400/[0.08] px-5 py-3 text-sm font-medium text-blue-100 transition hover:bg-blue-400/[0.12]"
          >
            Réessayer
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07090d] text-white">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-[8%] top-[10%] h-72 w-72 rounded-full bg-blue-500/[0.06] blur-3xl" />
        <div className="absolute bottom-[10%] right-[8%] h-96 w-96 rounded-full bg-indigo-500/[0.05] blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 py-8 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-white/[0.07] pb-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-3">
              <Link
                href="/"
                className="text-sm text-slate-500 transition hover:text-white"
              >
                NEXUS
              </Link>

              <span className="text-slate-700">
                /
              </span>

              <span className="text-sm text-blue-200">
                Administration CORE
              </span>
            </div>

            <h1 className="text-3xl font-semibold tracking-tight">
              Utilisateurs & accès
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Consultation centralisée des comptes NEXUS et de leurs autorisations applicatives.
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-3 text-right">
            <p className="text-sm font-medium">
              {data.user.firstName}{' '}
              {data.user.lastName}
            </p>

            <p className="mt-1 text-xs text-slate-500">
              {roleLabel(
                data.user.platformRole,
              )}
            </p>
          </div>
        </header>

        <section className="mb-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Utilisateurs
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {data.users.length}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Applications CORE
            </p>

            <p className="mt-2 text-3xl font-semibold">
              {data.applications.length}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
              Mode
            </p>

            <p className="mt-2 text-lg font-semibold text-blue-100">
              {data.user.platformRole ===
              'SUPER_ADMIN'
                ? 'Super administration'
                : 'Lecture administrateur'}
            </p>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0e14]/90">
            <div className="border-b border-white/[0.07] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    Comptes CORE
                  </h2>

                  <p className="mt-1 text-xs text-slate-500">
                    Sélectionnez un utilisateur pour consulter ses accès.
                  </p>
                </div>

                <input
                  type="search"
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Rechercher…"
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-4 py-2.5 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-blue-400/30 sm:w-64"
                />
              </div>
            </div>

            <div className="max-h-[620px] overflow-y-auto">
              {filteredUsers.length ===
              0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Aucun utilisateur trouvé.
                </div>
              ) : (
                filteredUsers.map(
                  (user) => {
                    const selected =
                      selectedUserId ===
                      user.id;

                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() =>
                          void selectUser(
                            user,
                          )
                        }
                        className={`flex w-full items-center justify-between gap-4 border-b border-white/[0.05] px-5 py-4 text-left transition last:border-b-0 ${
                          selected
                            ? 'bg-blue-400/[0.08]'
                            : 'hover:bg-white/[0.035]'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">
                            {user.firstName}{' '}
                            {user.lastName}
                          </p>

                          <p className="mt-1 truncate text-xs text-slate-500">
                            {user.email}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="text-[11px] font-medium text-blue-200">
                            {roleLabel(
                              user.platformRole,
                            )}
                          </span>

                          <span
                            className={`text-[11px] ${
                              user.status ===
                              'ACTIVE'
                                ? 'text-emerald-300'
                                : 'text-amber-300'
                            }`}
                          >
                            {statusLabel(
                              user.status,
                            )}
                          </span>
                        </div>
                      </button>
                    );
                  },
                )
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-[#0b0e14]/90">
            <div className="border-b border-white/[0.07] p-5">
              <h2 className="text-lg font-semibold">
                Accès applicatifs
              </h2>

              {selectedUser ? (
                <p className="mt-1 truncate text-xs text-slate-500">
                  {selectedUser.email}
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">
                  Aucun utilisateur sélectionné
                </p>
              )}
            </div>

            {!selectedUser && (
              <div className="flex min-h-72 items-center justify-center p-8 text-center text-sm leading-6 text-slate-500">
                Choisissez un compte dans la liste pour afficher sa matrice d’accès.
              </div>
            )}

            {selectedUser &&
              accessState ===
                'loading' && (
                <div className="flex min-h-72 items-center justify-center p-8 text-sm text-slate-500">
                  Chargement des accès…
                </div>
              )}

            {selectedUser &&
              accessState ===
                'error' && (
                <div className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
                  <p className="text-sm text-rose-300">
                    Impossible de charger les accès de cet utilisateur.
                  </p>

                  <button
                    type="button"
                    onClick={() =>
                      void selectUser(
                        selectedUser,
                      )
                    }
                    className="mt-4 rounded-lg border border-white/[0.08] px-4 py-2 text-xs text-slate-300 transition hover:bg-white/[0.04]"
                  >
                    Réessayer
                  </button>
                </div>
              )}

            {selectedUser &&
              accessState ===
                'ready' &&
              selectedAccess && (
                <div>
                  <div className="border-b border-white/[0.05] px-5 py-4">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-blue-400/15 bg-blue-400/[0.05] px-3 py-1 text-[11px] text-blue-200">
                        {roleLabel(
                          selectedUser.platformRole,
                        )}
                      </span>

                      <span
                        className={`rounded-full border px-3 py-1 text-[11px] ${
                          selectedUser.status ===
                          'ACTIVE'
                            ? 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300'
                            : 'border-amber-400/15 bg-amber-400/[0.05] text-amber-300'
                        }`}
                      >
                        {statusLabel(
                          selectedUser.status,
                        )}
                      </span>
                    </div>
                  </div>

                  <div>
                    {selectedAccess.applications.map(
                      (application) => (
                        <div
                          key={
                            application.key
                          }
                          className="border-b border-white/[0.05] px-5 py-4 last:border-b-0"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-100">
                                {
                                  application.name
                                }
                              </p>

                              <p className="mt-1 text-xs text-slate-600">
                                {
                                  application.key
                                }
                              </p>
                            </div>

                            <span
                              className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-medium ${
                                application.hasAccess
                                  ? 'border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-300'
                                  : 'border-white/[0.08] bg-white/[0.025] text-slate-500'
                              }`}
                            >
                              {application.hasAccess
                                ? 'Autorisé'
                                : 'Non attribué'}
                            </span>
                          </div>

                          {!application.enabled && (
                            <p className="mt-3 text-xs text-amber-300/80">
                              Application désactivée globalement.
                            </p>
                          )}

                          {application.hasAccess &&
                            application.grantedAt && (
                              <p className="mt-3 text-[11px] text-slate-600">
                                Attribution enregistrée le{' '}
                                {new Date(
                                  application.grantedAt,
                                ).toLocaleString(
                                  'fr-FR',
                                )}
                              </p>
                            )}
                        </div>
                      ),
                    )}
                  </div>

                  {data.user.platformRole ===
                    'ADMIN' && (
                    <div className="border-t border-blue-400/10 bg-blue-400/[0.035] p-4">
                      <p className="text-xs leading-5 text-blue-100/80">
                        Votre rôle ADMIN permet la consultation. L’attribution et la révocation des accès sont réservées aux SUPER_ADMIN.
                      </p>
                    </div>
                  )}

                  {data.user.platformRole ===
                    'SUPER_ADMIN' && (
                    <div className="border-t border-blue-400/10 bg-blue-400/[0.035] p-4">
                      <p className="text-xs leading-5 text-blue-100/80">
                        Les contrôles de modification SUPER_ADMIN seront ajoutés dans le prochain lot après validation de cette vue.
                      </p>
                    </div>
                  )}
                </div>
              )}
          </div>
        </section>
      </div>
    </main>
  );
}