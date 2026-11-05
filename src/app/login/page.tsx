export default function Login() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold text-white">Sign in to FonectaGuard</h1>
      <p className="mt-2 text-sm text-zinc-400">Production sign-in (OAuth) is not configured in this build. Continue with the demo workspace: a fictional business and simulated directory listings.</p>
      <form action="/api/auth/demo" method="post" className="mt-6">
        <button className="btn btn-primary w-full" type="submit">Continue to demo workspace</button>
      </form>
    </main>
  );
}
