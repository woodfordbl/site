import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { Separator } from "@/components/ui/separator.tsx";
import { cn } from "@/lib/utils.ts";

/** Child button chrome for {@link buttonGroupVariants} `overlay` (frosted floating toolbars). */
const overlayChildButtonClassName =
  "[&_button]:rounded-full! [&_button]:bg-transparent! [&_button]:text-muted-foreground [&_button:focus-visible]:bg-black/15! [&_button:focus-visible]:text-foreground! [&_button:hover]:bg-black/15! [&_button:hover]:text-foreground! dark:[&_button:focus-visible]:bg-white/20! dark:[&_button:hover]:bg-white/20!";

const buttonGroupVariants = cva(
  "flex w-fit items-stretch *:focus-visible:relative *:focus-visible:z-10 has-[>[data-slot=button-group]]:gap-2 has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg [&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit [&>input]:flex-1",
  {
    variants: {
      variant: {
        default: "",
        overlay: cn(
          "gap-0.5 rounded-full bg-background/50 p-0.5 shadow-sm backdrop-blur-sm",
          overlayChildButtonClassName
        ),
      },
      orientation: {
        horizontal: "",
        vertical: "flex-col",
      },
    },
    compoundVariants: [
      {
        variant: "default",
        orientation: "horizontal",
        class:
          "*:data-slot:rounded-r-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg! [&>[data-slot]~[data-slot]]:rounded-l-none [&>[data-slot]~[data-slot]]:border-l-0",
      },
      {
        variant: "default",
        orientation: "vertical",
        class:
          "*:data-slot:rounded-b-none [&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg! [&>[data-slot]~[data-slot]]:rounded-t-none [&>[data-slot]~[data-slot]]:border-t-0",
      },
    ],
    defaultVariants: {
      variant: "default",
      orientation: "horizontal",
    },
  }
);

function ButtonGroup({
  className,
  orientation,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>) {
  return (
    <div
      className={cn(buttonGroupVariants({ orientation, variant }), className)}
      data-orientation={orientation}
      data-slot="button-group"
      data-variant={variant}
      role="group"
      {...props}
    />
  );
}

function ButtonGroupText({
  className,
  render,
  ...props
}: useRender.ComponentProps<"div">) {
  return useRender({
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "flex items-center gap-2 rounded-lg border bg-muted px-2.5 font-medium text-sm [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "button-group-text",
    },
  });
}

function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn(
        "relative self-stretch bg-input data-horizontal:mx-px data-vertical:my-px data-vertical:h-auto data-horizontal:w-auto",
        className
      )}
      data-slot="button-group-separator"
      orientation={orientation}
      {...props}
    />
  );
}

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
};
