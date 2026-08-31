import { useTranslation } from "react-i18next";

import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { TableCell, TableRow } from "@token-boat/ui/components/ui/table";

type TableLoadingStateProps = {
  colSpan: number;
  rows?: number;
};

export function TableLoadingState(props: TableLoadingStateProps) {
  const { t } = useTranslation();
  const rowCount = props.rows ?? 3;

  return Array.from({ length: rowCount }).map((_, index) => (
    <TableRow aria-label={t("Loading")} key={index}>
      <TableCell colSpan={props.colSpan}>
        <Skeleton className="h-5 w-full max-w-3xl" />
      </TableCell>
    </TableRow>
  ));
}
