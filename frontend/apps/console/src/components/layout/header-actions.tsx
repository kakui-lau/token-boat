import type { PropsWithChildren } from "react";

export function HeaderActions(props: PropsWithChildren) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-1" data-slot="header-actions">
      {props.children}
    </div>
  );
}
