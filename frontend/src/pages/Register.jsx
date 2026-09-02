import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Field, inputClass } from "../components/ui";
import AuthShell from "./AuthShell";

/** Mirrors the password policy enforced by the API. */
function passwordIssues(password) {
  const issues = [];
  if (password.length < 8) issues.push("at least 8 characters");
  if (!/[A-Za-z]/.test(password)) issues.push("one letter");
  if (!/[0-9]/.test(password)) issues.push("one number");
  return issues;
}

export default function Register() {
  const { register } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const issues = passwordIssues(form.password);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (issues.length) {
      setError(`Password must contain ${issues.join(", ")}.`);
      return;
    }
    if (form.password !== form.confirm) {
      setError("The passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      toast("Account created. A wallet address has been assigned to you.", "success");
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Create an account"
      subtitle="You will be assigned a wallet address for on-chain records."
      footer={
        <>
          Already registered?{" "}
          <Link to="/login" className="font-medium text-cyan-400 hover:text-cyan-300">
            Sign in
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

        <Field label="Full name">
          <input
            required
            minLength={2}
            className={inputClass}
            placeholder="Michael Adeyemi"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>

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

        <Field
          label="Password"
          hint={
            form.password && issues.length
              ? `Still needs: ${issues.join(", ")}`
              : "Minimum 8 characters, including a letter and a number."
          }
        >
          <input
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
        </Field>

        <Field label="Confirm password">
          <input
            type="password"
            required
            autoComplete="new-password"
            className={inputClass}
            placeholder="••••••••"
            value={form.confirm}
            onChange={(e) => setForm({ ...form, confirm: e.target.value })}
          />
        </Field>

        <Button type="submit" loading={loading} className="mt-1 w-full">
          Create account
        </Button>
      </form>
    </AuthShell>
  );
}
