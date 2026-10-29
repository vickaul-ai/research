export default async function LoginPage({searchParams}: {searchParams: Promise<{error?: string}>}) {
  const {error} = await searchParams;
  return (
    <main>
      <h1>Research</h1>
      <form method="post" action="/api/login">
        <label htmlFor="password">Password</label>
        <input id="password" name="password" type="password" autoFocus required className="password" />
        {error && <p className="error">That password didn’t match.</p>}
        <div className="row"><button className="primary" type="submit">Sign in</button></div>
      </form>
    </main>
  );
}
