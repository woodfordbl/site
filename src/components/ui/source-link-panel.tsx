"use client";

import { IconLink } from "@tabler/icons-react";
import { useForm } from "@tanstack/react-form";

import { Button } from "@/components/ui/button.tsx";
import { Field, FieldContent, FieldError } from "@/components/ui/field.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group.tsx";
import {
  parseValidatedUrlInput,
  sourceLinkFormSchema,
  sourceLinkUrlSchema,
  URL_INPUT_ERROR_MESSAGE,
} from "@/lib/schemas/url-input.ts";
import { cn } from "@/lib/utils.ts";

interface SourceLinkPanelProps {
  className?: string;
  isSubmitting?: boolean;
  onSubmit: (normalizedUrl: string) => void;
  placeholder?: string;
  submitLabel?: string;
}

function SourceLinkPanel({
  onSubmit,
  placeholder = "Paste in https://…",
  submitLabel = "Insert link",
  isSubmitting = false,
  className,
}: SourceLinkPanelProps) {
  const form = useForm({
    defaultValues: {
      url: "",
    },
    validators: {
      onBlur: sourceLinkFormSchema,
      onSubmit: sourceLinkFormSchema,
    },
    onSubmit: ({ value }) => {
      const normalized = parseValidatedUrlInput(value.url);
      if (!normalized) {
        return;
      }
      onSubmit(normalized);
      form.reset();
    },
  });

  return (
    <form
      className={cn("flex flex-col gap-2", className)}
      data-slot="source-link-panel"
      onSubmit={(event) => {
        event.preventDefault();
        form.handleSubmit();
      }}
    >
      <form.Field
        name="url"
        validators={{
          onBlur: sourceLinkUrlSchema,
          onSubmit: sourceLinkUrlSchema,
        }}
      >
        {(field) => {
          const showValidation =
            field.state.meta.isTouched || form.state.submissionAttempts > 0;
          const isInvalid = showValidation && !field.state.meta.isValid;

          return (
            <Field data-invalid={isInvalid || undefined}>
              <FieldContent>
                <InputGroup>
                  <InputGroupAddon align="inline-start">
                    <InputGroupText>
                      <IconLink aria-hidden />
                    </InputGroupText>
                  </InputGroupAddon>
                  <InputGroupInput
                    aria-invalid={isInvalid || undefined}
                    name={field.name}
                    onBlur={field.handleBlur}
                    onChange={(event) => field.handleChange(event.target.value)}
                    placeholder={placeholder}
                    value={field.state.value}
                  />
                </InputGroup>
                {isInvalid ? (
                  <FieldError>{URL_INPUT_ERROR_MESSAGE}</FieldError>
                ) : null}
              </FieldContent>
            </Field>
          );
        }}
      </form.Field>
      <form.Subscribe selector={(state) => state.values.url}>
        {(url) => (
          <Button
            className="w-full"
            disabled={isSubmitting || url.trim().length === 0}
            type="submit"
          >
            {isSubmitting ? "Loading…" : submitLabel}
          </Button>
        )}
      </form.Subscribe>
    </form>
  );
}

export { SourceLinkPanel };
