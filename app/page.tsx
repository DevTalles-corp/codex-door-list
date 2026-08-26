export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-16">
      <section className="w-full max-w-3xl text-center">
        <h1 className="text-balance text-5xl font-semibold tracking-[-0.04em] sm:text-7xl">
          Código Abierto 2026
        </h1>
        <time
          className="mt-8 block text-lg text-slate-600 sm:text-xl"
          dateTime="2026-10-18T19:00:00-04:00"
        >
          18 de octubre de 2026 · 19:00
        </time>
        <p className="mt-2 text-lg text-slate-600 sm:text-xl">
          Teatro Nuna · La Paz
        </p>
        <button
          className="mt-10 rounded-full bg-slate-950 px-8 py-4 text-base font-semibold text-white transition-colors hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700"
          type="button"
        >
          Regístrame
        </button>
      </section>
    </main>
  );
}
