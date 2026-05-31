"use client";

import type { ComponentProps, ReactNode } from "react";
import { useActionState, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import Image from "next/image";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldContent, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { TypographyP } from "@/components/ui/typography";
import { slugifyOrganizationName } from "@/lib/onboarding/slugify-organization-name";

import type { CreateWorkspaceActionState } from "../actions";
import { createWorkspaceAction } from "../actions";

function SubmitButton({
  children,
  ...props
}: ComponentProps<typeof Button> & { children: ReactNode }) {
  const { pending } = useFormStatus();

  return (
    <Button className="w-full" disabled={pending} size="lg" {...props}>
      {children}
    </Button>
  );
}

export function OnboardingWizard() {
  const [organizationName, setOrganizationName] = useState("");
  const [state, formAction] = useActionState<CreateWorkspaceActionState, FormData>(
    createWorkspaceAction,
    {},
  );
  const organizationNameId = useId();
  const derivedSlug = slugifyOrganizationName(organizationName);

  return (
    <main className="dark flex min-h-svh items-center justify-center bg-background px-4 py-10 text-foreground">
      <Card className="w-full max-w-sm border-border/80 bg-card">
        <CardContent className="space-y-7 p-6 sm:p-8">
          <div className="space-y-4 text-center">
            <Image
              src="/images/logo.png"
              width={40}
              height={40}
              sizes="40px"
              alt="Hyperlocalise logo"
              className="mx-auto size-10 rounded-xl"
            />
            <h1 className="font-heading text-xl font-semibold text-foreground">
              Create your workspace
            </h1>
            <TypographyP className="text-sm leading-6 text-muted-foreground">
              Your workspace holds projects, team access, and settings. Choose a name to get
              started.
            </TypographyP>
          </div>

          <form action={formAction} className="space-y-6">
            {state.error ? (
              <Alert variant="destructive">
                <AlertDescription>{state.error}</AlertDescription>
              </Alert>
            ) : null}

            <Field>
              <FieldContent className="gap-3">
                <FieldLabel htmlFor={organizationNameId}>Workspace name</FieldLabel>
                <Input
                  id={organizationNameId}
                  name="organizationName"
                  placeholder="Acme localisation"
                  value={organizationName}
                  onChange={(event) => setOrganizationName(event.target.value)}
                  aria-invalid={Boolean(state.fieldErrors?.organizationName)}
                  className="h-11"
                  autoFocus
                />
                <p className="pt-0.5 text-sm leading-relaxed text-muted-foreground">
                  <span className="text-foreground/70">Workspace URL </span>
                  <span className="font-mono text-foreground">/org/{derivedSlug}</span>
                </p>
                <FieldError>{state.fieldErrors?.organizationName}</FieldError>
              </FieldContent>
            </Field>

            <SubmitButton nativeButton type="submit">
              Create workspace
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
