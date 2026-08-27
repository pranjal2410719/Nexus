"use client";

import type { AdminUser } from "@/types/user";

interface UserTableProps {
  users: AdminUser[];
}

export function UserTable({ users }: UserTableProps) {
  if (!users || users.length === 0) {
    return <div className="matrix-empty">No users yet.</div>;
  }

  return (
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
              <td>{Array.isArray(u.slots) ? u.slots.length : 0}</td>
              <td>
                {u.createdAt
                  ? new Date(u.createdAt).toLocaleDateString()
                  : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
