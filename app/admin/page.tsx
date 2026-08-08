"use client";

import { useEffect, useState } from "react";
import { Loader } from "../components/loader";

interface AdminUser {
  githubLogin: string;
  owner: string;
  repo: string;
  targetFile: string;
  timezone: string;
  slots: { time: string; count: number }[];
  createdAt: string;
  updatedAt: string;
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [granted, setGranted] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const meRes = await fetch("/api/me");
        const meData = await meRes.json();
        if (!meRes.ok || !meData.user?.isAdmin) {
          setError("Access denied — this area is reserved for the admin account.");
          return;
        }
        setGranted(true);
        const res = await fetch("/api/admin/users");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load users");
        setUsers((data.users || []) as AdminUser[]);
      } catch (err: any) {
        setError(err.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="wrap">
      {loading && <Loader label="Loading admin panel…" />}

      <nav className="navbar">
        <a href="/" className="logo-mark" aria-label="Nexus home">
          <div className="logo-sq">N</div>
          <span className="logo-text">Nexus</span>
        </a>

        <div className="nav-actions">
          <a href="/" className="btn-nav-outline">
            ← Back to Dashboard
          </a>
        </div>
      </nav>

      <main>
        <section>
          <div className="section-label">Admin · Registered Users</div>

          {error && <div className="flash err">{error}</div>}

          {granted && !error && (
            <div className="panel">
              <h2>All Users ({users.length})</h2>
              <p className="panel-note">
                Read-only directory of everyone signed in. Tokens stay encrypted
                at rest and are never exposed.
              </p>
              {users.length === 0 ? (
                <div className="matrix-empty">No users yet.</div>
              ) : (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Repo</th>
                        <th>Target file</th>
                        <th>Timezone</th>
                        <th>Slots</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((u) => (
                        <tr key={u.githubLogin}>
                          <td>@{u.githubLogin}</td>
                          <td>{u.repo ? `${u.owner}/${u.repo}` : "—"}</td>
                          <td>{u.targetFile}</td>
                          <td>{u.timezone}</td>
                          <td>{u.slots.length}</td>
                          <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>
      </main>

      <footer>
        <span>Nexus — Open Source Commit Engine</span>
        <span>Admin panel · read-only</span>
        <a href="/">Dashboard ↗</a>
      </footer>
    </div>
  );
}
