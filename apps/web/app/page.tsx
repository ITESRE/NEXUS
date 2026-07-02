'use client';

import { useEffect, useState } from 'react';

type ApiHealth = {
  status: string;
  app: string;
  timestamp: string;
};

export default function Home() {
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error('Erreur lors de l’appel API');
        }

        return response.json();
      })
      .then((data) => setApiHealth(data))
      .catch(() => setError('Impossible de contacter le backend'));
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-8">
      <div className="max-w-xl w-full rounded-2xl bg-slate-900 border border-slate-800 p-8 shadow-xl">
        <p className="text-sm text-blue-400 mb-2">NEXUS</p>

        <h1 className="text-3xl font-bold mb-4">
          Réseau social interne
        </h1>

        <p className="text-slate-300 mb-6">
          Frontend Next.js opérationnel. Test de communication avec le backend NestJS.
        </p>

        <div className="rounded-xl bg-slate-800 p-4">
          <p className="font-semibold mb-2">État de l’API :</p>

          {apiHealth && (
            <div className="text-green-400">
              API connectée : {apiHealth.app} — {apiHealth.status}
            </div>
          )}

          {error && (
            <div className="text-red-400">
              {error}
            </div>
          )}

          {!apiHealth && !error && (
            <div className="text-slate-400">
              Chargement...
            </div>
          )}
        </div>
      </div>
    </main>
  );
}