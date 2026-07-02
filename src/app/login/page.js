"use client";

import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Lock, LogIn, Phone } from "lucide-react";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginView />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || "No pudimos iniciar sesion.");
        return;
      }

      const next = searchParams.get("next");
      window.location.href = next && data.user?.role === "super_admin" ? next : data.redirectTo;
    } catch {
      setError("No pudimos conectar con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LoginView
      phone={phone}
      password={password}
      error={error}
      loading={loading}
      onPhoneChange={setPhone}
      onPasswordChange={setPassword}
      onSubmit={handleSubmit}
    />
  );
}

function LoginView({
  phone = "",
  password = "",
  error = "",
  loading = false,
  onPhoneChange = () => {},
  onPasswordChange = () => {},
  onSubmit = () => {},
}) {
  return (
    <section className="login-page">
      <div className="login-card">
        <div className="login-logo-wrap">
          <Image
            src="/diablito-logo.png"
            alt="El Diablito"
            width={124}
            height={124}
            priority
            className="login-logo"
          />
        </div>
        <h1>El Diablito</h1>
        <p>Acceso interno</p>

        <form className="login-form" onSubmit={onSubmit}>
          <label className="login-field">
            <span>Telefono</span>
            <div>
              <Phone size={18} />
              <input
                inputMode="numeric"
                autoComplete="tel"
                value={phone}
                onChange={(event) => onPhoneChange(event.target.value)}
                placeholder="10 digitos"
                maxLength={14}
                required
              />
            </div>
          </label>

          <label className="login-field">
            <span>PIN</span>
            <div>
              <Lock size={18} />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="4 digitos"
                maxLength={4}
                required
              />
            </div>
          </label>

          {error && <p className="login-error">{error}</p>}

          <button className="login-submit" type="submit" disabled={loading}>
            <LogIn size={18} />
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </section>
  );
}
