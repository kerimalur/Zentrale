'use client';
import { useState } from 'react';

export default function Login() {
  const [passwort, setPasswort] = useState('');
  const [code, setCode] = useState('');
  const [codeNoetig, setCodeNoetig] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laedt, setLaedt] = useState(false);

  async function anmelden(e: React.FormEvent) {
    e.preventDefault();
    setLaedt(true);
    setFehler(null);
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ passwort, code: codeNoetig ? code : undefined }), credentials: 'same-origin' });
      const j = await res.json().catch(() => ({}));
      if (j.codeNoetig) {
        setCodeNoetig(true);
        if (code) setCode('');
        if (!codeNoetig) { setLaedt(false); return; } // erster Schritt: Passwort stimmt, jetzt Code abfragen
      }
      if (!res.ok) throw new Error(j.fehler || 'Anmeldung fehlgeschlagen');
      location.href = '/';
    } catch (err) {
      setFehler((err as Error).message);
      setLaedt(false);
    }
  }

  return (
    <main className="login">
      <form className="login-karte pop" onSubmit={anmelden}>
        <div>
          <div className="leise" style={{ fontSize: 14 }}>homelabkerim</div>
          <h1 className="titel" style={{ fontSize: 44 }}>Zentrale<span style={{ color: 'var(--accent)' }}>.</span></h1>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600 }}>
          Passwort
          <input type="password" autoComplete="current-password" value={passwort} onChange={(e) => setPasswort(e.target.value)} autoFocus={!codeNoetig} required readOnly={codeNoetig} />
        </label>
        {codeNoetig && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 14, fontWeight: 600 }}>
            Code aus der Authenticator-App
            <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus required maxLength={12} placeholder="123456" style={{ letterSpacing: '.2em', fontSize: 20 }} />
            <span className="leise" style={{ fontSize: 12, fontWeight: 400 }}>Kein Handy da? Ein Notfall-Code geht auch (z. B. ABCDE-FGHIJ).</span>
          </label>
        )}
        {fehler && <div className="fehlerbox">{fehler}</div>}
        <button className="press knopf-akzent" type="submit" disabled={laedt} style={{ minHeight: 48, fontSize: 16 }}>{laedt ? 'Melde an …' : codeNoetig ? 'Bestätigen' : 'Anmelden'}</button>
      </form>
    </main>
  );
}
