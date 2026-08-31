import { useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarClockIcon,
  Clock3Icon,
  LaptopIcon,
  LogOutIcon,
  NetworkIcon,
  ShieldCheckIcon,
  XIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@token-boat/ui/components/ui/alert-dialog";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@token-boat/ui/components/ui/empty";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from "@token-boat/ui/components/ui/item";
import { Separator } from "@token-boat/ui/components/ui/separator";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@token-boat/ui/components/ui/sheet";
import type { LoginSessionRecord } from "@/data/contracts";
import { DataPagination } from "@/components/data-pagination";
import { formatDateTime } from "@/lib/format";

type SessionManagementCardProps = {
  locale: string;
  onRevoke(id: string): void;
  onRevokeOthers(): void;
  pending: boolean;
  sessions: LoginSessionRecord[];
};

export function SessionManagementCard(props: SessionManagementCardProps) {
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [requestedPage, setRequestedPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const selectedSession = props.sessions.find((session) => session.id === selectedId) ?? null;
  const otherSessionCount = props.sessions.filter((session) => !session.current).length;
  const totalPages = Math.max(1, Math.ceil(props.sessions.length / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const visibleSessions = props.sessions.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t("Active sessions")}</CardTitle>
          <CardDescription>
            {t("Review devices that currently have access to your account.")}
          </CardDescription>
          {otherSessionCount > 0 && (
            <CardAction>
              <RevokeOtherSessionsDialog
                count={otherSessionCount}
                disabled={props.pending}
                onConfirm={props.onRevokeOthers}
              />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {props.sessions.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <LaptopIcon aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>{t("No active sessions found")}</EmptyTitle>
                <EmptyDescription>
                  {t("Refresh the page or sign in again to restore the current session record.")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {visibleSessions.map((session) => {
                const deviceDescription = describeUserAgent(session.userAgent);
                const device =
                  deviceDescription === "Unknown device" ? t("Unknown device") : deviceDescription;
                return (
                  <Item className="items-start sm:items-center" key={session.id} variant="outline">
                    <ItemMedia className="size-10 rounded-lg bg-muted" variant="icon">
                      <LaptopIcon aria-hidden="true" className="size-4" />
                    </ItemMedia>
                    <ItemContent>
                      <ItemTitle>
                        {device}
                        {session.current && <Badge variant="secondary">{t("Current")}</Badge>}
                      </ItemTitle>
                      <ItemDescription>
                        {t(loginMethodLabel(session.method))} · {session.ip || t("IP unavailable")}{" "}
                        · {formatDateTime(session.lastActiveAt, props.locale)}
                      </ItemDescription>
                    </ItemContent>
                    <ItemActions className="ml-auto">
                      <Button
                        aria-label={t("View {{device}} session details", { device })}
                        onClick={() => setSelectedId(session.id)}
                        size="sm"
                        variant="outline"
                      >
                        {t("View details")}
                      </Button>
                      {!session.current && (
                        <RevokeSessionDialog
                          device={device}
                          disabled={props.pending}
                          onConfirm={() => props.onRevoke(session.id)}
                        />
                      )}
                    </ItemActions>
                  </Item>
                );
              })}
              {props.sessions.length > pageSize && (
                <DataPagination
                  disabled={props.pending}
                  onPageChange={setRequestedPage}
                  onPageSizeChange={(value) => {
                    setPageSize(value);
                    setRequestedPage(1);
                  }}
                  page={page}
                  pageSize={pageSize}
                  pageSizeOptions={[10, 20, 50]}
                  total={props.sessions.length}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <SessionDetailsSheet
        locale={props.locale}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
        onRevoke={(id) => {
          props.onRevoke(id);
          setSelectedId(null);
        }}
        pending={props.pending}
        session={selectedSession}
      />
    </>
  );
}

function SessionDetailsSheet(props: {
  locale: string;
  onOpenChange(open: boolean): void;
  onRevoke(id: string): void;
  pending: boolean;
  session: LoginSessionRecord | null;
}) {
  const { t } = useTranslation();
  const session = props.session;
  const deviceDescription = session ? describeUserAgent(session.userAgent) : "";
  const device = deviceDescription === "Unknown device" ? t("Unknown device") : deviceDescription;

  return (
    <Sheet open={session !== null} onOpenChange={props.onOpenChange}>
      <SheetContent
        className="w-full data-[side=right]:sm:max-w-lg"
        showCloseButton={false}
        side="right"
      >
        <SheetClose
          render={
            <Button
              aria-label={t("Close")}
              className="absolute top-3 right-3"
              size="icon-sm"
              variant="ghost"
            />
          }
        >
          <XIcon />
        </SheetClose>
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2 pr-10">
            <SheetTitle>{t("Session details")}</SheetTitle>
            {session?.current && <Badge variant="secondary">{t("Current session")}</Badge>}
          </div>
          <SheetDescription>
            {t("Inspect when and how this device accessed your account.")}
          </SheetDescription>
        </SheetHeader>

        {session && (
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4">
            <div className="rounded-xl border p-4">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <LaptopIcon aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-medium">{device}</div>
                  <div className="mt-1 break-all text-xs text-muted-foreground">
                    {session.userAgent || t("User agent unavailable")}
                  </div>
                </div>
              </div>
            </div>

            <dl className="rounded-xl border px-4">
              <SessionDetailRow
                icon={<ShieldCheckIcon aria-hidden="true" />}
                label={t("Sign-in method")}
                value={t(loginMethodLabel(session.method))}
              />
              <SessionDetailRow
                icon={<NetworkIcon aria-hidden="true" />}
                label={t("IP address")}
                value={session.ip || t("IP unavailable")}
              />
              <SessionDetailRow
                icon={<CalendarClockIcon aria-hidden="true" />}
                label={t("Signed in")}
                value={formatDateTime(session.createdAt, props.locale)}
              />
              <SessionDetailRow
                icon={<Clock3Icon aria-hidden="true" />}
                label={t("Last active")}
                value={formatDateTime(session.lastActiveAt, props.locale)}
              />
              <SessionDetailRow
                icon={<CalendarClockIcon aria-hidden="true" />}
                label={t("Session expires")}
                value={formatDateTime(session.expiresAt, props.locale)}
              />
              <SessionDetailRow
                icon={<ShieldCheckIcon aria-hidden="true" />}
                label={t("Session ID")}
                mono
                value={session.id}
              />
            </dl>
          </div>
        )}

        {session && !session.current && (
          <SheetFooter>
            <RevokeSessionDialog
              device={device}
              disabled={props.pending}
              fullWidth
              onConfirm={() => props.onRevoke(session.id)}
            />
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SessionDetailRow(props: {
  icon: ReactNode;
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <div className="last:[&_[data-slot=separator]]:hidden">
      <div className="grid gap-1 py-3 sm:grid-cols-[150px_minmax(0,1fr)] sm:items-start">
        <dt className="flex items-center gap-2 text-muted-foreground [&_svg]:size-4">
          {props.icon}
          {props.label}
        </dt>
        <dd className={props.mono ? "break-all font-mono text-xs" : "break-words"}>
          {props.value || "—"}
        </dd>
      </div>
      <Separator />
    </div>
  );
}

function RevokeSessionDialog(props: {
  device: string;
  disabled: boolean;
  fullWidth?: boolean;
  onConfirm(): void;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button
            aria-label={t("Sign out {{device}}", { device: props.device })}
            className={props.fullWidth ? "w-full" : undefined}
            disabled={props.disabled}
            size={props.fullWidth ? "default" : "icon-sm"}
            variant={props.fullWidth ? "destructive" : "ghost"}
          />
        }
      >
        <LogOutIcon data-icon="inline-start" />
        {props.fullWidth && t("Sign out this session")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <LogOutIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{t("Sign out this session?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("{{device}} will need to authenticate again before accessing the console.", {
              device: props.device,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm} variant="destructive">
            {t("Sign out")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RevokeOtherSessionsDialog(props: { count: number; disabled: boolean; onConfirm(): void }) {
  const { t } = useTranslation();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button disabled={props.disabled} size="sm" variant="outline" />}>
        <LogOutIcon data-icon="inline-start" />
        {t("Sign out other sessions")}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <LogOutIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>{t("Sign out all other sessions?")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("{{count}} other sessions will be signed out. This current session stays active.", {
              count: props.count,
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm} variant="destructive">
            {t("Sign out other sessions")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function describeUserAgent(userAgent: string): string {
  const normalized = userAgent.trim();
  if (!normalized) return "Unknown device";
  if (!normalized.includes("Mozilla/")) return normalized;

  let browser = "Browser";
  if (/Edg\//.test(normalized)) browser = "Microsoft Edge";
  else if (/(Chrome|CriOS)\//.test(normalized)) browser = "Chrome";
  else if (/Firefox\//.test(normalized)) browser = "Firefox";
  else if (/Safari\//.test(normalized)) browser = "Safari";

  let device = "Unknown device";
  if (/iPhone/.test(normalized)) device = "iPhone";
  else if (/iPad/.test(normalized)) device = "iPad";
  else if (/Android/.test(normalized)) device = "Android";
  else if (/Windows/.test(normalized)) device = "Windows";
  else if (/(Macintosh|Mac OS X)/.test(normalized)) device = "macOS";
  else if (/Linux/.test(normalized)) device = "Linux";

  return `${browser} · ${device}`;
}

function loginMethodLabel(method: string): string {
  const normalized = method.trim().toLowerCase();
  if (normalized === "passkey") return "Passkey";
  if (normalized === "password") return "Password";
  if (normalized === "oauth") return "OAuth";
  if (normalized === "github") return "GitHub OAuth";
  if (normalized === "discord") return "Discord OAuth";
  if (normalized === "oidc") return "OIDC";
  return method || "Unknown";
}
