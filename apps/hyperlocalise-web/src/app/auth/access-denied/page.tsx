import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-[#050505] px-4 py-10 text-white">
      <Card className="w-full max-w-lg border-white/10 bg-white/[0.03] text-white shadow-2xl shadow-black/30">
        <CardHeader>
          <CardTitle className="font-heading text-2xl">Access denied</CardTitle>
          <CardDescription className="text-white/60">
            Your account is signed in, but there is no active organization membership available for
            this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm leading-6 text-white/70">
            Ask your organization admin to confirm your WorkOS organization membership, or sign out
            and retry with another account.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button render={<Link href="/auth/sign-out?returnTo=/" />}>Sign out</Button>
            <Button variant="outline" render={<Link href="/" />}>
              Back to site
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
