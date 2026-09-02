import { useEffect, useRef, useState } from "react";
import {
  DownloadIcon,
  ImageIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  VideoIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import { Alert, AlertDescription, AlertTitle } from "@token-boat/ui/components/ui/alert";
import { Badge } from "@token-boat/ui/components/ui/badge";
import { Button } from "@token-boat/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@token-boat/ui/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@token-boat/ui/components/ui/field";
import { Input } from "@token-boat/ui/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@token-boat/ui/components/ui/select";
import { Switch } from "@token-boat/ui/components/ui/switch";
import { Textarea } from "@token-boat/ui/components/ui/textarea";
import type {
  PlaygroundImageAsset,
  PlaygroundMode,
  PlaygroundVideoGeneration,
} from "@/data/contracts";
import { repository } from "@/data/repository";

type PlaygroundMediaGeneratorProps = {
  group: string;
  mode: Exclude<PlaygroundMode, "chat">;
  model: string;
};

const imageSizes = ["1024x1024", "1536x1024", "1024x1536"];
const imageQualities = [
  { label: "Automatic", value: "auto" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];
const videoResolutions = ["480p", "720p", "1080p"];
const videoAspectRatios = ["16:9", "9:16", "1:1"];

export function PlaygroundMediaGenerator({ group, mode, model }: PlaygroundMediaGeneratorProps) {
  const { t } = useTranslation();
  const abortRef = useRef<AbortController | null>(null);
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<PlaygroundImageAsset[]>([]);
  const [video, setVideo] = useState<PlaygroundVideoGeneration | null>(null);
  const [imageSize, setImageSize] = useState("1024x1024");
  const [imageQuality, setImageQuality] = useState("auto");
  const [imageCount, setImageCount] = useState(1);
  const [videoDuration, setVideoDuration] = useState(10);
  const [videoResolution, setVideoResolution] = useState("720p");
  const [videoAspectRatio, setVideoAspectRatio] = useState("16:9");
  const [generateAudio, setGenerateAudio] = useState(true);
  const imageQualityLabels: Record<string, string> = {
    auto: t("Automatic"),
    medium: t("Medium"),
    high: t("High"),
  };

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const generate = async () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt || pending) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    setError("");
    setImages([]);
    setVideo(null);

    try {
      if (mode === "image") {
        const result = await repository.generatePlaygroundImages(
          {
            group,
            model,
            prompt: normalizedPrompt,
            size: imageSize,
            quality: imageQuality,
            count: imageCount,
          },
          controller.signal,
        );
        setImages(result.images);
        return;
      }

      let task = await repository.createPlaygroundVideo(
        {
          group,
          model,
          prompt: normalizedPrompt,
          duration: videoDuration,
          resolution: videoResolution,
          aspectRatio: videoAspectRatio,
          generateAudio,
        },
        controller.signal,
      );
      setVideo(task);
      for (let attempt = 0; attempt < 300 && isPendingVideo(task); attempt += 1) {
        await waitForVideoPoll(controller.signal);
        task = await repository.getPlaygroundVideo(task.id, controller.signal);
        setVideo(task);
      }
      if (isPendingVideo(task)) {
        throw new Error(
          t("Video generation is still processing. Check the task center for updates."),
        );
      }
      if (task.status !== "completed" || task.unsignedUrls.length === 0) {
        throw new Error(task.error || t("Video generation failed."));
      }
    } catch (requestError) {
      if (controller.signal.aborted) return;
      setError(
        requestError instanceof Error && requestError.message
          ? requestError.message
          : t("Generation failed. Review the parameters and try again."),
      );
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPending(false);
      }
    }
  };

  const mediaTitle = mode === "image" ? t("Image generation") : t("Video generation");
  const MediaIcon = mode === "image" ? ImageIcon : VideoIcon;

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-muted/10 p-4 sm:p-6">
      <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]">
        <Card className="h-fit">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="flex items-center gap-2">
                <MediaIcon aria-hidden="true" />
                {mediaTitle}
              </CardTitle>
              <Badge variant="outline">{model}</Badge>
            </div>
            <CardDescription>
              {mode === "image"
                ? t(
                    "Describe the image, choose output settings, and generate it with your account pricing.",
                  )
                : t(
                    "Describe the scene, choose video settings, and track the generation task here.",
                  )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={!prompt.trim() && undefined}>
                <FieldLabel htmlFor="playground-media-prompt">{t("Prompt")}</FieldLabel>
                <Textarea
                  className="min-h-36 resize-y"
                  id="playground-media-prompt"
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={
                    mode === "image"
                      ? t("Describe the image you want to create…")
                      : t("Describe the video scene, motion, and camera direction…")
                  }
                  value={prompt}
                />
                <FieldDescription>
                  {t(
                    "Be specific about subject, style, composition, lighting, and motion when relevant.",
                  )}
                </FieldDescription>
              </Field>

              {mode === "image" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="playground-image-size">{t("Image size")}</FieldLabel>
                    <Select
                      items={imageSizes.map((value) => ({ label: value, value }))}
                      onValueChange={(value) => value && setImageSize(value)}
                      value={imageSize}
                    >
                      <SelectTrigger className="w-full" id="playground-image-size">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {imageSizes.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="playground-image-quality">{t("Quality")}</FieldLabel>
                    <Select
                      items={imageQualities.map((item) => ({
                        label: imageQualityLabels[item.value] ?? item.label,
                        value: item.value,
                      }))}
                      onValueChange={(value) => value && setImageQuality(value)}
                      value={imageQuality}
                    >
                      <SelectTrigger className="w-full" id="playground-image-quality">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {imageQualities.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {imageQualityLabels[item.value] ?? item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field className="sm:col-span-2">
                    <FieldLabel htmlFor="playground-image-count">
                      {t("Number of images")}
                    </FieldLabel>
                    <Input
                      id="playground-image-count"
                      max={4}
                      min={1}
                      onChange={(event) =>
                        setImageCount(Math.min(4, Math.max(1, Number(event.target.value))))
                      }
                      type="number"
                      value={imageCount}
                    />
                    <FieldDescription>
                      {t("Generate between 1 and 4 images per request.")}
                    </FieldDescription>
                  </Field>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="playground-video-duration">
                      {t("Duration (seconds)")}
                    </FieldLabel>
                    <Input
                      id="playground-video-duration"
                      max={60}
                      min={1}
                      onChange={(event) =>
                        setVideoDuration(Math.min(60, Math.max(1, Number(event.target.value))))
                      }
                      type="number"
                      value={videoDuration}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="playground-video-resolution">{t("Resolution")}</FieldLabel>
                    <Select
                      items={videoResolutions.map((value) => ({ label: value, value }))}
                      onValueChange={(value) => value && setVideoResolution(value)}
                      value={videoResolution}
                    >
                      <SelectTrigger className="w-full" id="playground-video-resolution">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {videoResolutions.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="playground-video-aspect-ratio">
                      {t("Aspect ratio")}
                    </FieldLabel>
                    <Select
                      items={videoAspectRatios.map((value) => ({ label: value, value }))}
                      onValueChange={(value) => value && setVideoAspectRatio(value)}
                      value={videoAspectRatio}
                    >
                      <SelectTrigger className="w-full" id="playground-video-aspect-ratio">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {videoAspectRatios.map((value) => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field orientation="horizontal">
                    <div className="flex-1">
                      <FieldLabel htmlFor="playground-video-audio">
                        {t("Generate audio")}
                      </FieldLabel>
                      <FieldDescription>
                        {t("Request synchronized audio when the model supports it.")}
                      </FieldDescription>
                    </div>
                    <Switch
                      checked={generateAudio}
                      id="playground-video-audio"
                      onCheckedChange={setGenerateAudio}
                    />
                  </Field>
                </div>
              )}
            </FieldGroup>
          </CardContent>
          <CardFooter>
            <Button disabled={pending || !prompt.trim()} onClick={() => void generate()}>
              {pending ? (
                <LoaderCircleIcon className="animate-spin" data-icon="inline-start" />
              ) : (
                <WandSparklesIcon data-icon="inline-start" />
              )}
              {pending ? t("Generating…") : t("Generate")}
            </Button>
          </CardFooter>
        </Card>

        <Card className="min-h-[32rem]">
          <CardHeader>
            <CardTitle>{t("Output")}</CardTitle>
            <CardDescription>
              {t(
                "Generated media uses the selected model, current group, and active sales pricing.",
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-96 flex-1 flex-col">
            {error ? (
              <Alert variant="destructive">
                <TriangleAlertIcon aria-hidden="true" />
                <AlertTitle>{t("Generation failed")}</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : pending && images.length === 0 && !video ? (
              <div
                className="flex flex-1 flex-col items-center justify-center gap-3 text-center"
                role="status"
              >
                <LoaderCircleIcon className="size-9 animate-spin text-primary" aria-hidden="true" />
                <div>
                  <p className="font-medium">
                    {mode === "image" ? t("Generating images…") : t("Generating video…")}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {mode === "image"
                      ? t("The result will appear here when the request completes.")
                      : t(
                          "The task is being polled automatically. You can leave it open while it processes.",
                        )}
                  </p>
                </div>
              </div>
            ) : images.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {images.map((image, index) => (
                  <figure
                    className="overflow-hidden rounded-xl border bg-background"
                    key={`${image.url}:${index}`}
                  >
                    <img
                      alt={image.revisedPrompt || prompt}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      src={image.url}
                    />
                    <figcaption className="flex items-center justify-between gap-3 p-3">
                      <span className="truncate text-xs text-muted-foreground">
                        {t("Image {{number}}", { number: index + 1 })}
                      </span>
                      <Button
                        nativeButton={false}
                        render={
                          <a download={`generated-image-${index + 1}.png`} href={image.url} />
                        }
                        size="xs"
                        variant="outline"
                      >
                        <DownloadIcon data-icon="inline-start" />
                        {t("Download")}
                      </Button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : video?.status === "completed" && video.unsignedUrls.length > 0 ? (
              <div className="flex flex-col gap-4">
                {video.unsignedUrls.map((url, index) => (
                  <div className="overflow-hidden rounded-xl border bg-background" key={url}>
                    <video
                      className="aspect-video w-full bg-black object-contain"
                      controls
                      playsInline
                      preload="metadata"
                    >
                      <source src={url} />
                      {t("Your browser does not support video playback.")}
                    </video>
                    <div className="flex justify-end p-3">
                      <Button
                        nativeButton={false}
                        render={<a download={`generated-video-${index + 1}.mp4`} href={url} />}
                        size="sm"
                        variant="outline"
                      >
                        <DownloadIcon data-icon="inline-start" />
                        {t("Download video")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
                <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <MediaIcon className="size-7" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-medium">{t("Ready to generate")}</p>
                  <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">
                    {t(
                      "Enter a prompt and review the request settings before generating billable media.",
                    )}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function isPendingVideo(video: PlaygroundVideoGeneration): boolean {
  return video.status === "pending" || video.status === "in_progress";
}

function waitForVideoPoll(signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, 2000);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(new DOMException("The request was aborted.", "AbortError"));
      },
      { once: true },
    );
  });
}
