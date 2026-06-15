const steps = [
  "Telegram bot receives PDF, image, or screenshot in a private chat or group.",
  "Vercel webhook validates the secret token and accepted chat ids.",
  "The function downloads the Telegram file, uploads it to private Blob storage, and writes metadata to Postgres.",
  "Later OCR, duplicate review, and confirmation flows can promote the file into VAT evidence or bank ledger records.",
];

export default function HomePage() {
  return (
    <main>
      <div className="shell">
        <section className="hero">
          <span className="badge">Vercel + Telegram + Free Postgres</span>
          <h1>Tax Refund Intake Server</h1>
          <p>
            This scaffold is built for the HACCP workflow where files arrive through Telegram, are archived in
            Blob storage, and become searchable records in a structured database instead of local CSV files.
          </p>
          <code className="code">POST /api/telegram/webhook</code>
        </section>

        <section className="grid">
          <article className="panel">
            <h2>What is ready</h2>
            <ul className="list">
              <li>Telegram webhook endpoint</li>
              <li>Private Blob upload for source files</li>
              <li>Postgres-ready insert flow</li>
              <li>Schema for source files, VAT evidence, and bank transactions</li>
            </ul>
          </article>
          <article className="panel">
            <h2>Recommended DB</h2>
            <p>
              Use Supabase or Neon with a standard <code>DATABASE_URL</code>. Both fit the current schema and
              Vercel deployment style well.
            </p>
          </article>
        </section>

        <section className="panel">
          <h2>Webhook flow</h2>
          <ol className="list">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
