/** Shown when the app was built without Supabase settings (.env missing). */
export function SetupMissingPage() {
  return (
    <div className="app">
      <div className="page">
        <div className="banner warn">Приложението още не е свързано с база данни.</div>
        <div className="card stack">
          <h2>За администратора</h2>
          <p style={{ margin: 0 }}>
            Копирайте <span className="code">.env.example</span> като <span className="code">.env</span> и попълнете
            адреса и ключа на Supabase проекта. Подробни стъпки има в <span className="code">docs/SETUP.md</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
