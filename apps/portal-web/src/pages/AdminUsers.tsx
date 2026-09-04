import { useEffect, useState } from "react";
import type { PortalUserPublic } from "@lifeos-portal/shared";
import { ApiError, portalApi } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<PortalUserPublic[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh() {
    const data = await portalApi.adminUsers();
    setUsers(data.users);
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => {
      setError(err instanceof ApiError ? err.message : "Could not load users.");
    });
  }, []);

  async function setSuspended(id: string, suspended: boolean) {
    setBusyId(id);
    setError(null);
    try {
      await portalApi.adminSuspendUser(id, suspended);
      await refresh();
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
      await portalApi.adminSetRole(id, role);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <p className="eyebrow">directory</p>
        <h1>User management</h1>
        <p className="lead">View, suspend, and promote local LifeOS accounts.</p>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.displayName}</td>
              <td className="mono">{user.email || "—"}</td>
              <td>{user.role}</td>
              <td>{user.suspended ? "Suspended" : "Active"}</td>
              <td>
                <div className="actions">
                  {user.id !== me?.id ? (
                    <button
                      type="button"
                      className="linkish"
                      disabled={busyId === user.id}
                      onClick={() => void setSuspended(user.id, !user.suspended)}
                    >
                      {user.suspended ? "Restore" : "Suspend"}
                    </button>
                  ) : null}
                  {user.role === "ADMIN" ? (
                    <button
                      type="button"
                      className="linkish"
                      disabled={busyId === user.id}
                      onClick={() => void setRole(user.id, "USER")}
                    >
                      Demote
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="linkish"
                      disabled={busyId === user.id}
                      onClick={() => void setRole(user.id, "ADMIN")}
                    >
                      Promote
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
