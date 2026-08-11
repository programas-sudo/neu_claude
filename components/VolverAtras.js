"use client";

import { useRouter } from "next/navigation";

export default function VolverAtras() {
  const router = useRouter();
  return (
    <button
      onClick={() => router.back()}
      className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-2"
    >
      ← Volver
    </button>
  );
}
