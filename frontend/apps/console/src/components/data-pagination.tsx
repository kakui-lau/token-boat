import { ChevronFirstIcon, ChevronLastIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@token-boat/ui/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@token-boat/ui/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";

type DataPaginationProps = {
  disabled?: boolean;
  onPageChange(page: number): void;
  onPageSizeChange(pageSize: number): void;
  page: number;
  pageSize: number;
  pageSizeOptions?: number[];
  total: number;
};

export function DataPagination(props: DataPaginationProps) {
  const { t } = useTranslation();
  const pageSizeOptions = props.pageSizeOptions ?? [10, 20, 50, 100];
  const totalPages = Math.max(1, Math.ceil(props.total / props.pageSize));
  const firstItem = props.total === 0 ? 0 : (props.page - 1) * props.pageSize + 1;
  const lastItem = Math.min(props.page * props.pageSize, props.total);
  const canGoBack = props.page > 1 && !props.disabled;
  const canGoForward = props.page < totalPages && !props.disabled;

  return (
    <div className="flex flex-col gap-3 border-t px-1 pt-4 sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {t("Showing {{from}}–{{to}} of {{total}} results", {
          from: firstItem,
          to: lastItem,
          total: props.total,
        })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t("Rows per page")}</span>
          <Select
            disabled={props.disabled}
            items={pageSizeOptions.map((value) => ({ label: String(value), value: String(value) }))}
            onValueChange={(value) => value && props.onPageSizeChange(Number(value))}
            value={String(props.pageSize)}
          >
            <SelectTrigger aria-label={t("Rows per page")} size="sm">
              <SelectValue>{props.pageSize}</SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                {pageSizeOptions.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <span className="min-w-20 text-center text-sm">
          {t("Page {{page}} of {{total}}", { page: props.page, total: totalPages })}
        </span>
        <Pagination aria-label={t("Pagination")} className="w-auto">
          <PaginationContent>
            <PaginationItem className="hidden sm:list-item">
              <Button
                aria-label={t("First page")}
                disabled={!canGoBack}
                onClick={() => props.onPageChange(1)}
                size="icon-sm"
                variant="outline"
              >
                <ChevronFirstIcon />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                aria-label={t("Previous page")}
                disabled={!canGoBack}
                onClick={() => props.onPageChange(props.page - 1)}
                size="icon-sm"
                variant="outline"
              >
                <ChevronLeftIcon />
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button
                aria-label={t("Next page")}
                disabled={!canGoForward}
                onClick={() => props.onPageChange(props.page + 1)}
                size="icon-sm"
                variant="outline"
              >
                <ChevronRightIcon />
              </Button>
            </PaginationItem>
            <PaginationItem className="hidden sm:list-item">
              <Button
                aria-label={t("Last page")}
                disabled={!canGoForward}
                onClick={() => props.onPageChange(totalPages)}
                size="icon-sm"
                variant="outline"
              >
                <ChevronLastIcon />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}
