import { useEffect, useState } from "react";
import type { PortalUserPublic } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function AccountsPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<PortalUserPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setUsers((await portalApi.users()).users);
    setError(null);
  }

  useEffect(() => {
    void load().catch((err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Could not load accounts.");
    });
  }, []);

  async function setSuspended(id: string, suspended: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await portalApi.suspendUser(id, suspended);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function setRole(id: string, role: "USER" | "ADMIN") {
    setBusyId(id);
    setError(null);
    try {
      await portalApi.setUserRole(id, role);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page marketplace">
      <header className="page-head">
        <p className="eyebrow">Admin</p>
        <h1>Accounts</h1>
        <p className="lead">Portal users: role, last login, suspend, or promote.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Last login</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.displayName}</td>
              <td className="mono">{user.email || "—"}</td>
              <td>{user.role}</td>
              <td className="mono muted small">{user.lastLoginAt || "—"}</td>
              <td>{user.suspended ? "Suspended" : "Active"}</td>
              <td className="row-actions">
                {user.id !== me?.id ? (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busyId === user.id}
                    onClick={() => void setSuspended(user.id, !user.suspended)}
                  >
                    {user.suspended ? "Restore" : "Suspend"}
                  </button>
                ) : null}
                <button
                  className="btn btn-ghost"
                  type="button"
                  disabled={busyId === user.id}
                  onClick={() => void setRole(user.id, user.role === "ADMIN" ? "USER" : "ADMIN")}
                >
                  {user.role === "ADMIN" ? "Demote" : "Promote"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
