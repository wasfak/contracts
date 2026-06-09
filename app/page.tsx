import Link from "next/link";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50">
      <h1 className="text-3xl font-bold text-zinc-900">Pharmacy Reports</h1>
      <div className="flex gap-4">
        <Link
          href="/upload"
          className="rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white hover:bg-zinc-700 transition"
        >
          Upload Report
        </Link>
        <Link
          href="/search"
          className="rounded-lg border border-zinc-300 bg-white px-6 py-3 text-sm font-semibold text-zinc-800 hover:bg-zinc-100 transition"
        >
          Search Products
        </Link>
      </div>
    </div>
  );
}
