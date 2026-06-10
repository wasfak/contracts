"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignInButton, SignUpButton, UserButton } from "@clerk/nextjs";
import { useAuth } from "@clerk/nextjs";
import { Upload, Search, Home, LayoutDashboard } from "lucide-react";

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/upload", label: "Upload", icon: Upload },
  { href: "/search", label: "Search", icon: Search },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];

export default function Navbar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();

  return (
    <header className=" flex justify-center pt-4 px-4 pointer-events-none">
      <nav className="pointer-events-auto flex items-center justify-between gap-4 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 shadow-lg shadow-black/10 backdrop-blur-md w-full max-w-2xl">
        {/* Brand */}
        <span className="text-sm font-bold tracking-tight text-zinc-800 whitespace-nowrap">
          Pharmacy Reports
        </span>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
                  active
                    ? "bg-zinc-900 text-white shadow-sm"
                    : "text-zinc-600 hover:bg-white/60 hover:text-zinc-900"
                }`}
              >
                <Icon size={14} strokeWidth={2} />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Auth */}
        <div className="flex items-center gap-2">
          {isSignedIn ? (
            <UserButton />
          ) : (
            <>
              <SignInButton>
                <button className="rounded-xl px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-white/60 hover:text-zinc-900 transition-all duration-150">
                  Sign in
                </button>
              </SignInButton>
              <SignUpButton>
                <button className="rounded-xl bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 transition-all duration-150">
                  Sign up
                </button>
              </SignUpButton>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
