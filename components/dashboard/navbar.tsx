"use client";

import Link from "next/link";
import { siteConfig } from "@/config/site";
import type { PublicUser } from "@/types/user";

interface NavbarProps {
  user: PublicUser | null;
  menuOpen: boolean;
  onToggleMenu: () => void;
  sourceUrl?: string;
}

export function Navbar({
  user,
  menuOpen,
  onToggleMenu,
  sourceUrl = siteConfig.sourceUrl,
}: NavbarProps) {
  const loggedIn = !!user;

  return (
    <nav className="navbar">
      <Link href="/" className="logo-mark" aria-label="Nexus home">
        <div className="logo-sq">N</div>
        <span className="logo-text">Nexus</span>
      </Link>

      <div className="nav-links">
        <a href="/#features" className="nav-link">
          Features
        </a>
        <a href="/#schedule" className="nav-link">
          Schedule
        </a>
        <Link href="/status" className="nav-link">
          Status
        </Link>
        <a
          href={sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="nav-link"
        >
          Source ↗
        </a>
      </div>

      <div className="nav-actions">
        {loggedIn ? (
          <>
            <span className="nav-user">
              @{user.githubLogin}
              {user.isAdmin && <span className="admin-badge">ADMIN</span>}
            </span>
            {user.isAdmin && (
              <Link href="/admin" className="btn-nav-outline">
                Admin
              </Link>
            )}
            <a href="/api/auth/logout" className="btn-nav-outline">
              Log out
            </a>
            <a href="#configSection" className="btn-nav-filled">
              → Dashboard
            </a>
          </>
        ) : (
          <a href="/api/auth/start" className="btn-nav-filled">
            Continue with GitHub
          </a>
        )}
      </div>

      <button
        className={"menu-toggle" + (menuOpen ? " open" : "")}
        id="menuToggle"
        aria-label="Toggle navigation menu"
        aria-expanded={menuOpen}
        onClick={onToggleMenu}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
    </nav>
  );
}
