import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Field, inputClass } from "../components/ui";
import AuthShell from "./AuthShell";

export default function Login() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(form.email, form.password);
      toast(`Signed in in ${result.durationMs} ms`, "success");
      navigate("/dashboard");
    } catch (err) {
      // The API deliberately returns the same message for an unknown email and
      // a wrong password, so the form cannot be used to discover accounts.
      setError(err.message || "Invalid email or password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Sign in"
      subtitle="Access your encrypted, blockchain-verified storage."
      footer={
        <>
          Need an account?{" "}
          <Link to="/register" className="font-medium text-cyan-400 hover:text-cyan-300">
            Create one
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <Field label="Email address">
          <input
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            placeholder="you@example.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Button type="submit" loading={loading} className="mt-1 w-full">
          Sign in
        </Button>
      </form>
    </AuthShell>
  );
}
