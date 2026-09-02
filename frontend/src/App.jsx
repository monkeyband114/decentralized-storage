import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import AppLayout from "./layouts/AppLayout";
import { LoadingState } from "./components/ui";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import MyFiles from "./pages/MyFiles";
import UploadFile from "./pages/UploadFile";
import SharedWithMe from "./pages/SharedWithMe";
import FileDetails from "./pages/FileDetails";
import VerifyIntegrity from "./pages/VerifyIntegrity";
import ManageAccess from "./pages/ManageAccess";
import Blockchain from "./pages/Blockchain";
import Activity from "./pages/Activity";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminActivity from "./pages/admin/AdminActivity";
import AdminTransactions from "./pages/admin/AdminTransactions";

/**
 * Route guard.
 *
 * This only decides what the browser renders. The API re-checks the JWT and
 * the role on every request, so removing this guard in the browser would not
 * grant anyone access to data.
 */
function RequireAuth({ children, adminOnly = false }) {
  const { user, loading } = useAuth();

  if (loading) return <LoadingState label="Restoring session" />;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Loading" />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public */}
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <Login />
                </PublicOnly>
              }
            />
            <Route
              path="/register"
              element={
                <PublicOnly>
                  <Register />
                </PublicOnly>
              }
            />

            {/* Authenticated */}
            <Route
              element={
                <RequireAuth>
                  <AppLayout />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/files" element={<MyFiles />} />
              <Route path="/files/:id" element={<FileDetails />} />
              <Route path="/files/:id/verify" element={<VerifyIntegrity />} />
              <Route path="/files/:id/access" element={<ManageAccess />} />
              <Route path="/upload" element={<UploadFile />} />
              <Route path="/shared" element={<SharedWithMe />} />
              <Route path="/verify" element={<VerifyIntegrity />} />
              <Route path="/blockchain" element={<Blockchain />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/profile" element={<Profile />} />

              {/* Administrator */}
              <Route
                path="/admin"
                element={
                  <RequireAuth adminOnly>
                    <AdminDashboard />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/users"
                element={
                  <RequireAuth adminOnly>
                    <AdminUsers />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/activity"
                element={
                  <RequireAuth adminOnly>
                    <AdminActivity />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin/transactions"
                element={
                  <RequireAuth adminOnly>
                    <AdminTransactions />
                  </RequireAuth>
                }
              />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
