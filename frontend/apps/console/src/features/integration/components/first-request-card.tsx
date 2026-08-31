import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ClipboardIcon, KeyRoundIcon, PencilIcon, TriangleAlertIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Skeleton } from "@token-boat/ui/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@token-boat/ui/components/ui/tabs";
import type { ApiKeyRecord } from "@/data/contracts";
import { repository } from "@/data/repository";
import { ApiKeyEditDialog } from "@/features/api-keys/components/api-key-edit-dialog";
import { copyText } from "@/lib/clipboard";

type CodeLanguage = "curl" | "typescript" | "python";

export function FirstRequestCard(props: { baseUrl: string | null }) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [language, setLanguage] = useState<CodeLanguage>("curl");
  const [requestedKeyId, setRequestedKeyId] = useState<number | null>(null);
  const [requestedModel, setRequestedModel] = useState("");
  const [editingKeyId, setEditingKeyId] = useState<number | null>(null);
  const keys = useQuery({ queryKey: ["api-keys"], queryFn: () => repository.listApiKeys() });
  const keysUnavailable = keys.isError && keys.data === undefined;
  const activeKeys = (keys.data ?? []).filter((apiKey) => apiKey.status === "active");
  const selectedKey =
    activeKeys.find((apiKey) => apiKey.id === requestedKeyId) ?? activeKeys[0] ?? null;
  const selectedGroup = selectedKey?.group ?? null;
  const models = useQuery({
    enabled: selectedKey !== null,
    queryKey: ["playground-models", selectedGroup],
    queryFn: () => repository.listPlaygroundModels(selectedGroup ?? ""),
  });
  const modelsUnavailable = models.isError && models.data === undefined;
  const permittedModels = (models.data ?? []).filter(
    (model) => !selectedKey?.allowedModels.length || selectedKey.allowedModels.includes(model.id),
  );
  const selectedModel =
    permittedModels.find((model) => model.id === requestedModel)?.id ??
    permittedModels[0]?.id ??
    "";
  const examples = buildCodeExamples(props.baseUrl ?? "YOUR_BASE_URL/v1", selectedModel);
  const canCopy = Boolean(props.baseUrl && selectedKey && selectedModel);
  const editingKey = activeKeys.find((apiKey) => apiKey.id === editingKeyId) ?? null;
  const updateKey = useMutation({
    mutationFn: repository.updateApiKey,
    onSuccess: (result) => {
      setEditingKeyId(null);
      queryClient.setQueryData<ApiKeyRecord[]>(["api-keys"], (current) =>
        current?.map((apiKey) => (apiKey.id === result.id ? result : apiKey)),
      );
      toast.success(t("API key settings updated"));
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
        queryClient.invalidateQueries({ queryKey: ["overview"] }),
        queryClient.invalidateQueries({ queryKey: ["onboarding"] }),
      ]);
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t("Unable to update API key")),
  });

  const copyCode = async () => {
    if (!canCopy) return;
    try {
      await copyText(examples[language]);
      toast.success(t("Code copied"));
    } catch {
      toast.error(t("Unable to copy code"));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("First request")}</CardTitle>
        <CardDescription>
          {t("Choose an active API key and one of its permitted models to generate exact code.")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {keys.isPending ? (
          <Skeleton className="h-24" />
        ) : keysUnavailable ? (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>{t("Unable to load API keys")}</AlertTitle>
            <AlertDescription>
              {t("Refresh the page before generating integration code.")}
            </AlertDescription>
          </Alert>
        ) : activeKeys.length === 0 ? (
          <Alert>
            <KeyRoundIcon aria-hidden="true" />
            <AlertTitle>{t("An active API key is required")}</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{t("Create or enable a key before generating production-ready code.")}</span>
              <Button nativeButton={false} render={<Link to="/api-keys" />} size="sm">
                {t("Manage API keys")}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field>
              <FieldLabel id="integration-api-key">{t("API key")}</FieldLabel>
              <Select
                onValueChange={(value) => {
                  if (!value) return;
                  setRequestedKeyId(Number(value));
                  setRequestedModel("");
                }}
                value={selectedKey ? String(selectedKey.id) : ""}
              >
                <SelectTrigger aria-labelledby="integration-api-key" className="w-full">
                  <SelectValue>{selectedKey?.name}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {activeKeys.map((apiKey) => (
                      <SelectItem key={apiKey.id} value={String(apiKey.id)}>
                        {apiKey.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {selectedKey && (
                <div className="flex min-h-7 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <code>{selectedKey.maskedKey}</code>
                    <Badge variant="outline">{selectedKey.group}</Badge>
                  </span>
                  <Button onClick={() => setEditingKeyId(selectedKey.id)} size="xs" variant="ghost">
                    <PencilIcon data-icon="inline-start" />
                    {t("Edit settings")}
                  </Button>
                </div>
              )}
            </Field>

            <Field data-disabled={models.isPending || undefined}>
              <FieldLabel id="integration-model">{t("Model")}</FieldLabel>
              <Select
                disabled={models.isPending || permittedModels.length === 0}
                onValueChange={(value) => value && setRequestedModel(value)}
                value={selectedModel}
              >
                <SelectTrigger aria-labelledby="integration-model" className="w-full">
                  <SelectValue>{selectedModel || t("No permitted models")}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {permittedModels.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                {models.isPending
                  ? t("Loading models…")
                  : t("Models are filtered by the selected key's group and allowlist.")}
              </FieldDescription>
            </Field>
          </FieldGroup>
        )}

        {modelsUnavailable && selectedKey && (
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>{t("Unable to load permitted models")}</AlertTitle>
            <AlertDescription>
              {t("Check the selected key's group or refresh the page.")}
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <KeyRoundIcon aria-hidden="true" />
          <AlertTitle>{t("Keep the secret in an environment variable")}</AlertTitle>
          <AlertDescription>
            {t(
              "The selected key controls group and model access here; its complete secret is never inserted into generated code.",
            )}
          </AlertDescription>
        </Alert>

        <Tabs onValueChange={(value) => setLanguage(value as CodeLanguage)} value={language}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="typescript">TypeScript</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
            </TabsList>
            <Button disabled={!canCopy} onClick={() => void copyCode()} size="sm" variant="outline">
              <ClipboardIcon data-icon="inline-start" />
              {t("Copy code")}
            </Button>
          </div>
          {(Object.entries(examples) as Array<[CodeLanguage, string]>).map(([key, code]) => (
            <TabsContent key={key} value={key}>
              <pre className="max-h-96 overflow-auto rounded-xl border bg-muted/35 p-4 text-xs leading-6">
                <code>{code}</code>
              </pre>
            </TabsContent>
          ))}
        </Tabs>

        {editingKey && (
          <ApiKeyEditDialog
            apiKey={editingKey}
            key={editingKey.id}
            locale={i18n.resolvedLanguage ?? "en"}
            onOpenChange={(open) => {
              if (!open) setEditingKeyId(null);
            }}
            onSubmit={(input) => updateKey.mutate(input)}
            pending={updateKey.isPending}
            showEnvironment={repository.mode === "demo"}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function buildCodeExamples(baseUrl: string, model: string): Record<CodeLanguage, string> {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const selectedModel = model || "YOUR_MODEL_ID";
  return {
    curl: `curl ${normalizedBaseUrl}/chat/completions \\
  -H "Authorization: Bearer $TOKEN_BOAT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${selectedModel}","messages":[{"role":"user","content":"Hello"}]}'`,
    typescript: `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.TOKEN_BOAT_API_KEY,
  baseURL: "${normalizedBaseUrl}",
});

const response = await client.chat.completions.create({
  model: "${selectedModel}",
  messages: [{ role: "user", content: "Hello" }],
});

console.log(response.choices[0]?.message.content);`,
    python: `import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["TOKEN_BOAT_API_KEY"],
    base_url="${normalizedBaseUrl}",
)

response = client.chat.completions.create(
    model="${selectedModel}",
    messages=[{"role": "user", "content": "Hello"}],
)

print(response.choices[0].message.content)`,
  };
}
