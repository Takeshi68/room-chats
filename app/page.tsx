"use client";

import { ChatRoom } from "@/components/chat-room";
import { useAuth } from "@/hooks/use-auth";

export default function Page() {
  const { user, isLoading, loginWithGithub } = useAuth();

  if (isLoading) {
    return (
      <div className="grid min-h-[100svh] place-items-center bg-[#0b1020] text-white">
        Loading…
      </div>
    );
  }

  if (!user) {
    // fallback apabila belum pasang middleware /signin
    return (
      <div className="grid min-h-[100svh] place-items-center bg-[#0b1020] text-white p-6">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="mb-2 text-xl font-semibold">Sign in</h1>
          <p className="mb-4 text-sm text-white/70">Use GitHub to continue.</p>
          <button
            onClick={() => loginWithGithub()}
            className="w-full rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
          >
            Continue with GitHub
          </button>
        </div>
      </div>
    );
  }

  // User sudah login → langsung ke chat
  return <ChatRoom />;
}
