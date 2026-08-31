import { InboxIcon } from "lucide-react";

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import { TableCell, TableRow } from "@token-boat/ui/components/ui/table";

type TableEmptyStateProps = {
  colSpan: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
};

export function TableEmptyState(props: TableEmptyStateProps) {
  return (
    <TableRow className="hover:bg-transparent" data-slot="table-empty-state">
      <TableCell className="h-56 p-0 whitespace-normal" colSpan={props.colSpan}>
        <Empty className="min-h-56 rounded-none border-0 px-6 py-10">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <InboxIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{props.title}</EmptyTitle>
            {props.description ? <EmptyDescription>{props.description}</EmptyDescription> : null}
          </EmptyHeader>
          {props.action ? <EmptyContent>{props.action}</EmptyContent> : null}
        </Empty>
      </TableCell>
    </TableRow>
  );
}
