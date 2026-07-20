import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login, register } from "../api";

const DEMO_ACCOUNTS = [
  { label: "Alice", email: "alice@demo.com", color: "#6366f1" },
  { label: "Bob", email: "bob@demo.com", color: "#0ea5e9" },
  { label: "Charlie", email: "charlie@demo.com", color: "#14b8a6" },
];
const DEMO_PASSWORD = "DemoPass123!";

export default function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function authenticate(loginEmail: string, loginPassword: string) {
    setLoading(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(loginEmail, loginPassword);
      } else {
        await register(username, loginEmail, loginPassword);
      }
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to authenticate");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    await authenticate(email, password);
  }

  async function quickLogin(demoEmail: string) {
    setEmail(demoEmail);
    setPassword(DEMO_PASSWORD);
    setMode("login");
    await authenticate(demoEmail, DEMO_PASSWORD);
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo">FC</div>
          <div>
            <h1>Flick Chat</h1>
            <p className="auth-tagline">
              {mode === "login" ? "Sign in to continue messaging" : "Create your account"}
            </p>
          </div>
        </div>

        {error ? <div className="error">{error}</div> : null}

        <form onSubmit={onSubmit} className="auth-form">
          {mode === "register" ? (
            <div className="field">
              <label htmlFor="username">Username</label>
              <input
                id="username"
                placeholder="Your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
          ) : null}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Please wait..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <button
          className="btn secondary"
          type="button"
          style={{ width: "100%", marginTop: 14 }}
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "Need an account? Register" : "Already have an account? Sign in"}
        </button>

        {mode === "login" ? (
          <>
            <div className="divider">or try a demo</div>
            <div className="demo-box">
              <p>Quick login — no signup needed</p>
              <div className="demo-buttons">
                {DEMO_ACCOUNTS.map((account) => (
                  <button
                    key={account.email}
                    className="btn secondary"
                    type="button"
                    disabled={loading}
                    onClick={() => quickLogin(account.email)}
                    style={{ borderColor: account.color, color: account.color }}
                  >
                    {account.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
