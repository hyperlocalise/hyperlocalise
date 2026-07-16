"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { NavbarView } from "./navbar-view";

export default function Navbar() {
  const { user, loading } = useAuth();

  return (
    <NavbarView
      auth={{
        loading,
        isAuthenticated: Boolean(user),
      }}
    />
  );
}
