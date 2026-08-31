import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { InfoIcon, ShieldCheckIcon, UserPlusIcon, UsersRoundIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Badge } from "@token-boat/ui/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@token-boat/ui/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@token-boat/ui/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@token-boat/ui/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { DataLoadError } from "@/components/data-load-error";
import { TableEmptyState } from "@/components/table-empty-state";
import { TableLoadingState } from "@/components/table-loading-state";
import { TableDateTime, TableText } from "@/components/table-value";
import type { TeamMember } from "@/data/contracts";
import { repository } from "@/data/repository";

export function TeamPage() {
  const { t, i18n } = useTranslation();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TeamMember["role"]>("developer");
  const [invitedMembers, setInvitedMembers] = useState<TeamMember[]>([]);
  const query = useQuery({ queryKey: ["team"], queryFn: () => repository.listTeamMembers() });
  const locale = i18n.resolvedLanguage ?? "zh";
  const teamManagementAvailable = repository.mode === "demo";
  const members = [...(query.data ?? []), ...(teamManagementAvailable ? invitedMembers : [])];

  const invite = () => {
    if (!teamManagementAvailable) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    setInvitedMembers((current) => [
      ...current,
      {
        id: `invite-${Date.now()}`,
        name: normalizedEmail.split("@")[0] || normalizedEmail,
        email: normalizedEmail,
        role,
        status: "invited",
        lastActiveAt: null,
      },
    ]);
    setEmail("");
    setInviteOpen(false);
    toast.success(t("Invitation sent"));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        action={
          teamManagementAvailable ? (
            <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
              <DialogTrigger render={<Button />}>
                <UserPlusIcon data-icon="inline-start" />
                {t("Invite member")}
              </DialogTrigger>
              <DialogContent closeLabel={t("Close")}>
                <DialogHeader>
                  <DialogTitle>{t("Invite team member")}</DialogTitle>
                  <DialogDescription>
                    {t("Grant the minimum role needed for this workspace.")}
                  </DialogDescription>
                </DialogHeader>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="invite-email">{t("Work email")}</FieldLabel>
                    <Input
                      id="invite-email"
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="developer@example.com"
                      type="email"
                      value={email}
                    />
                  </Field>
                  <Field>
                    <FieldLabel id="invite-role">{t("Role")}</FieldLabel>
                    <Select
                      onValueChange={(value) => setRole(value as TeamMember["role"])}
                      value={role}
                    >
                      <SelectTrigger aria-labelledby="invite-role" className="w-full">
                        <SelectValue>{t(roleLabel(role))}</SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="admin">{t("Administrator")}</SelectItem>
                          <SelectItem value="developer">{t("Developer")}</SelectItem>
                          <SelectItem value="billing">{t("Billing manager")}</SelectItem>
                          <SelectItem value="viewer">{t("Viewer")}</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                </FieldGroup>
                <DialogFooter>
                  <Button disabled={!email.trim()} onClick={invite}>
                    {t("Send invitation")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <Badge variant="outline">{t("Personal workspace")}</Badge>
          )
        }
        description={t("Manage workspace members, roles, and access boundaries.")}
        title={t("Team and access")}
      />

      {!teamManagementAvailable && (
        <Alert>
          <InfoIcon aria-hidden="true" />
          <AlertTitle>{t("Personal workspace active")}</AlertTitle>
          <AlertDescription>
            {t(
              "This backend currently uses the account owner as the access boundary. Team invitations, role assignment, and member audit will appear when workspace management is enabled.",
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>{t("Workspace members")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {teamManagementAvailable && query.isPending ? (
                <Skeleton aria-label={t("Loading")} className="h-9 w-14" />
              ) : !teamManagementAvailable || query.isError ? (
                "—"
              ) : (
                members.length
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("Active members")}</CardDescription>
            <CardTitle className="text-3xl tabular-nums">
              {teamManagementAvailable && query.isPending ? (
                <Skeleton aria-label={t("Loading")} className="h-9 w-14" />
              ) : !teamManagementAvailable || query.isError ? (
                "—"
              ) : (
                members.filter((member) => member.status === "active").length
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>{t("Security policy")}</CardDescription>
            <CardTitle>
              {t(teamManagementAvailable ? "Least privilege" : "Account owner")}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UsersRoundIcon aria-hidden="true" />
            {t("Members")}
          </CardTitle>
          <CardDescription>
            {t("Separate development, billing, and administrative responsibilities.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {query.isError ? (
            <DataLoadError
              className="min-h-64 border-0"
              description={t("Try refreshing the page or check the API connection.")}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
              title={t("Unable to load team members")}
            />
          ) : (
            <div className="rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("Member")}</TableHead>
                    <TableHead>{t("Role")}</TableHead>
                    <TableHead>{t("Status")}</TableHead>
                    <TableHead className="text-right">{t("Last active")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody aria-busy={query.isPending}>
                  {query.isPending ? <TableLoadingState colSpan={4} /> : null}
                  {!query.isPending && members.length === 0 ? (
                    <TableEmptyState
                      action={
                        teamManagementAvailable ? (
                          <Button onClick={() => setInviteOpen(true)} size="sm">
                            <UserPlusIcon data-icon="inline-start" />
                            {t("Invite member")}
                          </Button>
                        ) : undefined
                      }
                      colSpan={4}
                      description={t(
                        teamManagementAvailable
                          ? "Invite a teammate and assign the minimum required role."
                          : "The current backend does not expose a workspace member directory.",
                      )}
                      title={t(
                        teamManagementAvailable
                          ? "No team members yet"
                          : "Member directory unavailable",
                      )}
                    />
                  ) : null}
                  {members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <TableText className="max-w-64 font-medium" value={member.name} />
                        <TableText
                          className="max-w-64 text-xs text-muted-foreground"
                          value={member.email}
                        />
                      </TableCell>
                      <TableCell>{t(roleLabel(member.role))}</TableCell>
                      <TableCell>
                        <Badge variant={member.status === "active" ? "secondary" : "outline"}>
                          {t(member.status === "active" ? "Active" : "Invited")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <TableDateTime
                          fallback={t(teamManagementAvailable ? "Not yet" : "Current account")}
                          locale={locale}
                          timestamp={member.lastActiveAt}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheckIcon aria-hidden="true" />
            {t(teamManagementAvailable ? "Role boundaries" : "Planned role boundaries")}
          </CardTitle>
          <CardDescription>
            {t(
              teamManagementAvailable
                ? "Owners control the workspace; other roles receive task-specific access."
                : "These roles define the planned workspace permission model and are not active for personal workspaces.",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RoleCard
            role={t("Administrator")}
            description={t("Manage members, keys, and alerts.")}
          />
          <RoleCard
            role={t("Developer")}
            description={t("Use models, keys, logs, and Playground.")}
          />
          <RoleCard
            role={t("Billing manager")}
            description={t("Manage balance, plans, and invoices.")}
          />
          <RoleCard role={t("Viewer")} description={t("Read usage, logs, and service status.")} />
        </CardContent>
      </Card>
    </div>
  );
}

function roleLabel(role: TeamMember["role"]): string {
  const labels: Record<TeamMember["role"], string> = {
    owner: "Owner",
    admin: "Administrator",
    developer: "Developer",
    billing: "Billing manager",
    viewer: "Viewer",
  };
  return labels[role];
}

function RoleCard(props: { role: string; description: string }) {
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>{props.role}</ItemTitle>
        <ItemDescription>{props.description}</ItemDescription>
      </ItemContent>
    </Item>
  );
}
