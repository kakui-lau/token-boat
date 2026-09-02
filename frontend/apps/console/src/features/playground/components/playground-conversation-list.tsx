import {
  HardDriveIcon,
  LoaderCircleIcon,
  MessageSquareIcon,
  PlusIcon,
  Trash2Icon,
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
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@token-boat/ui/components/ui/alert-dialog";
import { Button } from "@token-boat/ui/components/ui/button";
import { ScrollArea } from "@token-boat/ui/components/ui/scroll-area";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { cn } from "@token-boat/ui/lib/utils";
import type { PlaygroundConversation } from "@/data/contracts";

type PlaygroundConversationListProps = {
  activeId: string | null;
  canCreate: boolean;
  conversations: PlaygroundConversation[];
  creating: boolean;
  deletingId: string | null;
  loading: boolean;
  onCreate(): void;
  onCreateIntent(): void;
  onDelete(id: string): void;
  onSelect(conversation: PlaygroundConversation): void;
};

export function PlaygroundConversationList({
  activeId,
  canCreate,
  conversations,
  creating,
  deletingId,
  loading,
  onCreate,
  onCreateIntent,
  onDelete,
  onSelect,
}: PlaygroundConversationListProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const formatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between gap-3 border-b p-4">
        <div>
          <h2 className="text-sm font-semibold">{t("Conversations")}</h2>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <HardDriveIcon className="size-3" aria-hidden="true" />
            {t("Saved in this browser")}
          </p>
        </div>
        <Button
          aria-label={t("New chat")}
          disabled={!canCreate || creating}
          onClick={onCreate}
          onFocus={onCreateIntent}
          onPointerEnter={onCreateIntent}
          size="icon-sm"
        >
          {creating ? (
            <LoaderCircleIcon className="animate-spin" aria-hidden="true" />
          ) : (
            <PlusIcon aria-hidden="true" />
          )}
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1.5 p-2.5">
          {loading ? (
            Array.from({ length: 5 }, (_, index) => (
              <Skeleton className="h-16 w-full rounded-xl" key={index} />
            ))
          ) : conversations.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center px-5 text-center">
              <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquareIcon className="size-5" aria-hidden="true" />
              </span>
              <p className="text-sm font-medium">{t("No conversations yet")}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("Start a chat and its history will appear here.")}
              </p>
            </div>
          ) : (
            conversations.map((conversation) => {
              const active = conversation.id === activeId;
              return (
                <div
                  className={cn(
                    "group relative rounded-xl border border-transparent transition-colors",
                    active ? "border-primary/20 bg-primary/8" : "hover:bg-muted/60",
                  )}
                  key={conversation.id}
                >
                  <button
                    aria-current={active ? "page" : undefined}
                    className="flex w-full min-w-0 flex-col gap-1 rounded-xl px-3 py-2.5 pr-10 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelect(conversation)}
                    type="button"
                  >
                    <span className="w-full truncate text-sm font-medium">
                      {conversation.title || t("Untitled conversation")}
                    </span>
                    <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span className="truncate">{conversation.model}</span>
                      <time dateTime={new Date(conversation.updatedAt * 1000).toISOString()}>
                        {formatter.format(conversation.updatedAt * 1000)}
                      </time>
                    </span>
                  </button>

                  <AlertDialog>
                    <AlertDialogTrigger
                      aria-label={t("Delete {{title}}", {
                        title: conversation.title || t("Untitled conversation"),
                      })}
                      className={cn(
                        "absolute top-2 right-2 flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100",
                        deletingId === conversation.id && "opacity-100",
                      )}
                    >
                      {deletingId === conversation.id ? (
                        <LoaderCircleIcon className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Trash2Icon className="size-3.5" aria-hidden="true" />
                      )}
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("Delete this conversation?")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("Its messages will be permanently removed from this browser.")}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={deletingId === conversation.id}>
                          {t("Cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          disabled={deletingId === conversation.id}
                          onClick={() => onDelete(conversation.id)}
                          variant="destructive"
                        >
                          {t("Delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
