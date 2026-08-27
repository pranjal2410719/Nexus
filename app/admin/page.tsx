"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Loader } from "@/components/ui/loader";
import { UserTable } from "@/components/admin/user-table";
import type { AdminUser } from "@/types/user";

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
        <Link href="/" className="logo-mark" aria-label="Nexus home">
          <div className="logo-sq">N</div>
          <span className="logo-text">Nexus</span>
        </Link>

        <div className="nav-actions">
          <Link href="/" className="btn-nav-outline">
            ← Back to Dashboard
          </Link>
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
              <UserTable users={users} />
            </div>
          )}
        </section>
      </main>

      <footer>
        <span>Nexus — Open Source Commit Engine</span>
        <span>Admin panel · read-only</span>
        <Link href="/">Dashboard ↗</Link>
      </footer>
    </div>
  );
}
